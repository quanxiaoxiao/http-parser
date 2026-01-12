import { Buffer } from 'node:buffer';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { isChunked } from '../headers/header-predicates.js';
import { getHeaderValue } from '../headers/headers.js';
import { DEFAULT_HEADER_LIMITS, DEFAULT_START_LINE_LIMITS, HttpDecodePhase } from '../specs.js';
import type { Headers, RequestStartLine, ResponseStartLine } from '../types.js';
import { parseInteger } from '../utils/number.js';
import { type ChunkedBodyState, createChunkedBodyState, decodeChunkedBody, isChunkedBodyFinished } from './chunked-body.js';
import { createFixedLengthBodyState, decodeFixedLengthBody, type FixedLengthBodyState,isFixedLengthBodyFinished } from './fixed-length-body.js';
import { createHeadersState, decodeHeaders, type HeadersState,isHeadersFinished } from './headers.js';
import { decodeHttpLine } from './http-line.js';
import { decodeRequestStartLine, decodeResponseStartLine } from './start-line.js';

const CRLF_LENGTH = 2;
const EMPTY_BUFFER = Buffer.alloc(0);

type HttpDecodeMode = 'request' | 'response';

export type HttpDecodeEvent =
  | { type: 'phase-enter'; phase: HttpDecodePhase, reason?: string; value?: number; limits?: Record<string, number> }
  | { type: 'start-line-complete'; raw: string }
  | { type: 'start-line-parsed'; method?: string; path?: string; version: number; statusCode?: number; statusText?: string }
  | { type: 'header-line'; name: string; value: string; index: number; }
  | { type: 'headers-complete'; count: number }
  | { type: 'headers-normalized'; headers: Headers }
  | { type: 'body-data'; size: number; offset: number }
  | { type: 'body-complete'; totalSize: number }
  | { type: 'message-complete' };

