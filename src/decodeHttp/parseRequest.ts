import { Buffer } from 'node:buffer';

import decodeHttpLine from '../decodeHttpLine.js';
import { DecodeHttpError } from '../errors.js';
import parseInteger from '../parseInteger.js';
import { type Headers, type HttpParserHooks, type RequestStartLine } from '../types.js';
import { type ChunkedState, createChunkedState, parseChunked } from './parseChunked.js';
import { type ContentLengthState, createContentLengthState, parseContentLength } from './parseContentLength.js';
import { createHeadersState, type HeadersState, parseHeaders } from './parseHeaders.js';
import parseRequestLine from './parseRequestLine.js';

type RequestPhase = 'STARTLINE' | 'HEADERS' | 'BODY_CHUNKED' | 'BODY_CONTENT_LENGTH';

const CRLF_LENGTH = 2;
const MAX_HEADER_SIZE = 16 * 1024; // 16KB
const MAX_START_LINE_SIZE = 16 * 1024; // 16KB
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

export interface RequestState {
  phase: RequestPhase;
  buffer: Buffer;
  finished: boolean;
  error?: Error,
  startLine: RequestStartLine | null;
  headersState: HeadersState | null;
  bodyState: ChunkedState | ContentLengthState | null;
}

export function createRequestState(): RequestState {
  return {
    phase: 'STARTLINE',
    buffer: EMPTY_BUFFER,
    finished: false,
    startLine: null,
    headersState: null,
    bodyState: null,
  };
}

function updateState(
  state: RequestState,
  updates: Partial<RequestState>,
): RequestState {
  return { ...state, ...updates };
}

function handleStartLinePhase(state: RequestState, hooks?: HttpParserHooks): RequestState {
  if (!state.startLine) {
    state.startLine = {
      method: null,
      path: null,
      version: null,
    };
    hooks?.onMessageBegin?.();
  }
  let lineBuf: Buffer | null;
  try {
    lineBuf = decodeHttpLine(
      state.buffer,
      0,
      MAX_START_LINE_SIZE,
    );
  } catch (error) {
    throw new DecodeHttpError(`HTTP request parse failed at phase "startline". Reason: ${formatError(error)}`);
  }
  if (!lineBuf) {
    return state;
  }

  let startLine: RequestStartLine;
  try {
    startLine = parseRequestLine(lineBuf.toString());
  } catch (error) {
    throw new DecodeHttpError(formatError(error));
  }

  hooks?.onRequestStartLine?.(startLine);

  const endOfLine = lineBuf.length + CRLF_LENGTH;

  return updateState(state, {
    buffer: state.buffer.subarray(endOfLine),
    startLine,
    phase: 'HEADERS',
  });
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

function determineBodyPhase(headers: Headers): Partial<RequestState> {
  if (isChunkedEncoding(headers)) {
    return { phase: 'BODY_CHUNKED' };
  }

  const contentLength = getContentLength(headers);
  if (contentLength) {
    return { phase: 'BODY_CONTENT_LENGTH' };
  }

  return { finished: true };
}

function handleHeadersPhase(state: RequestState, hooks?: HttpParserHooks): RequestState {
  if (!state.headersState) {
    state.headersState = createHeadersState();
    hooks?.onHeadersBegin?.();
  }
  const headersState = parseHeaders(state.headersState!, state.buffer, hooks?.onHeader);

  if (headersState.bytesReceived > MAX_HEADER_SIZE) {
    throw new DecodeHttpError(`Headers too large: ${state.buffer.length} bytes exceeds limit of ${MAX_HEADER_SIZE}`);
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
  state: RequestState,
  parser: (bodyState: T, buffer: Buffer, onBody?: (buffer: Buffer) => void) => T,
  hooks?: HttpParserHooks,
): RequestState {
  const currentBodyState = state.bodyState as T;
  const bodyState = parser(currentBodyState, state.buffer, hooks?.onBody);

  if (!bodyState.finished) {
    return updateState(state, {
      buffer: Buffer.alloc(0),
      bodyState,
    });
  }

  if (hooks && hooks.onBodyComplete) {
    hooks.onBodyComplete();
  }

  return updateState(state, {
    finished: true,
    bodyState: { ...bodyState, buffer: Buffer.alloc(0) },
    buffer: bodyState.buffer,
  });
}

function handleBodyChunkedPhase(state: RequestState, hooks?: HttpParserHooks): RequestState {
  if (!state.bodyState) {
    state.bodyState = createChunkedState();
    hooks?.onBodyBegin?.();
  }
  return handleBodyPhase(state, parseChunked, hooks);
}

function handleBodyContentLengthPhase(state: RequestState, hooks?: HttpParserHooks): RequestState {
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

const phaseHandlers = new Map<
  RequestPhase,
  (state: RequestState, hooks?: HttpParserHooks) => RequestState
    >([
      ['STARTLINE', handleStartLinePhase],
      ['HEADERS', handleHeadersPhase],
      ['BODY_CHUNKED', handleBodyChunkedPhase],
      ['BODY_CONTENT_LENGTH', handleBodyContentLengthPhase],
    ]);

export function parseRequest(
  prev: RequestState,
  input: Buffer,
  hooks?: HttpParserHooks,
): RequestState {
  if (prev.finished) {
    throw new DecodeHttpError('Request decoding already finished');
  }

  if (prev.error) {
    throw new Error(`Request decoded occur error "${prev.error.message}"`);
  }

  let state: RequestState = input.length > 0
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
      throw new DecodeHttpError(formatError(error));
    }

    if (state.phase === prevPhase) {
      break;
    }
  }

  if (state.finished && hooks && hooks.onMessageComplete) {
    hooks.onMessageComplete();
  }

  return state;
}
