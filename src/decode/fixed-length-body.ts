import {
  DecodeErrors,
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

export type FixedLengthBodyStateData = {
  type: BodyType;
  state: FixedLengthBodyState,
  buffer: Buffer;
  chunks: Buffer[];
  decodedBodyBytes: number;
  remainingBytes: number;
  limits: FixedLengthBodyLimits,
};

export function createFixedLengthBodyState(
  contentLength: number,
  limits: FixedLengthBodyLimits = DEFAULT_FIXED_LENGTH_BODY_LIMITS,
): FixedLengthBodyStateData {
  if (!Number.isInteger(contentLength) || contentLength < 0) {
    throw DecodeErrors.invalidContentLength(contentLength);
  }

  if (contentLength > limits.maxBodySize) {
    throw DecodeErrors.contentLengthTooLarge(contentLength, limits.maxBodySize);
  }

  return {
    type: 'fixed',
    state: contentLength > 0 ? FixedLengthBodyState.DATA : FixedLengthBodyState.FINISHED,
    buffer: Buffer.alloc(0),
    remainingBytes: contentLength,
    decodedBodyBytes: 0,
    limits,
    chunks: [],
  };
}

export function decodeFixedLengthBody(
  previous: FixedLengthBodyStateData,
  input: Buffer,
): FixedLengthBodyStateData {
  if (previous.state === FixedLengthBodyState.FINISHED) {
    throw new Error('Content-Length parsing already finished');
  }

  const inputSize = input.length;
  if (inputSize === 0) {
    return previous;
  }

  const canAccept = Math.min(inputSize, previous.remainingBytes);
  const newRemainingBytes = previous.remainingBytes - canAccept;
  const newDecodedBytes = previous.decodedBodyBytes + canAccept;

  const next: FixedLengthBodyStateData = {
    ...previous,
    decodedBodyBytes: newDecodedBytes,
    remainingBytes: newRemainingBytes,
    state: newRemainingBytes === 0 ? FixedLengthBodyState.FINISHED : previous.state,
    buffer: canAccept < inputSize ? input.subarray(canAccept) : Buffer.alloc(0),
  };

  if (canAccept > 0) {
    const validChunk = canAccept === inputSize ? input : input.subarray(0, canAccept);
    next.chunks.push(validChunk);
  }

  return next;
}

export function getProgress(state: FixedLengthBodyStateData): number {
  if (state.remainingBytes === 0) {
    return 1;
  }
  const contentLength = state.remainingBytes + state.decodedBodyBytes;
  return state.decodedBodyBytes / contentLength;
}

export function getRemainingBytes(state: FixedLengthBodyStateData): number {
  return state.remainingBytes;
}

export function isFixedLengthBodyFinished(state: FixedLengthBodyStateData) {
  return state.state === FixedLengthBodyState.FINISHED;
}
