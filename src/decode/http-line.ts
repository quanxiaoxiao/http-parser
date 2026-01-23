import type { Buffer } from 'node:buffer';

import { DecodeErrors } from '../errors.js';
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

  const { length } = buffer;

  if (length === 0) {
    if (offset !== 0) {
      throw new RangeError('offset must be 0 for empty buffer');
    }
    return;
  }

  if (offset > length - 1) {
    throw new RangeError(`offset (${offset}) exceeds buffer length (${length})`);
  }

  if (offset === length) {
    throw new RangeError(`offset (${offset}) equals buffer length (${length})`);
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
          throw DecodeErrors.lfWithoutCr();
        }

        if (++lineLength > maxLineLength) {
          throw DecodeErrors.httpLineTooLarge(maxLineLength);
        }
        break;

      case HttpLineState.CR:
        if (byte !== LF) {
          throw DecodeErrors.crNotFollowedByLf();
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
