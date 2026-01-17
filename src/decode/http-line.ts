import { Buffer } from 'node:buffer';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { CR, LF } from '../specs.js';
import type { DecodeLineResult, HttpLineLimits } from '../types.js';

const enum HttpLineState {
  DATA,
  CR,
  DONE,
}

export function validateParameters(
  buffer: Buffer,
  offset: number,
  limits: HttpLineLimits,
): void {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new TypeError('offset must be a non-negative integer');
  }

  if (!Number.isInteger(limits.maxLineLength) || limits.maxLineLength <= 0) {
    throw new TypeError('maxLineLength must be a positive integer');
  }

  const len = buffer.length;

  if (len === 0) {
    if (offset !== 0) {
      throw new RangeError('offset must be 0 for empty buffer');
    }
    return;
  }

  if (offset > len - 1) {
    throw new RangeError(`offset (${offset}) exceeds buffer length (${len})`);
  }

  if (offset === len) {
    throw new RangeError(`offset (${offset}) equals buffer length (${len})`);
  }
}

export function decodeHttpLine(
  buffer: Buffer,
  offset: number,
  limits: HttpLineLimits,
): DecodeLineResult | null {
  validateParameters(buffer, offset, limits);
  let state = HttpLineState.DATA;
  let lineLength = 0;
  const { maxLineLength } = limits;
  const bufferLength = buffer.length;

  for (let cursor = offset; cursor < bufferLength; cursor++) {
    const byte = buffer[cursor];

    if (state === HttpLineState.DATA) {
      if (byte === CR) {
        state = HttpLineState.CR;
        continue;
      }

      if (byte === LF) {
        throw new HttpDecodeError({
          code: HttpDecodeErrorCode.INVALID_LINE_ENDING,
          message: 'LF without preceding CR',
        });
      }

      if (++lineLength > maxLineLength) {
        throw new HttpDecodeError({
          code: HttpDecodeErrorCode.LINE_TOO_LARGE,
          message: 'HTTP line exceeds maximum length',
        });
      }
    } else if (state === HttpLineState.CR) {
      if (byte !== LF) {
        throw new HttpDecodeError({
          code: HttpDecodeErrorCode.INVALID_LINE_ENDING,
          message: 'CR not followed by LF',
        });
      }

      const lineEnd = cursor - 1;
      return {
        line: buffer.subarray(offset, lineEnd),
        bytesConsumed: cursor - offset + 1,
      };
    }
  }

  return null;
}
