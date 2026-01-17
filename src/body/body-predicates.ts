import { CRLF } from '../specs.js';
import type { Body } from '../types.js';

export function isZeroChunkOnly(body: string | Buffer | null | undefined): boolean {
  if (body == null) {
    return true;
  }

  if (Buffer.isBuffer(body)) {
    if (body.length === 0) {
      return true;
    }
    if (body.length === 5) {
      const zeroChunk = Buffer.from(`0${CRLF}${CRLF}`);
      return body.equals(zeroChunk);
    }
    return false;
  }

  if (typeof body === 'string') {
    const trimmed = body.trim();
    return trimmed === '' || trimmed === '0' || trimmed === `0${CRLF}${CRLF}`;
  }

  return false;
}

export function isStreamBody(value: Body): value is AsyncIterable<Buffer> {
  return (
    value != null &&
    typeof value === 'object' &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  );
}
