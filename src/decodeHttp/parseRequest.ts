import { Buffer } from 'node:buffer';

import decodeHttpLine from '../decodeHttpLine.js';
import { DecodeHttpError } from '../errors.js';
import { createHeadersState,type HeadersState, parseHeaders } from './parseHeaders.js';
import parseRequestLine, { type RequestStartLine } from './parseRequestLine.js';

type RequestPhase = 'STARTLINE' | 'HEADERS' | 'BODY';

const CRLF_LENGTH = 2;

export interface RequestState {
  phase: RequestPhase;

  buffer: Buffer;
  finished: boolean;
  startLine: RequestStartLine | null;
  headersState: HeadersState | null;
}

export function createRequestState(): RequestState {
  return {
    phase: 'STARTLINE',
    buffer: Buffer.alloc(0),
    finished: false,
    startLine: null,
    headersState: null,
  };
}

function handleStartLinePhase(state: RequestState): RequestState {
  const { buffer } = state;
  const lineBuf = decodeHttpLine(buffer);
  if (!lineBuf) {
    return state;
  }
  return {
    ...state,
    buffer: buffer.subarray(lineBuf.length + CRLF_LENGTH),
    startLine: parseRequestLine(lineBuf.toString()),
    phase: 'HEADERS',
    headersState: createHeadersState(),
  };
}

function handleHeadersPhase(state: RequestState):RequestState {
  const headersState = parseHeaders(state.headersState!, state.buffer);
  if (headersState.finished) {
    return {
      ...state,
      headersState: {
        ...headersState,
        buffer: Buffer.alloc(0),
      },
      buffer: headersState.buffer,
      phase: 'BODY',
    };
  }
  return {
    ...state,
    buffer: Buffer.alloc(0),
    headersState,
  };
}

function handleBodyPhase(state: RequestState): RequestState {
  return state;
}

const phaseHandlers: Record<
RequestPhase,
(state: RequestState) => RequestState
> = {
  STARTLINE: handleStartLinePhase,
  HEADERS: handleHeadersPhase,
  BODY: handleBodyPhase,
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
    buffer: prev.buffer.length > 0 ? Buffer.concat([prev.buffer, input]) : input,
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
