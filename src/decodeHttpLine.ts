import { Buffer } from 'node:buffer';

import { DecodeHttpError } from './errors.js';

const MAX_LINE_SIZE = 16 * 1024;
const CR = 0x0d;
const LF = 0x0a;

function throwDecodeHttpError(message: string): never {
  throw new DecodeHttpError(`Decode Http Error: ${message}`);
}

function validateParameters(buf: Buffer, start: number, limit: number): void {
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
  }

  if (len > 0 && start > len - 1) {
    throw new RangeError(`start (${start}) exceeds buffer length (${len})`);
  }
}

function findLineEnd(
  buf: Buffer,
  start: number,
  limit: number,
  len: number,
): Buffer | null {
  const searchEnd = Math.min(len, start + limit + 1);

  for (let i = start + 1; i < searchEnd; i++) {
    if (buf[i] === LF) {
      if (buf[i - 1] !== CR) {
        throwDecodeHttpError('LF must be preceded by CR (expected CRLF)');
      }
      return buf.subarray(start, i - 1);
    }
  }

  if (len - start > limit) {
    throwDecodeHttpError(`line length exceeds limit of ${limit} bytes`);
  }

  return null;
}

export function decodeHttpLine(
  buf: Buffer,
  start: number = 0,
  limit: number = MAX_LINE_SIZE,
): Buffer | null {
  validateParameters(buf, start, limit);

  const len = buf.length;

  if (len === 0) return null;

  if (buf[start] === LF) {
    throwDecodeHttpError('line cannot start with LF');
  }

  if (len === 1) return null;

  return findLineEnd(buf, start, limit, len);
}
