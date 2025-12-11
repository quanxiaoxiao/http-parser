import { Buffer } from 'node:buffer';

import { DecodeHttpError } from './errors.js';

const MAX_LINE_SIZE = 4 * 1024; // 4KB
const CR = 0x0d;
const LF = 0x0a;

function throwDecodeHttpError(message: string | null): never {
  const errorMsg = message
    ? `Decode Http Error, ${message}`
    : 'Decode Http Error';
  throw new DecodeHttpError(errorMsg);
}

export default (
  buf: Buffer,
  start: number = 0,
  limit: number = MAX_LINE_SIZE,
  message: string | null = null,
): Buffer | null => {
  if (!Number.isInteger(start) || start < 0) {
    throw new TypeError('start must be a non-negative integer');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new TypeError('limit must be a positive integer');
  }

  const len = buf.length;

  if (len === 0) {
    if (start !== 0) {
      throw new RangeError('start must be 0 for empty buffer');
    }
    return null;
  }

  if (start > len - 1) {
    throw new RangeError('start must be within buffer bounds');
  }

  if (buf[start] === LF) {
    throwDecodeHttpError(message);
  }

  if (len === 1) {
    return null;
  }

  const end = Math.min(len, start + limit + 1);
  for (let i = start; i < end; i++) {
    if (buf[i] === LF) {
      if (i === start || buf[i - 1] !== CR) {
        throwDecodeHttpError(message);
      }
      return buf.subarray(start, i - 1);
    }
  }

  if (len - start >= limit) {
    throwDecodeHttpError(message);
  }

  return null;
};
