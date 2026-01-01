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

function createHttpState(): HttpState {
  return {
    phase: HttpDecodePhase.STARTLINE,
    buffer: EMPTY_BUFFER,
    finished: false,
    startLine: null,
    headersState: null,
    bodyState: null,
    events: [],
  };
};

function transition(state: HttpState, next: HttpDecodePhase) {
  if (state.phase !== next) {
    state.phase = next;
    state.events.push({
      type: 'phase-enter',
      phase: next,
    });
  }
}

export function createRequestState(): HttpRequestState {
  return createHttpState();
}

export function createResponseState(): HttpResponseState {
  return createHttpState();
}

function handleStartLinePhase<T extends HttpState>(
  state: T,
  parseLineFn: (line: string) => RequestStartLine | ResponseStartLine,
  hookFn: ((startLine: ResponseStartLine | ResponseStartLine) => void) | undefined,
): T {
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
  hookFn?.(state.startLine);

  state.events.push({
    type: 'start-line-complete',
    raw: state.startLine.raw,
  });

  transition(state, HttpDecodePhase.HEADERS);

  return state;
}

function handleRequestStartLinePhase(
  state: HttpRequestState,
): HttpRequestState {
  return handleStartLinePhase(
    state,
    decodeRequestStartLine,
  );
}

function handleResponseStartLinePhase(
  state: HttpResponseState,
): HttpResponseState {
  return handleStartLinePhase(
    state,
    decodeResponseStartLine,
  );
}

function getContentLength(headers: Headers): number | null {
  const contentLengthValue = getHeaderValue(headers, 'content-length');
  if (!contentLengthValue) {
    return null;
  }
  const length = parseInteger(contentLengthValue[0]);
  return (length != null && length > 0) ? length : null;
}

function determineBodyPhase(headers: Headers): Partial<HttpState> {
  if (isChunked(headers)) {
    return { phase: HttpDecodePhase.BODY_CHUNKED };
  }

  const contentLength = getContentLength(headers);
  if (contentLength) {
    return { phase: HttpDecodePhase.BODY_CONTENT_LENGTH };
  }

  return { finished: true };
}

function handleHeadersPhase(state: HttpState): HttpState {
  if (!state.headersState) {
    state.headersState = createHeadersState();
  }
  const headersState = decodeHeaders(state.headersState!, state.buffer);

  if (headersState.bytesReceived > MAX_HEADER_SIZE) {
    throw new DecodeHttpError(`Headers too large: ${headersState.bytesReceived} bytes exceeds limit of ${MAX_HEADER_SIZE}`);
  }

  if (!headersState.finished) {
    state.buffer = EMPTY_BUFFER;
    state.events.push({
      typ: 'headers-lines',
      rawHeaders: state.headersState ? headersState.rawHeaders : headersState.rawHeaders.slice(state.headersState.rawHeaders.length),
    });
    state.headersState = headersState;
    return state;
  }
  state.events.push({
    type: 'headers-complete',
    headers: state.headersState.headers,
  });

  const nextPhase = determineBodyPhase(headersState.headers);

  state.buffer = headersState.buffer;
  state.headersState = {
    ...headersState,
    buffer: EMPTY_BUFFER,
  };
  if (nextPhase.finished) {
    state.finished = true;
  } else {
    transition(state, nextPhase.phase);
  }
  return state;
}

function handleBodyPhase<T extends ChunkedBodyState | FixedLengthBodyState>(
  state: HttpState,
  parser: (bodyState: T, buffer: Buffer, onBody?: (buffer: Buffer) => void) => T,
): HttpState {
  const bodyState = parser(
    state.bodyState as T,
    state.buffer,
  );

  if (!bodyState.finished) {
    state.events.push({
      type: 'body-chunk',
      size: bodyState.contentLength != null ? bodyState.receivedBody - (state.bodyState?.receivedBody ?? 0) : bodyState.totalSize - (state.bodyState?.totalSize ?? 0),
    });
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
  state.finished = true;
  state.buffer = bodyState.buffer;

  return state;
}

function handleBodyChunkedPhase(state: HttpState): HttpState {
  if (!state.bodyState) {
    state.bodyState = createChunkedBodyState();
  }
  return handleBodyPhase(state, decodeChunkedBody);
}

function handleBodyContentLengthPhase(state: HttpState): HttpState {
  if (!state.bodyState) {
    const contentLength = getContentLength(state.headersState!.headers);
    if (contentLength === null) {
      throw new DecodeHttpError('Content-Length not found or invalid');
    }
    state.bodyState = createFixedLengthBodyState(contentLength!);
  }
  return handleBodyPhase(state, decodeFixedLengthBody);
}

const requestPhaseHandlers = new Map<
  HttpDecodePhase,
  (state: HttpState) => HttpState
    >([
      [HttpDecodePhase.STARTLINE, handleRequestStartLinePhase],
      [HttpDecodePhase.HEADERS, handleHeadersPhase],
      [HttpDecodePhase.BODY_CHUNKED, handleBodyChunkedPhase],
      [HttpDecodePhase.BODY_CONTENT_LENGTH, handleBodyContentLengthPhase],
    ]);

const responsePhaseHandlers = new Map<
  HttpDecodePhase,
  (state: HttpState) => HttpState
    >([
      [HttpDecodePhase.STARTLINE, handleResponseStartLinePhase],
      [HttpDecodePhase.HEADERS, handleHeadersPhase],
      [HttpDecodePhase.BODY_CHUNKED, handleBodyChunkedPhase],
      [HttpDecodePhase.BODY_CONTENT_LENGTH, handleBodyContentLengthPhase],
    ]);

function genericParse(
  prev: HttpState,
  input: Buffer,
  phaseHandlers: Map<HttpDecodePhase, (state: HttpState) => HttpState>,
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
    requestPhaseHandlers,
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
    responsePhaseHandlers,
  );
}
