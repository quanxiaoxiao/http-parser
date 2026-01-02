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

type HttpDecodeMode = 'request' | 'response';

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
  mode: HttpDecodeMode,
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
  mode: 'request',
  startLine: RequestStartLine | null;
}

export interface HttpResponseState extends HttpState {
  mode: 'response',
  startLine: ResponseStartLine | null;
}

function transition(state: HttpState, next: HttpDecodePhase): void {
  if (state.phase === next) {
    return;
  }
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

export function createHttpState(mode: HttpDecodeMode): HttpState {
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
  return createHttpState('request') as HttpRequestState;
}

export function createResponseState(): HttpResponseState {
  return createHttpState('response') as HttpResponseState;
}

function handleStartLinePhase(state: HttpState): HttpState {
  const parseLineFn = state.mode === 'request'
    ? decodeRequestStartLine
    : decodeResponseStartLine;
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
  state.startLine = startLine;
  state.buffer = state.buffer.subarray(lineBuf.length + CRLF_LENGTH);

  state.events.push({
    type: 'start-line-complete',
    raw: state.startLine.raw,
  });

  transition(state, HttpDecodePhase.HEADERS);

  return state;
}

function determineBodyPhase(state: HttpState, headersState: HeadersState): void {
  const { headers } = headersState;

  if (isChunked(headers)) {
    state.bodyState = createChunkedBodyState();
    transition(state, HttpDecodePhase.BODY_CHUNKED);
    return;
  }

  const contentLengthValue = getHeaderValue(headers, 'content-length')?.[0];
  const contentLength = contentLengthValue ? parseInteger(contentLengthValue) : 0;

  if (contentLength > 0) {
    state.bodyState = createFixedLengthBodyState(contentLength);
    transition(state, HttpDecodePhase.BODY_CONTENT_LENGTH);
  } else {
    transition(state, HttpDecodePhase.FINISHED);
  }
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

  determineBodyPhase(state, headersState);

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

  const previousSize = state.bodyState
    ? ('receivedBody' in state.bodyState ? state.bodyState.receivedBody : state.bodyState.totalSize)
    : 0;
  const currentSize = 'receivedBody' in bodyState
    ? bodyState.receivedBody
    : bodyState.totalSize;
  const delta = currentSize - previousSize;
  if (delta > 0) {
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

function runStateMachine(state: HttpState): void {
  let lastPhase: HttpDecodePhase;

  do {
    lastPhase = state.phase;
    switch (state.phase) {
    case HttpDecodePhase.START_LINE:
      handleStartLinePhase(state);
      break;
    case HttpDecodePhase.HEADERS:
      handleHeadersPhase(state);
      break;
    case HttpDecodePhase.BODY_CHUNKED:
      handleBodyPhase(state, decodeChunkedBody);
      break;
    case HttpDecodePhase.BODY_CONTENT_LENGTH:
      handleBodyPhase(state, decodeFixedLengthBody);
      break;
    case HttpDecodePhase.FINISHED:
      return;
    default:
      throw new Error(`Unknown phase: ${state.phase}`);
    }
  } while (state.phase !== lastPhase && !state.finished);
}

function decodeHttp(
  prev: HttpState,
  input: Buffer,
): HttpState {
  if (prev.finished) {
    throw new DecodeHttpError('Decoding already finished');
  }

  if (prev.error) {
    throw new Error(`Decoding encountered error: "${prev.error.message}"`);
  }

  const state = {
    ...prev,
  };
  if (input.length > 0) {
    state.buffer = Buffer.concat([state.buffer, input]);
  }

  state.events = [];

  try {
    runStateMachine(state);
  } catch (error) {
    state.error = error as Error;
  }

  return state;
}

export function decodeRequest(
  prev: HttpRequestState | null,
  input: Buffer,
): HttpRequestState {
  const prevState = prev ?? createRequestState();
  return decodeHttp(
    prevState,
    input,
  );
}

export function decodeResponse(
  prev: HttpResponseState | null,
  input: Buffer,
): HttpResponseState {
  const prevState = prev ?? createResponseState();
  return decodeHttp(
    prevState,
    input,
  );
}
