import parseInteger from '../parseInteger.js';
import { type Headers } from '../types.js';

function getHeaderValue(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

export function hasBody(headers: Headers): boolean {
  const contentLengthValue = getHeaderValue(headers, 'content-length');
  if (contentLengthValue) {
    const length = parseInteger(contentLengthValue);
    if (length != null && length > 0) {
      return true;
    }
  }

  const transferEncodingValue = getHeaderValue(headers, 'transfer-encoding');
  if (transferEncodingValue) {
    if (transferEncodingValue.toLowerCase().includes('chunked')) {
      return true;
    }
  }
  return false;
}
