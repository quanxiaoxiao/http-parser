import { Buffer } from 'node:buffer';

import { DecodeHttpError } from '../errors.js';
import { isChunked } from '../headers/header-predicates.js';
import { getHeaderValue } from '../headers/headers.js';
import parseInteger from '../parseInteger.js';
import type { Headers, RequestStartLine, ResponseStartLine } from '../types.js';
import { type ChunkedBodyState, createChunkedBodyState, decodeChunkedBody } from './chunked-body.js';
import { createFixedLengthBodyState, decodeFixedLengthBody,type FixedLengthBodyState } from './fixed-length-body.js';
import { createHeadersState, decodeHeaders,type HeadersState } from './headers.js';
import { decodeHttpLine } from './http-line.js';
import { decodeRequestStartLine, decodeResponseStartLine } from './start-line.js';

const CRLF_LENGTH = 2;
const MAX_HEADER_SIZE = 16 * 1024;
const MAX_START_LINE_SIZE = 16 * 1024;
const EMPTY_BUFFER = Buffer.alloc(0);

export enum HttpDecodePhase {
  START_LINE = 'start-line',
  HEADERS = 'headers',
  BODY_CHUNKED = 'body-chunked',
  BODY_CONTENT_LENGTH = 'body-content-length',
  FINISHED = 'finished',
}

export type TransitionResult =
  | { type: 'need-more-data' }
  | { type: 'stay' }
  | { type: 'transition'; next: HttpDecodePhase }
  | { type: 'finish' };

export type HttpDecodeEvent =
  | { type: 'phase-enter'; phase: HttpDecodePhase }
  | { type: 'start-line-complete'; raw: string }
  | { type: 'headers-lines'; rawHeaders: string[] }
  | { type: 'headers-complete'; headers: Headers }
  | { type: 'body-chunk'; size: number }
  | { type: 'body-complete'; totalSize: number }
  | { type: 'message-complete' };

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface HttpState {
  phase: HttpDecodePhase;
  buffer: Buffer;
  finished: boolean;
  error?: Error,
  startLine: RequestStartLine | ResponseStartLine | null;
  headersState: HeadersState | null;
  bodyState: ChunkedBodyState | FixedLengthBodyState | null;
  events: HttpDecodeEvent[];
}

export interface HttpRequestState extends HttpState {
  startLine: RequestStartLine | null;
}

export interface HttpResponseState extends HttpState {
  startLine: ResponseStartLine | null;
}

function transition(state: HttpState, next: HttpDecodePhase) {
  if (state.phase !== next) {
    state.phase = next;
    state.events.push({
      type: 'phase-enter',
      phase: next,
    });
    if (next === HttpDecodePhase.FINISHED) {
      state.finished = true;
      state.events.push({ type: 'message-complete' });
    }
  }
}

export function createHttpState(mode: 'request' | 'response'): HttpState {
  return {
    phase: HttpDecodePhase.START_LINE,
    buffer: EMPTY_BUFFER,
    finished: false,
    startLine: null,
    headersState: null,
    bodyState: null,
    events: [],
    mode,
  };
};

export function createRequestState(): HttpRequestState {
  return createHttpState('request');
}

export function createResponseState(): HttpResponseState {
  return createHttpState('response');
}

function handleStartLinePhase<T extends HttpState>(state: T): T {
  const parseLineFn = state.mode === 'request' ? decodeRequestStartLine : decodeResponseStartLine;
  let lineBuf: Buffer | null;
  try {
    lineBuf = decodeHttpLine(state.buffer, 0, MAX_START_LINE_SIZE);
  } catch (error) {
    throw new DecodeHttpError(
      `HTTP parse failed at phase "startline". Reason: ${formatError(error)}`,
    );
  }

  if (!lineBuf) {
    return state;
  }

  const startLine = parseLineFn(lineBuf.toString());
  const endOfLine = lineBuf.length + CRLF_LENGTH;
  state.startLine = startLine;
  state.buffer = state.buffer.subarray(endOfLine);

  state.events.push({
    type: 'start-line-complete',
    raw: state.startLine.raw,
  });

  transition(state, HttpDecodePhase.HEADERS);

  return state;
}

