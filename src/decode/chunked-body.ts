import { Buffer } from 'node:buffer';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { CR, CRLF, DEFAULT_CHUNKED_BODY_LIMITS, LF } from '../specs.js';
import type { BodyType, ChunkedBodyLimits, TrailerHeaders } from '../types.js';
import { decodeHttpLine } from './http-line.js';

export enum ChunkedBodyPhase {
  SIZE = 'size',
  DATA = 'data',
  CRLF = 'crlf', // eslint-disable-line
  TRAILER = 'trailer',
  FINISHED = 'finished',
}

export type ChunkedBodyState = {
  type: BodyType;
  phase: ChunkedBodyPhase;
  decodedBodyBytes: number;
  remainingChunkBytes: number;
  buffer: Buffer;
  chunks: Buffer[];
  trailers: TrailerHeaders;
  limits: ChunkedBodyLimits,
};

const CRLF_LENGTH = 2;
const DOUBLE_CRLF_LENGTH = 4;
const EMPTY_BUFFER = Buffer.alloc(0);

const DOUBLE_CRLF = Buffer.from([CR, LF, CR, LF]);

export function parseChunkSize(line: string, limits: ChunkedBodyLimits): number {
  const semicolonIndex = line.indexOf(';');
  const sizePart = semicolonIndex === -1 ? line : line.slice(0, semicolonIndex);

  if (limits.maxChunkExtensionLength === 0 && semicolonIndex !== -1) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.UNSUPPORTED_CHUNK_EXTENSION,
      message: 'Unsupported chunk extension',
    });
  }

  if (semicolonIndex !== -1 && line.length - semicolonIndex > limits.maxChunkExtensionLength) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.CHUNK_EXTENSION_TOO_LARGE,
      message: `Chunk extension exceeds maximum allowed of ${limits.maxChunkExtensionLength}`,
    });
  }

  if (!sizePart) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_CHUNK_SIZE,
      message: 'Empty chunk size line',
    });
  }

  if (sizePart.length > limits.maxChunkSizeHexDigits) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE,
      message: `Chunk size hex digits exceed limit of ${limits.maxChunkSizeHexDigits}`,
    });
  }

  if (!/^[0-9A-Fa-f]+$/.test(sizePart)) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_CHUNK_SIZE,
      message: `Invalid chunk size: "${sizePart}"`,
    });
  }

  const size = parseInt(sizePart, 16);

  if (size > limits.maxChunkSize) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE,
      message: `Chunk size exceeds maximum allowed of ${limits.maxChunkSize}`,
    });
  }

  return size;
}

export function createChunkedBodyState(limits: ChunkedBodyLimits = DEFAULT_CHUNKED_BODY_LIMITS): ChunkedBodyState {
  return {
    type: 'chunked',
    phase: ChunkedBodyPhase.SIZE,
    buffer: EMPTY_BUFFER,
    limits,
    remainingChunkBytes: 0,
    decodedBodyBytes: 0,
    chunks: [],
    trailers: {},
  };
}

function indexOfDoubleCRLF(buf: Buffer): number {
  const len = buf.length;
  if (len < DOUBLE_CRLF_LENGTH) {
    return -1;
  }

  return buf.indexOf(DOUBLE_CRLF);
}

function parseTrailerHeaders(raw: string, limits: ChunkedBodyLimits): TrailerHeaders {
  const trailers: TrailerHeaders = {};
  const trimmed = raw.trim();

  if (!trimmed) {
    return trailers;
  }

  const lines = trimmed.split(CRLF);

  if (lines.length > limits.maxTrailers) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.TRAILER_TOO_MANY,
      message: `Trailers too many: exceeds limit of ${limits.maxTrailers} count`,
    });
  }

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const colonIndex = line.indexOf(':');

    if (colonIndex <= 0) {
      throw new HttpDecodeError({
        code: HttpDecodeErrorCode.INVALID_TRAILER,
        message: `Invalid trailer header (missing colon): "${line}"`,
      });
    }

    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (!key) {
      throw new HttpDecodeError({
        code: HttpDecodeErrorCode.INVALID_TRAILER,
        message: `Invalid trailer header (empty key): "${line}"`,
      });
    }

    if (trailers[key]) {
      trailers[key] += `, ${value}`;
    } else {
      trailers[key] = value;
    }
  }

  return trailers;
}

