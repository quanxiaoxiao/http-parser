import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { DEFAULT_FIXED_LENGTH_BODY_LIMITS } from '../specs.js';
import type { BodyType, FixedLengthBodyLimits } from '../types.js';

export enum FixedLengthBodyPhase {
  DATA = 'data',
  FINISHED = 'finished',
}

export type FixedLengthBodyState = {
  type: BodyType;
  phase: FixedLengthBodyPhase,
  buffer: Buffer | null;
  chunks: Buffer[];
  decodedBodyBytes: number;
  remainingBytes: number;
  limits: FixedLengthBodyLimits,
};

export function createFixedLengthBodyState(
  contentLength: number,
  limits: FixedLengthBodyLimits = DEFAULT_FIXED_LENGTH_BODY_LIMITS,
): FixedLengthBodyState {
  if (!Number.isInteger(contentLength) || contentLength < 0) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_CONTENT_LENGTH,
      message: `Invalid Content-Length: ${contentLength}`,
    });
  }

  if (contentLength > limits.maxBodySize) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.CONTENT_LENGTH_TOO_LARGE,
      message: `Content-Length ${contentLength} exceeds limit ${limits.maxBodySize}`,
    });
  }

  return {
    type: 'fixed',
    phase: contentLength > 0 ? FixedLengthBodyPhase.DATA : FixedLengthBodyPhase.FINISHED,
    buffer: Buffer.alloc(0),
    remainingBytes: contentLength,
    decodedBodyBytes: 0,
    limits,
    chunks: [],
  };
}

export function decodeFixedLengthBody(
  prev: FixedLengthBodyState,
  input: Buffer,
): FixedLengthBodyState {
  if (prev.phase === FixedLengthBodyPhase.FINISHED) {
    throw new Error('Content-Length parsing already finished');
  }

  const size = input.length;
  if (size === 0) {
    return prev;
  }

  const remainingBytes = prev.remainingBytes - size;
  const decodedBodyBytes = prev.decodedBodyBytes + size;

  const validInput = remainingBytes >= 0 ? input : input.subarray(0, size + remainingBytes);
  const remainingBuffer = remainingBytes >= 0 ? Buffer.alloc(0) : input.subarray(remainingBytes);

  const next = {
    ...prev,
    buffer: remainingBuffer,
    remainingBytes: Math.max(remainingBytes, 0),
    decodedBodyBytes: remainingBytes < 0 ? decodedBodyBytes + remainingBytes : decodedBodyBytes,
    chunks: [...prev.chunks],
  };

  const contentLength = next.remainingBytes + next.decodedBodyBytes;

  if (contentLength > next.limits.maxBodySize) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.CONTENT_LENGTH_TOO_LARGE,
      message: `Content-Length ${contentLength} exceeds limit ${next.limits.maxBodySize}`,
    });
  }

  if (validInput.length > 0) {
    next.chunks.push(validInput);
  }

  if (next.remainingBytes === 0) {
    next.phase = FixedLengthBodyPhase.FINISHED;
  }

  return next;
}

export function getProgress(state: FixedLengthBodyState): number {
  if (state.remainingBytes === 0) {
    return 1;
  }
  const contentLength = state.remainingBytes + state.decodedBodyBytes;
  return state.decodedBodyBytes / contentLength;
}

export function getRemainingBytes(state: FixedLengthBodyState): number {
  return state.remainingBytes;
}

export function isFixedLengthBodyFinished(state: FixedLengthBodyState) {
  return state.phase === FixedLengthBodyPhase.FINISHED;
}
