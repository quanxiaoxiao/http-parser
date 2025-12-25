import { Buffer } from 'node:buffer';

import { type Headers, type NormalizedHeaders } from '../types.js';

const CRLF = '\r\n';
const CRLF_BUFFER = Buffer.from(CRLF, 'utf8');

const HEADER_TOKEN_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  ['te', 'TE'],
  ['dnt', 'DNT'],
  ['etag', 'ETag'],
  ['www', 'WWW'],
  ['md5', 'MD5'],
  ['csrf', 'CSRF'],
]);

interface EncodeHeaderOptions {
  encodeValue?: boolean;
}

function capitalizeHeaderToken(token: string): string {
  if (!token) {
    return token;
  }

  const exception = HEADER_TOKEN_EXCEPTIONS.get(token);
  if (exception) {
    return exception;
  }
  return token[0].toUpperCase() + token.slice(1);
}

function canonicalizeHeaderName(name: string): string {
  if (!name) {
    return '';
  }

  return name
    .toLowerCase()
    .split('-')
    .map(capitalizeHeaderToken)
    .join('-');
}

export function encodeHeaders(
  headers: Headers | NormalizedHeaders,
  options?: EncodeHeaderOptions,
): Buffer {
  const shouldEncodeValue = options?.encodeValue ?? false;

  const buffers: Buffer[] = [];

  for (const [headerName, headerValue] of Object.entries(headers)) {
    const values = Array.isArray(headerValue) ? headerValue : [headerValue];
    const canonicalName = canonicalizeHeaderName(headerName);
    for (const value of values) {
      const processedValue = shouldEncodeValue
        ? encodeURIComponent(value)
        : value;
      const nameBuffer = Buffer.from(`${canonicalName}: `, 'utf8');
      const valueBuffer = Buffer.from(processedValue, 'utf8');
      buffers.push(nameBuffer, valueBuffer, CRLF_BUFFER);
    }
  }

  return Buffer.concat(buffers);
}
