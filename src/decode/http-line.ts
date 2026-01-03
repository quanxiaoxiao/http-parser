import { Buffer } from 'node:buffer';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { CR, LF } from '../specs.js';

const MAX_LINE_SIZE = 16 * 1024;

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
        throw new HttpDecodeError({
          code: HttpDecodeErrorCode.BARE_LF,
          message: 'LF without preceding CR',
        });
      }
      return buf.subarray(start, i - 1);
    }
    if (buf[i] === CR && i + 1 < searchEnd && buf[i + 1] !== LF) {
      throw new HttpDecodeError({
        code: HttpDecodeErrorCode.BARE_CR,
        message: 'CR without following LF',
      });
    }
  }

  if (len - start > limit) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.LINE_TOO_LARGE,
      message: `line length exceeds limit of ${limit} bytes`,
    });
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

  if (len === 0) {
    return null;
  }

  if (buf[start] === LF) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.BARE_LF,
      message: 'Line starts with bare LF',
    });
  }

  if (len === 1) {
    return null;
  }

  return findLineEnd(buf, start, limit, len);
}
