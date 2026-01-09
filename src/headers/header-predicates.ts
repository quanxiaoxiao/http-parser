import type { Headers, NormalizedHeaders } from '../types.js';
import { parseInteger } from '../utils/number.js';
import { getHeaderValue } from './headers.js';

export function isChunked(headers: Headers | NormalizedHeaders): boolean {
  const te = getHeaderValue(headers, 'transfer-encoding');
  if (!te) {
    return false;
  }

  return te.join(',').toLowerCase().includes('chunked');
}

export function hasBody(headers: Headers | NormalizedHeaders): boolean {
  const contentLengthValue = getHeaderValue(headers, 'content-length');
  if (contentLengthValue) {
    const length = parseInteger(contentLengthValue[0]!.trim());
    if (length != null && length > 0) {
      return true;
    }
  }

  return isChunked(headers);
}

export function hasZeroContentLength(headers: Headers | NormalizedHeaders): boolean {
  const cl = getHeaderValue(headers, 'content-length');
  if (!cl) {
    return false;
  }

  const length = parseInteger(cl[0]!.trim());
  if (length == null) {
    return false;
  }
  return length === 0;
}
