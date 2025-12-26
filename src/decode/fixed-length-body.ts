import { DecodeHttpError } from '../errors.js';

export type FixedLengthBodyState = {
  buffer: Buffer;
  contentLength: number;
  bytesReceived: number;
  bodyChunks: Buffer[];
  finished: boolean;
};

export function createFixedLengthBodyState(contentLength: number): FixedLengthBodyState {
  if (!Number.isInteger(contentLength) || contentLength < 0) {
    throw new DecodeHttpError(`Invalid content length: ${contentLength}`);
  }

  return {
    buffer: Buffer.alloc(0),
    contentLength,
    bytesReceived: 0,
    bodyChunks: [],
    finished: contentLength === 0,
  };
}

export function decodeFixedLengthBody(
  prev: FixedLengthBodyState,
  input: Buffer,
  onChunk?: (chunk: Buffer) => void,
): FixedLengthBodyState {
  if (prev.finished) {
    throw new DecodeHttpError('Content-Length parsing already finished');
  }

  if (input.length === 0) {
    return prev;
  }

  const totalBytes = prev.bytesReceived + input.length;
  const finished = totalBytes >= prev.contentLength;
  const overflowBytes = totalBytes - prev.contentLength;
  const validInput = overflowBytes > 0 ? input.subarray(0, -overflowBytes) : input;
  const remainingBuffer = overflowBytes > 0 ? input.subarray(-overflowBytes) : Buffer.alloc(0);

  if (onChunk) {
    if (input.length > 0) {
      onChunk(input);
    }
    return {
      buffer: remainingBuffer,
      contentLength: prev.contentLength,
      bytesReceived: totalBytes,
      bodyChunks: [],
      finished,
    };
  }

  return {
    buffer: remainingBuffer,
    contentLength: prev.contentLength,
    bytesReceived: totalBytes,
    bodyChunks: [...prev.bodyChunks, validInput],
    finished,
  };
}

export function getProgress(state: FixedLengthBodyState): number {
  if (state.contentLength === 0) {
    return 1;
  }
  return Math.min(state.bytesReceived / state.contentLength, 1);
}

export function getRemainingBytes(state: FixedLengthBodyState): number {
  return Math.max(state.contentLength - state.bytesReceived, 0);
}
