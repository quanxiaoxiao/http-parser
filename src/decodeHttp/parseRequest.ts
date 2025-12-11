import { Buffer } from 'node:buffer';

import decodeHttpLine from '../decodeHttpLine.js';
import { DecodeHttpError } from '../errors.js';
import parseInteger from '../parseInteger.js';
import { type Headers } from '../types.js';
import { type ChunkedState, createChunkedState, parseChunked } from './parseChunked.js';
import { type ContentLengthState, createContentLengthState, parseContentLength } from './parseContentLength.js';
import { createHeadersState, type HeadersState, parseHeaders } from './parseHeaders.js';
import parseRequestLine, { type RequestStartLine } from './parseRequestLine.js';

type RequestPhase = 'STARTLINE' | 'HEADERS' | 'BODY_CHUNKED' | 'BODY_CONTENT_LENGTH';

const CRLF_LENGTH = 2;
const MAX_HEADER_SIZE = 16 * 1024; // 16KB
const EMPTY_BUFFER = Buffer.alloc(0);

function getHeaderValue(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

export interface RequestState {
  phase: RequestPhase;
  buffer: Buffer;
  finished: boolean;
  startLine: RequestStartLine | null;
  headersState: HeadersState | null;
  bodyState: ChunkedState | ContentLengthState | null;
}

export function createRequestState(): RequestState {
  return {
    phase: 'STARTLINE',
    buffer: Buffer.alloc(0),
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

function handleStartLinePhase(state: RequestState): RequestState {
  const lineBuf = decodeHttpLine(state.buffer);
  if (!lineBuf) return state;

  const endOfLine = lineBuf.length + CRLF_LENGTH;

  return updateState(state, {
    buffer: state.buffer.subarray(endOfLine),
    startLine: parseRequestLine(lineBuf.toString()),
    phase: 'HEADERS',
    headersState: createHeadersState(),
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
    return {
      phase: 'BODY_CHUNKED',
      bodyState: createChunkedState(),
    };
  }

  const contentLength = getContentLength(headers);
  if (contentLength) {
    return {
      phase: 'BODY_CONTENT_LENGTH',
      bodyState: createContentLengthState(contentLength),
    };
  }

  return { finished: true };
}

function handleHeadersPhase(state: RequestState): RequestState {
  const parseBuffer = state.buffer.length > MAX_HEADER_SIZE
    ? state.buffer.subarray(0, MAX_HEADER_SIZE)
    : state.buffer;

  const remainingBuffer = state.buffer.length > MAX_HEADER_SIZE
    ? state.buffer.subarray(MAX_HEADER_SIZE)
    : EMPTY_BUFFER;
  const headersState = parseHeaders(state.headersState!, parseBuffer);

  if (!headersState.finished) {
    if (remainingBuffer.length > 0) {
      throw new DecodeHttpError(`Headers too large: ${state.buffer.length} bytes exceeds limit of ${MAX_HEADER_SIZE}`);
    }
    return updateState(state, {
      buffer: remainingBuffer,
      headersState,
    });
  }

  const { headers } = headersState;
  if (!headers) {
    throw new DecodeHttpError('Headers parsing completed but headers are null');
  }

  const nextPhase = determineBodyPhase(headers);

  return updateState(state, {
    buffer: headersState.buffer,
    headersState: { ...headersState, buffer: remainingBuffer },
    ...nextPhase,
  });
}

function handleBodyPhase<T extends ChunkedState | ContentLengthState>(
  state: RequestState,
  parser: (bodyState: T, buffer: Buffer) => T,
): RequestState {
  const currentBodyState = state.bodyState as T;
  const bodyState = parser(currentBodyState, state.buffer);

  if (!bodyState.finished) {
    return updateState(state, {
      buffer: Buffer.alloc(0),
      bodyState,
    });
  }

  return updateState(state, {
    finished: true,
    bodyState: { ...bodyState, buffer: Buffer.alloc(0) },
    buffer: bodyState.buffer,
  });
}

function handleBodyChunkedPhase(state: RequestState): RequestState {
  return handleBodyPhase(state, parseChunked);
}

function handleBodyContentLengthPhase(state: RequestState): RequestState {
  return handleBodyPhase(state, parseContentLength);
}

const phaseHandlers = new Map<
  RequestPhase,
  (state: RequestState) => RequestState
    >([
      ['STARTLINE', handleStartLinePhase],
      ['HEADERS', handleHeadersPhase],
      ['BODY_CHUNKED', handleBodyChunkedPhase],
      ['BODY_CONTENT_LENGTH', handleBodyContentLengthPhase],
    ]);

export function parseRequest(
  prev: RequestState,
  input: Buffer,
): RequestState {
  if (prev.finished) {
    throw new DecodeHttpError('Request decoding already finished');
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
    state = handler(state);

    if (state.phase === prevPhase) {
      break;
    }
  }

  return state;
}
