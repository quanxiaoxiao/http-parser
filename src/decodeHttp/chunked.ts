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
  for (let i = 0; i < buf.length - 3; i++) {
    if (
      buf[i] === 0x0d &&
      buf[i + 1] === 0x0a &&
    buf[i + 2] === 0x0d &&
  buf[i + 3] === 0x0a
    ) return i;
  }
  return -1;
}

export function parseChunked(
  prev: ChunkedState,
  input: Buffer,
): ChunkedState {
  if (prev.finished) {
    throw new DecodeHttpError('chunked decoding already finished');
  }

  let state: ChunkedState = {
    ...prev,
    buffer: Buffer.concat([prev.buffer, input]),
  };

  while (true) {
    if (state.phase === 'SIZE') {
      const lineBuf = decodeHttpLine(state.buffer);
      if (!lineBuf) {
        break;
      }

      const line = lineBuf.toString();
      state = {
        ...state,
        buffer: state.buffer.slice(lineBuf.length + 2),
      };

      const sizeHex = line.split(';', 1)[0]?.trim() as string;
      const size = parseInt(sizeHex, 16);

      if (Number.isNaN(size) || size < 0) {
        throw new DecodeHttpError(`Invalid chunk size: "${line}"`);
      }

      if (size === 0) {
        state = { ...state, phase: 'TRAILER' };
        continue;
      }

      state = {
        ...state,
        phase: 'DATA',
        currentChunkSize: size,
        currentChunkRemaining: size,
      };
    } else if (state.phase === 'DATA') {
      if (state.buffer.length < state.currentChunkRemaining) {
        break;
      }

      const data = state.buffer.slice(0, state.currentChunkRemaining);
      const rest = state.buffer.slice(state.currentChunkRemaining);

      state = {
        ...state,
        buffer: rest,
        bodyChunks: [...state.bodyChunks, data],
        currentChunkRemaining: 0,
        phase: 'CRLF',
      };
    } else if (state.phase === 'CRLF') {
      if (state.buffer.length < 2) break;

      if (state.buffer[0] !== 0x0d || state.buffer[1] !== 0x0a) {
        throw new DecodeHttpError('Missing CRLF after chunk');
      }

      state = {
        ...state,
        buffer: state.buffer.slice(2),
        phase: 'SIZE',
      };
    } else if (state.phase === 'TRAILER') {
      const endBuf = decodeHttpLine(state.buffer);
      if (!endBuf) {
        break;
      }

      if (endBuf.length === 0) {
        state = {
          ...state,
          buffer: state.buffer.slice(2),
          finished: true,
        };
        break;
      }

      const idx = indexOfDoubleCRLF(state.buffer);

      if (idx < 0) break;

      const raw = state.buffer.slice(0, idx).toString();
      const rest = state.buffer.slice(idx + 4);

      const trailers: TrailerHeaders = { ...state.trailers };

      if (raw.trim().length > 0) {
        const lines = raw.split('\r\n');
        for (const line of lines) {
          const [key, ...restVal] = line.split(':');
          if (!key || restVal.length === 0) {
            throw new DecodeHttpError(`Invalid trailer header: ${line}`);
          }
          trailers[key.trim().toLowerCase()] = restVal.join(':').trim();
        }
      }

      state = {
        ...state,
        buffer: rest,
        trailers,
        finished: true,
      };

      break;
    }
  }

  return state;
}
