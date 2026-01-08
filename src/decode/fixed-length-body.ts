import { DecodeHttpError } from '../errors.js';
import type { BodyType } from '../types.js';

export type FixedLengthBodyState = {
  type: BodyType;
  buffer: Buffer | null;
  contentLength: number;
  receivedBody: number;
  chunks: Buffer[];
  finished: boolean;
};

export function createFixedLengthBodyState(contentLength: number): FixedLengthBodyState {
  if (!Number.isInteger(contentLength) || contentLength < 0) {
    throw new Error(`Invalid content length: ${contentLength}`);
  }

  return {
    type: 'fixed',
    buffer: Buffer.alloc(0),
    contentLength,
    receivedBody: 0,
    chunks: [],
    finished: contentLength === 0,
  };
}

export function decodeFixedLengthBody(
  prev: FixedLengthBodyState,
  input: Buffer,
): FixedLengthBodyState {
  if (prev.finished) {
    throw new DecodeHttpError('Content-Length parsing already finished');
  }

  if (input.length === 0) {
    return prev;
  }

  const totalBytes = prev.receivedBody + input.length;
  const finished = totalBytes >= prev.contentLength;
  const overflowBytes = totalBytes - prev.contentLength;
  const validInput = overflowBytes > 0 ? input.subarray(0, -overflowBytes) : input;
  const remainingBuffer = overflowBytes > 0 ? input.subarray(-overflowBytes) : Buffer.alloc(0);

  return {
    ...prev,
    buffer: remainingBuffer,
    contentLength: prev.contentLength,
    receivedBody: totalBytes,
    chunks: [...prev.chunks, validInput],
    finished,
  };
}

export function getProgress(state: FixedLengthBodyState): number {
  if (state.contentLength === 0) {
    return 1;
  }
  return Math.min(state.receivedBody / state.contentLength, 1);
}

export function getRemainingBytes(state: FixedLengthBodyState): number {
  return Math.max(state.contentLength - state.receivedBody, 0);
}

export function isFixedLengthBodyFinished(state: FixedLengthBodyState) {
  return state.finished;
}