function handleSizePhase(state: ChunkedBodyState): void {
  const { limits } = state;
  const maxChunkSizeLineLength = limits.maxChunkExtensionLength === 0
    ? limits.maxChunkSizeHexDigits
    : limits.maxChunkSizeHexDigits + 1 + limits.maxChunkExtensionLength;
  const lineBuf = decodeHttpLine(state.buffer, 0, maxChunkSizeLineLength);

  if (!lineBuf) {
    return;
  }

  const line = lineBuf.toString('ascii');
  const consumed = lineBuf.length + CRLF_LENGTH;
  const size = parseChunkSize(line, state.limits);

  state.buffer = state.buffer.subarray(consumed);
  state.phase = size === 0 ? ChunkedBodyPhase.TRAILER : ChunkedBodyPhase.DATA;
  state.remainingChunkBytes = size;
}

function handleDataPhase(state: ChunkedBodyState): void {
  const { buffer, remainingChunkBytes } = state;

  if (buffer.length < remainingChunkBytes) {
    return;
  }

  state.decodedBodyBytes = state.decodedBodyBytes + remainingChunkBytes;
  state.buffer = buffer.subarray(remainingChunkBytes);
  state.chunks = [...state.chunks, buffer.subarray(0, remainingChunkBytes)];
  state.remainingChunkBytes = 0;
  state.phase = ChunkedBodyPhase.CRLF;
}

function handleCRLFPhase(state: ChunkedBodyState): void {
  const { buffer } = state;

  if (buffer.length < CRLF_LENGTH) {
    return;
  }

  if (buffer[0] !== CR || buffer[1] !== LF) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_CHUNK_SIZE_LINE_ENDING,
      message: `Missing CRLF after chunk data (got: 0x${buffer[0]?.toString(16)} 0x${buffer[1]?.toString(16)})`,
    });
  }

  state.buffer = buffer.subarray(CRLF_LENGTH);
  state.phase = ChunkedBodyPhase.SIZE;
}

function handleTrailerPhase(state: ChunkedBodyState): void {
  const { buffer, limits } = state;
  const { maxTrailerSize } = limits;
  const firstLine = decodeHttpLine(buffer, 0, maxTrailerSize);

  if (!firstLine) {
    return;
  }

  if (firstLine.length === 0) {
    state.buffer = buffer.subarray(CRLF_LENGTH);
    state.phase = ChunkedBodyPhase.FINISHED;
    return;
  }

  const trailerEndIdx = indexOfDoubleCRLF(buffer);

  if (trailerEndIdx < 0) {
    if (buffer.length > maxTrailerSize) {
      throw new HttpDecodeError({
        code: HttpDecodeErrorCode.TRAILER_TOO_LARGE,
        message: `Trailer size exceeds maximum allowed of ${maxTrailerSize}`,
      });
    }
    return;
  }

  const rawTrailers = buffer.subarray(0, trailerEndIdx).toString('utf8');
  const parsedTrailers = parseTrailerHeaders(rawTrailers, state.limits);

  state.phase = ChunkedBodyPhase.FINISHED;
  state.buffer = buffer.subarray(trailerEndIdx + DOUBLE_CRLF_LENGTH);
  state.trailers = {
    ...state.trailers,
    ...parsedTrailers,
  };
}

const phaseHandlers: Record<ChunkedBodyPhase, (state: ChunkedBodyState) => void> = {
  [ChunkedBodyPhase.SIZE]: handleSizePhase,
  [ChunkedBodyPhase.DATA]: handleDataPhase,
  [ChunkedBodyPhase.CRLF]: handleCRLFPhase,
  [ChunkedBodyPhase.TRAILER]: handleTrailerPhase,
} as const;

export function decodeChunkedBody(
  prev: ChunkedBodyState,
  input: Buffer,
): ChunkedBodyState {
  if (prev.phase === ChunkedBodyPhase.FINISHED) {
    throw new Error('Chunked decoding already finished');
  }

  const state: ChunkedBodyState = {
    ...prev,
    buffer: prev.buffer.length > 0 ? Buffer.concat([prev.buffer, input]) : input,
    chunks: [...prev.chunks],
    trailers: { ...prev.trailers },
  };

  while (state.phase !== ChunkedBodyPhase.FINISHED) {
    const prevPhase = state.phase;
    const handler = phaseHandlers[state.phase];
    if (!handler) {
      throw new Error(`Unknown phase: ${state.phase}`);
    }

    handler(state);

    if (state.phase === prevPhase) {
      break;
    }
  }

  return state;
}

export function isChunkedBodyFinished(state: ChunkedBodyState) {
  return state.phase === ChunkedBodyPhase.FINISHED;
}