function isBodyFinished(state: ChunkedBodyState | FixedLengthBodyState): boolean {
  switch (state.type) {
  case 'fixed':
    return isFixedLengthBodyFinished(state);
  case 'chunked':
    return isChunkedBodyFinished(state);
  default:
    throw new Error(`Unexpected body state: ${JSON.stringify(state)}`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addEvent(state: HttpState, event: HttpDecodeEvent): void {
  state.events.push(event);
}

function forkState(prev: HttpState): HttpState {
  return {
    ...prev,
    events: [],
    headersState: prev.headersState,
    bodyState: prev.bodyState,
  };
}

function transition(state: HttpState, next: HttpDecodePhase): void {
  if (state.phase === next) {
    return;
  }
  state.phase = next;
  addEvent(state, {
    type: 'phase-enter',
    phase: next,
  });
  if (next === HttpDecodePhase.FINISHED) {
    addEvent(state, {
      type: 'message-complete',
    });
  }
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
    transition(state, HttpDecodePhase.BODY_FIXED_LENGTH);
  } else {
    transition(state, HttpDecodePhase.FINISHED);
  }
}

export interface HttpState {
  mode: HttpDecodeMode,
  phase: HttpDecodePhase;
  buffer: Buffer;
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

export function createHttpState(mode: HttpDecodeMode): HttpState {
  return {
    phase: HttpDecodePhase.START_LINE,
    buffer: EMPTY_BUFFER,
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

function handleStartLinePhase(state: HttpState): void {
  const parseLineFn = state.mode === 'request'
    ? decodeRequestStartLine
    : decodeResponseStartLine;
  let lineBuf: Buffer | null;
  try {
    lineBuf = decodeHttpLine(state.buffer, 0, DEFAULT_START_LINE_LIMITS.maxStartLineBytes);
  } catch (error) {
    if (error instanceof HttpDecodeError) {
      if (error.code === HttpDecodeErrorCode.LINE_TOO_LARGE) {
        throw new HttpDecodeError({
          code: HttpDecodeErrorCode.START_LINE_TOO_LARGE,
          message: 'HTTP start-line too large',
        });
      }
      throw error;
    }
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INTERNAL_ERROR,
      message: `HTTP parse failed at phase "start-line". Reason: ${formatError(error)}`,
    });
  }

  if (!lineBuf) {
    return;
  }

  const startLine = parseLineFn(lineBuf.toString());
  state.startLine = startLine;
  state.buffer = state.buffer.subarray(lineBuf.length + CRLF_LENGTH);

  addEvent(state, {
    type: 'start-line-complete',
    raw: state.startLine.raw,
  });

  addEvent(state, {
    type: 'start-line-parsed',
    version: state.startLine.version,
    path: state.startLine.path,
    method: state.startLine.method,
  });

  transition(state, HttpDecodePhase.HEADERS);
}

function handleHeadersPhase(state: HttpState): void {
  if (!state.headersState) {
    state.headersState = createHeadersState(DEFAULT_HEADER_LIMITS);
  }
  const prevLineCount = state.headersState.rawHeaders.length;
  state.headersState = decodeHeaders(state.headersState!, state.buffer);

  for (let i = prevLineCount; i < state.headersState.rawHeaders.length; i++) {
    const [headerName, headerValue] = state.headersState.rawHeaders[i];

    addEvent(state, {
      type: 'header-line',
      name: headerName,
      value: headerValue,
      index: i,
    });
  }

  if (!isHeadersFinished(state.headersState)) {
    state.buffer = EMPTY_BUFFER;
    return;
  }

  addEvent(state, {
    type: 'headers-complete',
    count: state.headersState.rawHeaders.length,
  });

  addEvent(state, {
    type: 'headers-normalized',
    headers: state.headersState.headers,
  });

  determineBodyPhase(state, state.headersState);

  state.buffer = state.headersState.buffer;
  state.headersState.buffer = EMPTY_BUFFER;
}

function handleBodyPhase<T extends ChunkedBodyState | FixedLengthBodyState>(
  state: HttpState,
  parser: (bodyState: T, buffer: Buffer) => T,
): void {
  const bodyState = parser(
    state.bodyState as T,
    state.buffer,
  );

  const previousSize = state.bodyState.decodedBodyBytes;
  const delta = bodyState.decodedBodyBytes - previousSize;
  if (delta > 0) {
    addEvent(state, {
      type: 'body-data',
      size: delta,
      offset: previousSize,
    });
  }
  if (!isBodyFinished(bodyState)) {
    state.buffer = EMPTY_BUFFER;
    state.bodyState = bodyState;
    return;
  }

  addEvent(state, {
    type: 'body-complete',
    totalSize: bodyState.decodedBodyBytes,
  });

  state.bodyState = {
    ...bodyState,
    buffer: EMPTY_BUFFER,
  };
  state.buffer = bodyState.buffer;
  transition(state, HttpDecodePhase.FINISHED);
}

function runStateMachine(state: HttpState): void {
  while (state.phase !== HttpDecodePhase.FINISHED) {
    const previousPhase = state.phase;
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
    case HttpDecodePhase.BODY_FIXED_LENGTH:
      handleBodyPhase(state, decodeFixedLengthBody);
      break;
    case HttpDecodePhase.FINISHED:
      return;
    default:
      throw new Error(`Unknown phase: ${state.phase}`);
    }

    if (state.phase === previousPhase) break;
  }
}

function decodeHttp(
  prev: HttpState,
  input: Buffer,
): HttpState {
  if (prev.phase === HttpDecodePhase.FINISHED) {
    throw new Error('Decoding already finished');
  }

  if (prev.error) {
    throw new Error(`Decoding encountered error: "${prev.error.message}"`);
  }

  const state = forkState(prev);
  if (input.length > 0) {
    state.buffer = Buffer.concat([state.buffer, input]);
  }

  try {
    runStateMachine(state);
  } catch (error) {
    state.error = error instanceof HttpDecodeError
      ? error
      : new HttpDecodeError({
        code: HttpDecodeErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
  }

  return state;
}

export function decodeRequest(
  prev: HttpRequestState | null,
  input: Buffer,
): HttpRequestState {
  const prevState = prev ?? createRequestState();
  return decodeHttp(prevState, input) as HttpRequestState;
}

export function decodeResponse(
  prev: HttpResponseState | null,
  input: Buffer,
): HttpResponseState {
  const prevState = prev ?? createResponseState();
  return decodeHttp(prevState, input) as HttpResponseState;
}

export function isMessageFinished(state: HttpState) {
  return state.phase === HttpDecodePhase.FINISHED;
}
