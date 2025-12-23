import parseInteger from '../parseInteger.js';
import { type Headers, type NormalizedHeaders } from '../types.js';
import { getHeaderValue } from './headers.js';

export function hasBody(headers: Headers | NormalizedHeaders): boolean {
  const contentLengthValue = getHeaderValue(headers, 'content-length');
  if (contentLengthValue) {
    const length = parseInteger(contentLengthValue[0]);
    if (length != null && length > 0) {
      return true;
    }
  }

  const transferEncoding = getHeaderValue(headers, 'transfer-encoding');
  if (transferEncoding?.some((value) => value.toLowerCase().includes('chunked'))) {
    return true;
  }

  return false;
}
