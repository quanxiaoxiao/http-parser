import type { Buffer } from 'node:buffer';

import {
  HttpDecodeError,
  HttpDecodeErrorCode,
} from '../errors.js';
import {
  CR,
  DEFAULT_HTTP_LINE_LIMINTS,
  LF,
} from '../specs.js';
import type {
  DecodeLineResult,
  HttpLineLimits,
} from '../types.js';

const enum HttpLineState {
  DATA = 'data',
  CR = 'cr', // eslint-disable-line
}

export function validateParameters(
  buffer: Buffer,
  offset: number,
  limits: HttpLineLimits = DEFAULT_HTTP_LINE_LIMINTS,
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
  limits: HttpLineLimits = DEFAULT_HTTP_LINE_LIMINTS,
): DecodeLineResult | null {
  validateParameters(buffer, offset, limits);

  let state = HttpLineState.DATA;
  let lineLength = 0;

  const { maxLineLength } = limits;
  const bufferLength = buffer.length;

  for (let cursor = offset; cursor < bufferLength; cursor++) {
    const byte = buffer[cursor];

    switch (state) {
      case HttpLineState.DATA:
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
            message: `HTTP line exceeds maximum length (${maxLineLength})`,
          });
        }
        break;

      case HttpLineState.CR:
        if (byte !== LF) {
          throw new HttpDecodeError({
            code: HttpDecodeErrorCode.INVALID_LINE_ENDING,
            message: 'CR not followed by LF',
          });
        }

        return {
          line: buffer.subarray(offset, cursor - 1),
          bytesConsumed: cursor - offset + 1,
        };
      default:
        throw new Error('unreachable state');
    }
  }

  return null;
}
