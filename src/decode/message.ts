import { Buffer } from 'node:buffer';

import { DecodeHttpError } from '../errors.js';
import { isChunked } from '../headers/header-predicates.js';
import { getHeaderValue } from '../headers/headers.js';
import parseInteger from '../parseInteger.js';
import type { Headers, HttpParserHooks, RequestStartLine, ResponseStartLine } from '../types.js';
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
  | { type: 'header-line'; name: string; value: string }
  | { type: 'headers-complete'; headers: Headers }
  | { type: 'body-chunk'; size: number }
  | { type: 'body-complete'; totalSize: number }
  | { type: 'request-complete' };

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

function updateState(
  state: HttpState,
  updates: Partial<HttpState>,
): HttpState {
  return { ...state, ...updates };
}

function handleStartLinePhase<T extends HttpState>(
  state: T,
  parseLineFn: (line: string) => RequestStartLine | ResponseStartLine,
  hookFn: ((startLine: ResponseStartLine | ResponseStartLine) => void) | undefined,
  hooks?: HttpParserHooks,
): T {
  if (!state.startLine) {
    hooks?.onMessageBegin?.();
  }

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
  hookFn?.(startLine);

  const endOfLine = lineBuf.length + CRLF_LENGTH;

  return updateState(state, {
    buffer: state.buffer.subarray(endOfLine),
    startLine,
    phase: HttpDecodePhase.HEADERS,
  }) as T;
}

function handleRequestStartLinePhase(
  state: HttpRequestState,
  hooks?: HttpParserHooks,
): HttpRequestState {
  return handleStartLinePhase(
    state,
    decodeRequestStartLine,
    hooks?.onRequestStartLine,
    hooks,
  );
}

function handleResponseStartLinePhase(
  state: HttpResponseState,
  hooks?: HttpParserHooks,
): HttpResponseState {
  return handleStartLinePhase(
    state,
    decodeResponseStartLine,
    hooks?.onResponseStartLine,
    hooks,
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

function handleHeadersPhase(state: HttpState, hooks?: HttpParserHooks): HttpState {
  if (!state.headersState) {
    state.headersState = createHeadersState();
    hooks?.onHeadersBegin?.();
  }
  const headersState = decodeHeaders(state.headersState!, state.buffer, hooks?.onHeader);

  if (headersState.bytesReceived > MAX_HEADER_SIZE) {
    throw new DecodeHttpError(`Headers too large: ${headersState.bytesReceived} bytes exceeds limit of ${MAX_HEADER_SIZE}`);
  }

  if (!headersState.finished) {
    return updateState(state, {
      buffer: EMPTY_BUFFER,
      headersState,
    });
  }

  hooks?.onHeadersComplete?.(headersState.headers);

  const nextPhase = determineBodyPhase(headersState.headers);

  return updateState(state, {
    buffer: headersState.buffer,
    headersState: { ...headersState, buffer: EMPTY_BUFFER },
    ...nextPhase,
  });
}

function handleBodyPhase<T extends ChunkedBodyState | FixedLengthBodyState>(
  state: HttpState,
  parser: (bodyState: T, buffer: Buffer, onBody?: (buffer: Buffer) => void) => T,
  hooks?: HttpParserHooks,
): HttpState {
  const bodyState = parser(
    state.bodyState as T,
    state.buffer,
    hooks?.onBody,
  );

  if (!bodyState.finished) {
    return updateState(state, {
      buffer: Buffer.alloc(0),
      bodyState,
    });
  }

  hooks?.onBodyComplete?.();

  return updateState(state, {
    finished: true,
    bodyState: { ...bodyState, buffer: Buffer.alloc(0) },
    buffer: bodyState.buffer,
  });
}

function handleBodyChunkedPhase(state: HttpState, hooks?: HttpParserHooks): HttpState {
  if (!state.bodyState) {
    state.bodyState = createChunkedBodyState();
    hooks?.onBodyBegin?.();
  }
  return handleBodyPhase(state, decodeChunkedBody, hooks);
}

function handleBodyContentLengthPhase(state: HttpState, hooks?: HttpParserHooks): HttpState {
  if (!state.bodyState) {
    const contentLength = getContentLength(state.headersState!.headers);
    if (contentLength === null) {
      throw new DecodeHttpError('Content-Length not found or invalid');
    }
    state.bodyState = createFixedLengthBodyState(contentLength!);
    hooks?.onBodyBegin?.();
  }
  return handleBodyPhase(state, decodeFixedLengthBody, hooks);
}

const requestPhaseHandlers = new Map<
  HttpDecodePhase,
  (state: HttpState, hooks?: HttpParserHooks) => HttpState
    >([
      [HttpDecodePhase.STARTLINE, handleRequestStartLinePhase],
      [HttpDecodePhase.HEADERS, handleHeadersPhase],
      [HttpDecodePhase.BODY_CHUNKED, handleBodyChunkedPhase],
      [HttpDecodePhase.BODY_CONTENT_LENGTH, handleBodyContentLengthPhase],
    ]);

const responsePhaseHandlers = new Map<
  HttpDecodePhase,
  (state: HttpState, hooks?: HttpParserHooks) => HttpState
    >([
      [HttpDecodePhase.STARTLINE, handleResponseStartLinePhase],
      [HttpDecodePhase.HEADERS, handleHeadersPhase],
      [HttpDecodePhase.BODY_CHUNKED, handleBodyChunkedPhase],
      [HttpDecodePhase.BODY_CONTENT_LENGTH, handleBodyContentLengthPhase],
    ]);

function genericParse(
  prev: HttpState,
  input: Buffer,
  phaseHandlers: Map<HttpDecodePhase, (state: HttpState, hooks?: HttpParserHooks) => HttpState>,
  hooks?: HttpParserHooks,
): HttpState {
  if (prev.finished) {
    throw new DecodeHttpError('Decoding already finished');
  }

  if (prev.error) {
    throw new Error(`Decoding encountered error: "${prev.error.message}"`);
  }

  let state: HttpState = input.length > 0
    ? updateState(prev, { buffer: Buffer.concat([prev.buffer, input]) })
    : prev;

  state.events = [];

  while (!state.finished) {
    const prevPhase = state.phase;
    const handler = phaseHandlers.get(state.phase);
    if (!handler) {
      throw new DecodeHttpError(`Unknown phase: ${state.phase}`);
    }
    try {
      state = handler(state, hooks);
    } catch (error) {
      state.error = error as Error;
      hooks?.onError?.(error as Error);
      break;
    }

    if (state.phase === prevPhase) {
      break;
    }
  }

  if (state.error) {
    return state;
  }

  if (state.finished) {
    hooks?.onMessageComplete?.();
  }

  return state;
}

export function decodeRequest(
  prev: HttpRequestState | null,
  input: Buffer,
  hooks?: HttpParserHooks,
): HttpRequestState {
  const prevState = prev ?? createRequestState();
  return genericParse(
    prevState,
    input,
    requestPhaseHandlers,
    hooks,
  );
}

export function decodeResponse(
  prev: HttpResponseState | null,
  input: Buffer,
  hooks?: HttpParserHooks,
): HttpResponseState {
  const prevState = prev ?? createResponseState();
  return genericParse(
    prevState,
    input,
    responsePhaseHandlers,
    hooks,
  );
}
