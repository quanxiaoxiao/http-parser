import { Buffer } from 'node:buffer';

import { DecodeHttpError } from '../errors.js';
import { type Headers } from '../types.js';
import decodeHttpLine from '../decodeHttpLine.js';
import parseRequestLine, { type RequestStartLine } from './parseRequestLine.js';

type RequestPhase = 'STARTLINE' | 'HEADERS' | 'CRLF' | 'BODY';

const CR = 0x0d;
const LF = 0x0a;
const CRLF_LENGTH = 2;

export interface RequestState {
  phase: RequestPhase;

  buffer: Buffer;
  finished: boolean;
  startLine: RequestStartLine | null;
  headers: Headers | null;
  rawHeaders: string[];
}

export function createRequestState(): RequestState {
  return {
    phase: 'STARTLINE',
    buffer: Buffer.alloc(0),
    finished: false,
    startLine: null,
    headers: null,
    rawHeaders: [],
  };
}

function handleCRLFPhase(state: RequestState): RequestState {
  const { buffer } = state;

  if (buffer.length < CRLF_LENGTH) {
    return state;
  }

  if (buffer[0] !== CR || buffer[1] !== LF) {
    throw new DecodeHttpError(
      `Missing CRLF after headers data (got: 0x${buffer[0]?.toString(16)} 0x${buffer[1]?.toString(16)})`,
    );
  }

  return {
    ...state,
    buffer: buffer.subarray(CRLF_LENGTH),
    phase: 'BODY',
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
  };
}

function handleHeadersPhase(state: RequestState):RequestState {
  return state;
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
  CRLF: handleCRLFPhase,
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
