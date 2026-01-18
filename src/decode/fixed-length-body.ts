import {
  HttpDecodeError,
  HttpDecodeErrorCode,
} from '../errors.js';
import { DEFAULT_FIXED_LENGTH_BODY_LIMITS } from '../specs.js';
import type {
  BodyType,
  FixedLengthBodyLimits,
} from '../types.js';

export enum FixedLengthBodyState {
  DATA = 'data',
  FINISHED = 'finished',
}

export type FixedLengthBodyState = {
  type: BodyType;
  phase: FixedLengthBodyState,
  buffer: Buffer;
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
    phase: contentLength > 0 ? FixedLengthBodyState.DATA : FixedLengthBodyState.FINISHED,
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
  if (prev.phase === FixedLengthBodyState.FINISHED) {
    throw new Error('Content-Length parsing already finished');
  }

  const inputSize = input.length;
  if (inputSize === 0) {
    return prev;
  }

  const canAccept = Math.min(inputSize, prev.remainingBytes);
  const newRemainingBytes = prev.remainingBytes - canAccept;
  const newDecodedBytes = prev.decodedBodyBytes + canAccept;

  const next: FixedLengthBodyState = {
    ...prev,
    decodedBodyBytes: newDecodedBytes,
    remainingBytes: newRemainingBytes,
    phase: newRemainingBytes === 0 ? FixedLengthBodyState.FINISHED : prev.phase,
    buffer: canAccept < inputSize ? input.subarray(canAccept) : Buffer.alloc(0),
  };

  if (canAccept > 0) {
    const validChunk = canAccept === inputSize ? input : input.subarray(0, canAccept);
    next.chunks.push(validChunk);
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
  return state.phase === FixedLengthBodyState.FINISHED;
}
