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

function handleStartLinePhase(state: RequestState): RequestState {
  const { buffer } = state;
  const lineBuf = decodeHttpLine(buffer);
  if (!lineBuf) {
    return state;
  }

  const endOfLine = lineBuf.length + CRLF_LENGTH;

  return {
    ...state,
    buffer: buffer.subarray(endOfLine),
    startLine: parseRequestLine(lineBuf.toString()),
    phase: 'HEADERS',
    headersState: createHeadersState(),
  };
}

function handleHeadersPhase(state: RequestState): RequestState {
  const headersState = parseHeaders(state.headersState!, state.buffer);

  if (!headersState.finished) {
    return {
      ...state,
      buffer: Buffer.alloc(0),
      headersState,
    };
  }

  const headers = headersState.headers!;
  const baseUpdate = {
    ...state,
    headersState: {
      ...headersState,
      buffer: Buffer.alloc(0),
    },
    buffer: headersState.buffer,
  };

  const transferEncodingValue = getHeaderValue(headers, 'transfer-encoding');
  if (transferEncodingValue?.toLowerCase() === 'chunked') {
    return {
      ...baseUpdate,
      phase: 'BODY_CHUNKED',
      bodyState: createChunkedState(),
    };
  }

  const contentLengthValue = getHeaderValue(headers, 'content-length');
  const length = parseInteger(contentLengthValue ?? '');

  if (length != null && length > 0) {
    return {
      ...baseUpdate,
      phase: 'BODY_CONTENT_LENGTH',
      bodyState: createContentLengthState(length),
    };
  }

  return {
    ...baseUpdate,
    finished: true,
  };
}

function handleBodyChunkedPhase(state: RequestState): RequestState {
  const currentBodyState = state.bodyState as ChunkedState;
  const bodyState = parseChunked(currentBodyState, state.buffer);

  if (!bodyState.finished) {
    return {
      ...state,
      buffer: Buffer.alloc(0),
      bodyState,
    };
  }

  return {
    ...state,
    finished: true,
    bodyState: {
      ...bodyState,
      buffer: Buffer.alloc(0),
    },
    buffer: bodyState.buffer,
  };
}

function handleBodyContentLengthPhase(state: RequestState): RequestState {
  const currentBodyState = state.bodyState as ContentLengthState;
  const bodyState = parseContentLength(currentBodyState, state.buffer);
  if (!bodyState.finished) {
    return {
      ...state,
      buffer: Buffer.alloc(0),
      bodyState,
    };
  }

  return {
    ...state,
    finished: true,
    bodyState: {
      ...bodyState,
      buffer: Buffer.alloc(0),
    },
    buffer: bodyState.buffer,
  };
}

const phaseHandlers: Record<
  RequestPhase,
  (state: RequestState) => RequestState
> = {
  STARTLINE: handleStartLinePhase,
  HEADERS: handleHeadersPhase,
  BODY_CHUNKED: handleBodyChunkedPhase,
  BODY_CONTENT_LENGTH: handleBodyContentLengthPhase,
};

export function parseRequest(
  prev: RequestState,
  input: Buffer,
): RequestState {
  if (prev.finished) {
    throw new DecodeHttpError('Request decoding already finished');
  }

  let state: RequestState = {
    ...prev,
    buffer: Buffer.concat([prev.buffer, input]),
  };

  while (!state.finished) {
    const prevPhase = state.phase;

    const handler = phaseHandlers[state.phase];
    state = handler(state);

    if (state.phase === prevPhase) {
      break;
    }
  }

  return state;
}
