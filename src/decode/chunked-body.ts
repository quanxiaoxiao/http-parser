import { Buffer } from 'node:buffer';

import { HttpDecodeErrorCode, HttpDecodeError, DecodeHttpError } from '../errors.js';
import { CR, CRLF, LF } from '../specs.js';
import type { BodyType, TrailerHeaders } from '../types.js';
import { decodeHttpLine } from './http-line.js';

export enum ChunkedPhase {
  SIZE = 'size',
  DATA = 'data',
  CRLF = 'crlf', // eslint-disable-line
  TRAILER = 'trailer',
  FINISHED = 'finished',
}

export type ChunkedBodyState = {
  type: BodyType;
  phase: ChunkedPhase;
  buffer: Buffer | null;
  totalSize: number;
  currentChunkSize: number;
  bodyChunks: Buffer[];
  trailers: TrailerHeaders;
  finished: boolean;
};

const CRLF_LENGTH = 2;
const DOUBLE_CRLF_LENGTH = 4;
const EMPTY_BUFFER = Buffer.alloc(0);

const DOUBLE_CRLF = Buffer.from([CR, LF, CR, LF]);

export function createChunkedBodyState(): ChunkedBodyState {
  return {
    type: 'chunked',
    phase: ChunkedPhase.SIZE,
    buffer: EMPTY_BUFFER,
    currentChunkSize: 0,
    totalSize: 0,
    bodyChunks: [],
    trailers: {},
    finished: false,
  };
}

function indexOfDoubleCRLF(buf: Buffer): number {
  const len = buf.length;
  if (len < DOUBLE_CRLF_LENGTH) {
    return -1;
  }

  return buf.indexOf(DOUBLE_CRLF);
}

function parseChunkSize(line: string): number {
  const match = line.match(/^([0-9a-fA-F]+)/);

  if (!match) {
    throw new DecodeHttpError('Empty chunk size line');
  }

  const size = parseInt(match[1], 16);

  if (!Number.isFinite(size) || size < 0) {
    throw new DecodeHttpError(`Invalid chunk size: "${match[1]}"`);
  }

  return size;
}

function parseTrailerHeaders(raw: string): TrailerHeaders {
  const trailers: TrailerHeaders = {};
  const trimmed = raw.trim();

  if (!trimmed) {
    return trailers;
  }

  const lines = trimmed.split(CRLF);

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const colonIndex = line.indexOf(':');

    if (colonIndex <= 0) {
      throw new DecodeHttpError(`Invalid trailer header (missing colon): "${line}"`);
    }

    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (!key) {
      throw new DecodeHttpError(`Invalid trailer header (empty key): "${line}"`);
    }

    if (trailers[key]) {
      trailers[key] += `, ${value}`;
    } else {
      trailers[key] = value;
    }
  }

  return trailers;
}

function handleSizePhase(state: ChunkedBodyState): ChunkedBodyState {
  const lineBuf = decodeHttpLine(state.buffer);

  if (!lineBuf) {
    return state;
  }

  const line = lineBuf.toString('ascii');
  const consumed = lineBuf.length + CRLF_LENGTH;
  const size = parseChunkSize(line);

  return {
    ...state,
    buffer: state.buffer.subarray(consumed),
    phase: size === 0 ? ChunkedPhase.TRAILER : ChunkedPhase.DATA,
    currentChunkSize: size,
  };
}

function handleDataPhase(
  state: ChunkedBodyState,
): ChunkedBodyState {
  const { buffer, currentChunkSize } = state;

  if (buffer.length < currentChunkSize) {
    return state;
  }

  return {
    ...state,
    totalSize: state.totalSize + currentChunkSize,
    buffer: buffer.subarray(currentChunkSize),
    bodyChunks: [...state.bodyChunks, buffer.subarray(0, currentChunkSize)],
    currentChunkSize: 0,
    phase: ChunkedPhase.CRLF,
  };
}

function handleCRLFPhase(state: ChunkedBodyState): ChunkedBodyState {
  const { buffer } = state;

  if (buffer.length < CRLF_LENGTH) {
    return state;
  }

  if (buffer[0] !== CR || buffer[1] !== LF) {
    throw new DecodeHttpError(
      `Missing CRLF after chunk data (got: 0x${buffer[0]?.toString(16)} 0x${buffer[1]?.toString(16)})`,
    );
  }

  return {
    ...state,
    buffer: buffer.subarray(CRLF_LENGTH),
    phase: ChunkedPhase.SIZE,
  };
}

function handleTrailerPhase(state: ChunkedBodyState): ChunkedBodyState {
  const { buffer } = state;
  const endBuf = decodeHttpLine(buffer);

  if (!endBuf) {
    return state;
  }

  if (endBuf.length === 0) {
    return {
      ...state,
      buffer: buffer.subarray(CRLF_LENGTH),
      finished: true,
    };
  }

  const idx = indexOfDoubleCRLF(buffer);

  if (idx < 0) {
    return state;
  }

  const raw = buffer.subarray(0, idx).toString('utf8');
  const trailers = parseTrailerHeaders(raw);

  return {
    ...state,
    buffer: buffer.subarray(idx + DOUBLE_CRLF_LENGTH),
    trailers: { ...state.trailers, ...trailers },
    finished: true,
  };
}

const phaseHandlers: Record<ChunkedPhase, (state: ChunkedBodyState) => ChunkedBodyState> = {
  [ChunkedPhase.SIZE]: handleSizePhase,
  [ChunkedPhase.DATA]: handleDataPhase,
  [ChunkedPhase.CRLF]: handleCRLFPhase,
  [ChunkedPhase.TRAILER]: handleTrailerPhase,
} as const;

export function decodeChunkedBody(
  prev: ChunkedBodyState,
  input: Buffer,
): ChunkedBodyState {
  if (prev.finished) {
    throw new DecodeHttpError('Chunked decoding already finished');
  }

  let state: ChunkedBodyState = {
    ...prev,
    buffer: prev.buffer.length > 0 ? Buffer.concat([prev.buffer, input]) : input,
  };

  while (!state.finished) {
    const prevPhase = state.phase;
    const handler = phaseHandlers[state.phase];
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
