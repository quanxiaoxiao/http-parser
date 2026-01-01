import { Buffer } from 'node:buffer';

import { DecodeHttpError } from '../errors.js';
import { CR, LF } from '../specs.js';
import { type TrailerHeaders } from '../types.js';
import { decodeHttpLine } from './http-line.js';

export type ChunkedPhase = 'SIZE' | 'DATA' | 'CRLF' | 'TRAILER';

export type ChunkedBodyState = {
  phase: ChunkedPhase;
  buffer: Buffer;
  totalSize: number;
  currentChunkSize: number;
  bodyChunks: Buffer[];
  trailers: TrailerHeaders;
  finished: boolean;
};

const CRLF_LENGTH = 2;
const DOUBLE_CRLF_LENGTH = 4;
const EMPTY_BUFFER = Buffer.alloc(0);

export function createChunkedBodyState(): ChunkedBodyState {
  return {
    phase: 'SIZE',
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
  if (len < DOUBLE_CRLF_LENGTH) return -1;

  const maxIndex = len - 3;
  for (let i = 0; i < maxIndex; i++) {
    if (
      buf[i] === CR &&
      buf[i + 1] === LF &&
      buf[i + 2] === CR &&
      buf[i + 3] === LF
    ) {
      return i;
    }
  }
  return -1;
}

function parseChunkSize(line: string): number {
  const sizeHex = line.split(';', 1)[0]?.trim();

  if (!sizeHex) {
    throw new DecodeHttpError('Empty chunk size line');
  }

  const size = parseInt(sizeHex, 16);

  if (Number.isNaN(size)) {
    throw new DecodeHttpError(`Invalid hexadecimal chunk size: "${sizeHex}"`);
  }

  if (size < 0) {
    throw new DecodeHttpError(`Negative chunk size not allowed: ${size}`);
  }

  return size;
}

function parseTrailerHeaders(raw: string): TrailerHeaders {
  const trailers: TrailerHeaders = {};
  const trimmed = raw.trim();

  if (!trimmed) {
    return trailers;
  }

  const lines = trimmed.split('\r\n');

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
  const newBuffer = state.buffer.subarray(consumed);
  const size = parseChunkSize(line);

  if (size === 0) {
    return {
      ...state,
      buffer: newBuffer,
      phase: 'TRAILER',
    };
  }

  return {
    ...state,
    buffer: newBuffer,
    phase: 'DATA',
    currentChunkSize: size,
  };
}

function handleDataPhase(
  state: ChunkedBodyState,
  onChunk?: (chunk: Buffer) => void,
): ChunkedBodyState {
  const { buffer, currentChunkSize } = state;

  if (buffer.length < currentChunkSize) {
    return state;
  }

  state.totalSize += currentChunkSize;

  const data = buffer.subarray(0, currentChunkSize);
  const rest = buffer.subarray(currentChunkSize);

  if (onChunk) {
    onChunk(data);
    return {
      ...state,
      buffer: rest,
      bodyChunks: [],
      currentChunkSize: 0,
      phase: 'CRLF',
    };
  }

  return {
    ...state,
    buffer: rest,
    bodyChunks: [...state.bodyChunks, data],
    currentChunkSize: 0,
    phase: 'CRLF',
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
    phase: 'SIZE',
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
  const rest = buffer.subarray(idx + DOUBLE_CRLF_LENGTH);
  const trailers = parseTrailerHeaders(raw);

  return {
    ...state,
    buffer: rest,
    trailers: { ...state.trailers, ...trailers },
    finished: true,
  };
}

const phaseHandlers = new Map<
ChunkedPhase,
(state: ChunkedBodyState, onChunk?: (chunk: Buffer) => void) => ChunkedBodyState
  >([
    ['SIZE', handleSizePhase],
    ['DATA', handleDataPhase],
    ['CRLF', handleCRLFPhase],
    ['TRAILER', handleTrailerPhase],
  ]);

export function decodeChunkedBody(
  prev: ChunkedBodyState,
  input: Buffer,
  onChunk?: (chunk: Buffer) => void,
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
    const handler = phaseHandlers.get(state.phase);
    if (!handler) {
      throw new DecodeHttpError(`Unknown phase: ${state.phase}`);
    }

    state = handler(state, onChunk);

    if (state.phase === prevPhase) {
      break;
    }
  }

  return state;
}
