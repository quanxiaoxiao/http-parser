import { Buffer } from 'node:buffer';

import { decodeHttpLine } from '../decodeHttpLine.js';
import { DecodeHttpError } from '../errors.js';
import parseInteger from '../parseInteger.js';
import { type Headers, type HttpParsePhase, type HttpParserHooks, type RequestStartLine,type ResponseStartLine } from '../types.js';
import { type ChunkedState, createChunkedState, parseChunked } from './parseChunked.js';
import { type ContentLengthState, createContentLengthState, parseContentLength } from './parseContentLength.js';
import { createHeadersState, type HeadersState, parseHeaders } from './parseHeaders.js';
import parseRequestLine from './parseRequestLine.js';
import parseResponseLine from './parseResponseLine.js';

const CRLF_LENGTH = 2;
const MAX_HEADER_SIZE = 16 * 1024;
const MAX_START_LINE_SIZE = 16 * 1024;
const EMPTY_BUFFER = Buffer.alloc(0);

function getHeaderValue(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface HttpState {
  phase: HttpParsePhase;
  buffer: Buffer;
  finished: boolean;
  error?: Error,
  startLine: RequestStartLine | ResponseStartLine | null;
  headersState: HeadersState | null;
  bodyState: ChunkedState | ContentLengthState | null;
}

export interface HttpRequestState extends HttpState {
  startLine: RequestStartLine | null;
}

export interface HttpResponseState extends HttpState {
  startLine: ResponseStartLine | null;
}

function createHttpState(): HttpState {
  return {
    phase: 'STARTLINE',
    buffer: EMPTY_BUFFER,
    finished: false,
    startLine: null,
    headersState: null,
    bodyState: null,
  };
};

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
    phase: 'HEADERS',
  }) as T;
}

function handleRequestStartLinePhase(
  state: HttpRequestState,
  hooks?: HttpParserHooks,
): HttpRequestState {
  return handleStartLinePhase(
    state,
    parseRequestLine,
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
    parseResponseLine,
    hooks?.onResponseStartLine,
    hooks,
  );
}

function isChunkedEncoding(headers: Headers): boolean {
  const transferEncoding = getHeaderValue(headers, 'transfer-encoding');
  return transferEncoding?.toLowerCase().includes('chunked') ?? false;
}

function getContentLength(headers: Headers): number | null {
  const contentLengthValue = getHeaderValue(headers, 'content-length');
  if (!contentLengthValue) return null;
  const length = parseInteger(contentLengthValue);
  return (length != null && length > 0) ? length : null;
}

function determineBodyPhase(headers: Headers): Partial<HttpState> {
  if (isChunkedEncoding(headers)) {
    return { phase: 'BODY_CHUNKED' };
  }

  const contentLength = getContentLength(headers);
  if (contentLength) {
    return { phase: 'BODY_CONTENT_LENGTH' };
  }

  return { finished: true };
}

function handleHeadersPhase(state: HttpState, hooks?: HttpParserHooks): HttpState {
  if (!state.headersState) {
    state.headersState = createHeadersState();
    hooks?.onHeadersBegin?.();
  }
  const headersState = parseHeaders(state.headersState!, state.buffer, hooks?.onHeader);

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

function handleBodyPhase<T extends ChunkedState | ContentLengthState>(
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
    state.bodyState = createChunkedState();
    hooks?.onBodyBegin?.();
  }
  return handleBodyPhase(state, parseChunked, hooks);
}

function handleBodyContentLengthPhase(state: HttpState, hooks?: HttpParserHooks): HttpState {
  if (!state.bodyState) {
    const contentLength = getContentLength(state.headersState!.headers);
    if (contentLength === null) {
      throw new DecodeHttpError('Content-Length not found or invalid');
    }
    state.bodyState = createContentLengthState(contentLength!);
    hooks?.onBodyBegin?.();
  }
  return handleBodyPhase(state, parseContentLength, hooks);
}

const requestPhaseHandlers = new Map<
  HttpParsePhase,
  (state: HttpState, hooks?: HttpParserHooks) => HttpState
    >([
      ['STARTLINE', handleRequestStartLinePhase],
      ['HEADERS', handleHeadersPhase],
      ['BODY_CHUNKED', handleBodyChunkedPhase],
      ['BODY_CONTENT_LENGTH', handleBodyContentLengthPhase],
    ]);

const responsePhaseHandlers = new Map<
  HttpParsePhase,
  (state: HttpState, hooks?: HttpParserHooks) => HttpState
    >([
      ['STARTLINE', handleResponseStartLinePhase],
      ['HEADERS', handleHeadersPhase],
      ['BODY_CHUNKED', handleBodyChunkedPhase],
      ['BODY_CONTENT_LENGTH', handleBodyContentLengthPhase],
    ]);

function genericParse(
  prev: HttpState,
  input: Buffer,
  phaseHandlers: Map<HttpParsePhase, (state: HttpState, hooks?: HttpParserHooks) => HttpState>,
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

export function parseRequest(
  prev?: HttpRequestState,
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

export function parseResponse(
  prev?: HttpResponseState,
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