function handleHeadersPhase(state: HttpState): HttpState {
  if (!state.headersState) {
    state.headersState = createHeadersState();
  }
  const headersState = decodeHeaders(state.headersState!, state.buffer);

  if (headersState.bytesReceived > MAX_HEADER_SIZE) {
    throw new DecodeHttpError(`Headers too large: ${headersState.bytesReceived} bytes exceeds limit of ${MAX_HEADER_SIZE}`);
  }

  const newLines = headersState.rawHeaders.slice(state.headersState.rawHeaders.length);
  if (newLines.length > 0) {
    state.events.push({ type: 'headers-lines', rawHeaders: newLines });
  }
  state.headersState = headersState;

  if (!headersState.finished) {
    state.buffer = EMPTY_BUFFER;
    return state;
  }
  state.events.push({
    type: 'headers-complete',
    headers: state.headersState.headers,
  });

  const headers = headersState.headers;
  if (isChunked(headers)) {
    state.bodyState = createChunkedBodyState();
    transition(state, HttpDecodePhase.BODY_CHUNKED);
  } else {
    const clValue = getHeaderValue(headers, 'content-length')?.[0];
    const cl = clValue ? parseInteger(clValue) : 0;
    if (cl && cl > 0) {
      state.bodyState = createFixedLengthBodyState(cl);
      transition(state, HttpDecodePhase.BODY_CONTENT_LENGTH);
    } else {
      transition(state, HttpDecodePhase.FINISHED);
    }
  }

  state.buffer = headersState.buffer;
  state.headersState = {
    ...headersState,
    buffer: EMPTY_BUFFER,
  };
  return state;
}

function handleBodyPhase<T extends ChunkedBodyState | FixedLengthBodyState>(
  state: HttpState,
  parser: (bodyState: T, buffer: Buffer) => T,
): HttpState {
  const bodyState = parser(
    state.bodyState as T,
    state.buffer,
  );

  const delta = bodyState.contentLength != null ? bodyState.receivedBody - (state.bodyState?.receivedBody ?? 0) : bodyState.totalSize - (state.bodyState?.totalSize ?? 0);
  if (delta) {
    state.events.push({
      type: 'body-chunk',
      size: delta,
    });
  }
  if (!bodyState.finished) {
    state.buffer = EMPTY_BUFFER;
    state.bodyState = bodyState;
    return state;
  }

  state.events.push({
    type: 'body-complete',
    totalSize: bodyState.contentLength != null ? bodyState.contentLength : bodyState.totalSize,
  });
  state.bodyState = {
    ...bodyState,
    buffer: EMPTY_BUFFER,
  };
  state.buffer = bodyState.buffer;
  transition(state, HttpDecodePhase.FINISHED);

  return state;
}

function handleBodyChunkedPhase(state: HttpState): HttpState {
  return handleBodyPhase(state, decodeChunkedBody);
}

function handleBodyContentLengthPhase(state: HttpState): HttpState {
  return handleBodyPhase(state, decodeFixedLengthBody);
}

const phaseHandlers = new Map<
  HttpDecodePhase,
  (state: HttpState) => HttpState
    >([
      [HttpDecodePhase.START_LINE, handleStartLinePhase],
      [HttpDecodePhase.HEADERS, handleHeadersPhase],
      [HttpDecodePhase.BODY_CHUNKED, handleBodyChunkedPhase],
      [HttpDecodePhase.BODY_CONTENT_LENGTH, handleBodyContentLengthPhase],
    ]);

function genericParse(
  prev: HttpState,
  input: Buffer,
): HttpState {
  if (prev.finished) {
    throw new DecodeHttpError('Decoding already finished');
  }

  if (prev.error) {
    throw new Error(`Decoding encountered error: "${prev.error.message}"`);
  }

  const state = prev;
  if (input.length > 0) {
    state.buffer = Buffer.concat([state.buffer, input]);
  }

  state.events = [];

  while (!state.finished) {
    const prevPhase = state.phase;
    const handler = phaseHandlers.get(state.phase);
    if (!handler) {
      throw new DecodeHttpError(`Unknown phase: ${state.phase}`);
    }
    try {
      handler(state);
    } catch (error) {
      state.error = error as Error;
      break;
    }

    if (state.phase === prevPhase) {
      break;
    }
  }

  if (state.error) {
    return state;
  }

  return state;
}

export function decodeRequest(
  prev: HttpRequestState | null,
  input: Buffer,
): HttpRequestState {
  const prevState = prev ?? createRequestState();
  return genericParse(
    prevState,
    input,
  );
}

export function decodeResponse(
  prev: HttpResponseState | null,
  input: Buffer,
): HttpResponseState {
  const prevState = prev ?? createResponseState();
  return genericParse(
    prevState,
    input,
  );
}
