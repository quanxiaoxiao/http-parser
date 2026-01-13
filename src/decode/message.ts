import { Buffer } from 'node:buffer';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { getHeaderValues } from '../headers/headers.js';
import { DEFAULT_CHUNKED_BODY_LIMITS, DEFAULT_FIXED_LENGTH_BODY_LIMITS, DEFAULT_HEADER_LIMITS, DEFAULT_START_LINE_LIMITS, HttpDecodePhase } from '../specs.js';
import type { ChunkedBodyLimits, FixedLengthBodyLimits, HeaderLimits, Headers, RequestStartLine, ResponseStartLine,StartLineLimits } from '../types.js';
import { parseInteger } from '../utils/number.js';
import { type ChunkedBodyState, createChunkedBodyState, decodeChunkedBody, isChunkedBodyFinished } from './chunked-body.js';
import { createFixedLengthBodyState, decodeFixedLengthBody, type FixedLengthBodyState,isFixedLengthBodyFinished } from './fixed-length-body.js';
import { createHeadersState, decodeHeaders, type HeadersState,isHeadersFinished } from './headers.js';
import { decodeHttpLine } from './http-line.js';
import { decodeRequestStartLine, decodeResponseStartLine } from './start-line.js';

const CRLF_LENGTH = 2;
const EMPTY_BUFFER = Buffer.alloc(0);

interface BodyStrategy {
  type: 'chunked' | 'fixed' | 'close-delimited' | 'upgrade' | 'none';
  length?: number;
  protocol?: string; // for Upgrade
}

interface HttpParserConfig {
  headerLimits: HeaderLimits;
  startLineLimits: StartLineLimits;
  chunkedbodylimits: ChunkedBodyLimits;
  fixedLengthBodyLimits: FixedLengthBodyLimits;
}

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
  if (state.type === 'fixed') {
    return isFixedLengthBodyFinished(state as FixedLengthBodyState);
  }
  return isChunkedBodyFinished(state as ChunkedBodyState);
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
  };
}

function takeBuffer<T extends { buffer: Buffer }>(
  from: T,
  to: { buffer: Buffer },
) {
  to.buffer = from.buffer;
  from.buffer = EMPTY_BUFFER;
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

function handleTransferEncoding(
  transferEncodingValues: string[],
  contentLengthValues: string[] | undefined,
): BodyStrategy {
  if (transferEncodingValues.length > 1) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_SYNTAX,
      message: 'multiple Transfer-Encoding headers',
    });
  }

  const encoding = transferEncodingValues[0].toLowerCase();

  if (encoding !== 'chunked') {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.UNSUPPORTED_FEATURE,
      message: `unsupported Transfer-Encoding: ${encoding}`,
    });
  }

  if (contentLengthValues?.length) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_SYNTAX,
      message: 'Content-Length with Transfer-Encoding',
    });
  }

  return { type: 'chunked' };
}

function validateContentLength(length: number | null): asserts length is number {
  if (length == null || length < 0) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_SYNTAX,
      message: 'Content-Length invalid',
    });
  }

  if (!Number.isSafeInteger(length)) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.MESSAGE_TOO_LARGE,
      message: 'Content-Length overflow',
    });
  }
}

function handleContentLength(contentLengthValues: string[]): BodyStrategy {
  if (contentLengthValues.length !== 1) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_SYNTAX,
      message: 'multiple Content-Length headers',
    });
  }

  const length = parseInteger(contentLengthValues[0]);

  validateContentLength(length);

  if (length === 0) {
    return { type: 'none' };
  }

  return {
    type: 'fixed',
    length,
  };
}

export function decideBodyStrategy(state: HttpState): BodyStrategy {
  const { headers } = state.parsing.headers;

  const contentLengthValues = getHeaderValues(headers, 'content-length');
  const transferEncodingValues = getHeaderValues(headers, 'transfer-encoding');

  if (transferEncodingValues?.length) {
    return handleTransferEncoding(transferEncodingValues, contentLengthValues);
  }

  if (contentLengthValues?.length) {
    return handleContentLength(contentLengthValues);
  }

  return { type: 'none' };
}

type StartLineMap = {
  request: RequestStartLine;
  response: ResponseStartLine;
};

export interface HttpState<T extends 'request' | 'response' = 'request' | 'response'> {
  readonly messageType: T;
  readonly config: HttpParserConfig;
  phase: HttpDecodePhase;
  buffer: Buffer;
  error?: Error,
  parsing: {
    startLine: StartLineMap[T] | null;
    headers: HeadersState | null;
    body: ChunkedBodyState | FixedLengthBodyState | null;
  },
  events: HttpDecodeEvent[];
}

export type HttpRequestState = HttpState<'request'>;
export type HttpResponseState = HttpState<'response'>;

export function createHttpState(messageType: 'request' | 'response'): HttpState {
  return {
    messageType,
    phase: HttpDecodePhase.START_LINE,
    config: {
      headerLimits: DEFAULT_HEADER_LIMITS,
      startLineLimits: DEFAULT_START_LINE_LIMITS,
      chunkedbodylimits: DEFAULT_CHUNKED_BODY_LIMITS,
      fixedLengthBodyLimits: DEFAULT_FIXED_LENGTH_BODY_LIMITS,
    },
    buffer: EMPTY_BUFFER,
    parsing: {
      startLine: null,
      headers: null,
      body: null,
    },
    events: [],
  };
};

