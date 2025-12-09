import decodeHttpLine from '../decodeHttpLine.js';
import { DecodeHttpError } from '../errors.js';

export type TrailerHeaders = Record<string, string>;

export type ChunkedState = {
  phase: 'SIZE' | 'DATA' | 'CRLF' | 'TRAILER';
  buffer: Buffer;
  currentChunkSize: number;
  currentChunkRemaining: number;
  bodyChunks: Buffer[];
  trailers: TrailerHeaders;
  finished: boolean;
};

const CR = 0x0d;
const LF = 0x0a;
const DOUBLE_CRLF_LENGTH = 4;
const CRLF_LENGTH = 2;

export function createChunkedState(): ChunkedState {
  return {
    phase: 'SIZE',
    buffer: Buffer.alloc(0),
    currentChunkSize: 0,
    currentChunkRemaining: 0,
    bodyChunks: [],
    trailers: {},
    finished: false,
  };
}

function indexOfDoubleCRLF(buf: Buffer): number {
  const maxIndex = buf.length - 3;
  for (let i = 0; i < maxIndex; i++) {
    if (buf[i] === CR && buf[i + 1] === LF && buf[i + 2] === CR && buf[i + 3] === LF) {
      return i;
    }
  }
  return -1;
}

function parseChunkSize(line: string): number {
  const sizeHex = line.split(';', 1)[0]?.trim();
  if (!sizeHex) {
    throw new DecodeHttpError(`Invalid chunk size line: "${line}"`);
  }

  const size = parseInt(sizeHex, 16);
  if (Number.isNaN(size) || size < 0) {
    throw new DecodeHttpError(`Invalid chunk size: "${line}"`);
  }

  return size;
}

function parseTrailerHeaders(raw: string): TrailerHeaders {
  const trailers: TrailerHeaders = {};
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return trailers;
  }

  const lines = trimmed.split('\r\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) {
      throw new DecodeHttpError(`Invalid trailer header: ${line}`);
    }

    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (!key) {
      throw new DecodeHttpError(`Invalid trailer header: ${line}`);
    }

    trailers[key] = value;
  }

  return trailers;
}

function handleSizePhase(state: ChunkedState): ChunkedState {
  const lineBuf = decodeHttpLine(state.buffer);
  if (!lineBuf) {
    return state;
  }

  const line = lineBuf.toString();
  const newBuffer = state.buffer.slice(lineBuf.length + CRLF_LENGTH);
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
    currentChunkRemaining: size,
  };
}

function handleDataPhase(state: ChunkedState): ChunkedState {
  if (state.buffer.length < state.currentChunkRemaining) {
    return state;
  }

  const data = state.buffer.slice(0, state.currentChunkRemaining);
  const rest = state.buffer.slice(state.currentChunkRemaining);

  return {
    ...state,
    buffer: rest,
    bodyChunks: [...state.bodyChunks, data],
    currentChunkRemaining: 0,
    phase: 'CRLF',
  };
}

function handleCRLFPhase(state: ChunkedState): ChunkedState {
  if (state.buffer.length < CRLF_LENGTH) {
    return state;
  }

  if (state.buffer[0] !== CR || state.buffer[1] !== LF) {
    throw new DecodeHttpError('Missing CRLF after chunk data');
  }

  return {
    ...state,
    buffer: state.buffer.slice(CRLF_LENGTH),
    phase: 'SIZE',
  };
}

function handleTrailerPhase(state: ChunkedState): ChunkedState {
  const endBuf = decodeHttpLine(state.buffer);
  if (!endBuf) {
    return state;
  }

  if (endBuf.length === 0) {
    return {
      ...state,
      buffer: state.buffer.slice(CRLF_LENGTH),
      finished: true,
    };
  }

  const idx = indexOfDoubleCRLF(state.buffer);
  if (idx < 0) {
    return state;
  }

  const raw = state.buffer.slice(0, idx).toString();
  const rest = state.buffer.slice(idx + DOUBLE_CRLF_LENGTH);
  const trailers = parseTrailerHeaders(raw);

  return {
    ...state,
    buffer: rest,
    trailers: { ...state.trailers, ...trailers },
    finished: true,
  };
}

export function parseChunked(prev: ChunkedState, input: Buffer): ChunkedState {
  if (prev.finished) {
    throw new DecodeHttpError('Chunked decoding already finished');
  }

  let state: ChunkedState = {
    ...prev,
    buffer: Buffer.concat([prev.buffer, input]),
  };

  while (true) {
    const prevPhase = state.phase;

    switch (state.phase) {
    case 'SIZE':
      state = handleSizePhase(state);
      break;
    case 'DATA':
      state = handleDataPhase(state);
      break;
    case 'CRLF':
      state = handleCRLFPhase(state);
      break;
    case 'TRAILER':
      state = handleTrailerPhase(state);
      break;
    default:
      break;
    }

    if (state.phase === prevPhase || state.finished) {
      break;
    }
  }

  return state;
}
