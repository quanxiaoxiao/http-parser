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

function handleHeadersPhase(state: RequestState): RequestState {
  const headersState = parseHeaders(state.headersState!, state.buffer);

  if (!headersState.finished) {
    return updateState(state, {
      buffer: Buffer.alloc(0),
      headersState,
    });
  }

  const { headers } = headersState;
  if (!headers) {
    throw new DecodeHttpError('Headers parsing completed but headers are null');
  }

  const baseState = updateState(state, {
    headersState: { ...headersState, buffer: Buffer.alloc(0) },
    buffer: headersState.buffer,
  });

  const transferEncoding = getHeaderValue(headers, 'transfer-encoding');
  if (transferEncoding?.toLowerCase().includes('chunked')) {
    return updateState(baseState, {
      phase: 'BODY_CHUNKED',
      bodyState: createChunkedState(),
    });
  }

  const contentLengthValue = getHeaderValue(headers, 'content-length');
  if (contentLengthValue) {
    const length = parseInteger(contentLengthValue);
    if (length != null && length > 0) {
      return updateState(baseState, {
        phase: 'BODY_CONTENT_LENGTH',
        bodyState: createContentLengthState(length),
      });
    }
  }

  return updateState(baseState, { finished: true });
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
    ? { ...prev, buffer: Buffer.concat([prev.buffer, input]) }
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