export function createRequestState(): HttpRequestState {
  return createHttpState('request') as HttpRequestState;
}

export function createResponseState(): HttpResponseState {
  return createHttpState('response') as HttpResponseState;
}

function handleStartLinePhase(state: HttpState): void {
  const parseLineFn = state.messageType === 'request'
    ? decodeRequestStartLine
    : decodeResponseStartLine;
  let lineBuf: Buffer | null;
  try {
    lineBuf = decodeHttpLine(state.buffer, 0, state.config.startLineLimits.maxStartLineBytes);
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

  const startLine = parseLineFn(lineBuf.toString(), state.config.startLineLimits);
  state.parsing.startLine = startLine;
  state.buffer = state.buffer.subarray(lineBuf.length + CRLF_LENGTH);

  addEvent(state, {
    type: 'start-line-complete',
    raw: startLine.raw!,
  });

  if (state.messageType === 'request') {
    const requestStartLine = state.parsing.startLine as RequestStartLine;
    addEvent(state, {
      type: 'start-line-parsed',
      version: requestStartLine.version!,
      path: requestStartLine.path!,
      method: requestStartLine.method!,
    });
  } else {
    const responseStartLine = state.parsing.startLine as ResponseStartLine;
    addEvent(state, {
      type: 'start-line-parsed',
      version: responseStartLine.version!,
      statusCode: responseStartLine.statusCode!,
      statusText: responseStartLine.statusText!,
    });
  }

  transition(state, HttpDecodePhase.HEADERS);
}

function handleHeadersPhase(state: HttpState): void {
  if (!state.parsing.headers) {
    state.parsing.headers = createHeadersState(state.config.headerLimits);
  }
  const prevLineCount = state.parsing.headers.rawHeaders.length;
  state.parsing.headers = decodeHeaders(state.parsing.headers!, state.buffer);

  for (let i = prevLineCount; i < state.parsing.headers.rawHeaders.length; i++) {
    const headerLine = state.parsing.headers.rawHeaders[i]!;

    addEvent(state, {
      type: 'header-line',
      name: headerLine[0],
      value: headerLine[1],
      index: i,
    });
  }

  if (!isHeadersFinished(state.parsing.headers)) {
    state.buffer = EMPTY_BUFFER;
    return;
  }

  addEvent(state, {
    type: 'headers-complete',
    count: state.parsing.headers.rawHeaders.length,
  });

  addEvent(state, {
    type: 'headers-normalized',
    headers: state.parsing.headers.headers,
  });

  const bodyStrategy = decideBodyStrategy(state);
  switch (bodyStrategy.type) {
  case 'chunked': {
    state.parsing.body = createChunkedBodyState(state.config.chunkedbodylimits);
    transition(state, HttpDecodePhase.BODY_CHUNKED);
    break;
  }
  case 'fixed': {
    state.parsing.body = createFixedLengthBodyState(bodyStrategy.length, state.config.fixedLengthBodyLimits);
    transition(state, HttpDecodePhase.BODY_FIXED_LENGTH);
    break;
  }
  default: {
    transition(state, HttpDecodePhase.FINISHED);
  }
  }
  takeBuffer(state.parsing.headers, state);
}

function handleBodyPhase<T extends ChunkedBodyState | FixedLengthBodyState>(
  state: HttpState,
  parser: (bodyState: T, buffer: Buffer) => T,
): void {
  const bodyState = parser(
    state.parsing.body as T,
    state.buffer,
  );

  const previousSize = state.parsing.body!.decodedBodyBytes;
  const consumed = bodyState.decodedBodyBytes - previousSize;
  if (consumed > 0) {
    addEvent(state, {
      type: 'body-data',
      size: consumed,
      offset: previousSize,
    });
  }
  if (!isBodyFinished(bodyState)) {
    state.buffer = EMPTY_BUFFER;
    state.parsing.body = bodyState;
    return;
  }

  addEvent(state, {
    type: 'body-complete',
    totalSize: bodyState.decodedBodyBytes,
  });

  state.parsing.body = bodyState;
  takeBuffer(state.parsing.body, state);
  transition(state, HttpDecodePhase.FINISHED);
}

const PHASE_HANDLERS: Record<HttpDecodePhase, (state: HttpState) => void> = {
  [HttpDecodePhase.START_LINE]: handleStartLinePhase,
  [HttpDecodePhase.HEADERS]: handleHeadersPhase,
  [HttpDecodePhase.BODY_CHUNKED]: (state) => handleBodyPhase(state, decodeChunkedBody),
  [HttpDecodePhase.BODY_FIXED_LENGTH]: (state) => handleBodyPhase(state, decodeFixedLengthBody),
  [HttpDecodePhase.FINISHED]: () => {},
};

function runStateMachine(state: HttpState): void {
  while (state.phase !== HttpDecodePhase.FINISHED) {
    const prev = state.phase;
    PHASE_HANDLERS[state.phase](state);
    if (state.phase === prev) {
      break;
    }
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
