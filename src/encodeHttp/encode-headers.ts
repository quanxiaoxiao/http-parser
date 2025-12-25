import { Buffer } from 'node:buffer';

import { type Headers, type NormalizedHeaders } from '../types.js';

const CRLF = '\r\n';

const HEADER_TOKEN_EXCEPTIONS: Record<string, string> = {
  te: 'TE',
  dnt: 'DNT',
  etag: 'ETag',
  www: 'WWW',
  md5: 'MD5',
  csrf: 'CSRF',
};

interface EncodeHeaderOptions {
  encodeValue?: boolean;
}

function capitalizeHeaderToken(token: string): string {
  if (!token) {
    return token;
  }

  const upper = HEADER_TOKEN_EXCEPTIONS[token];
  if (upper) {
    return upper;
  }

  return token.charAt(0).toUpperCase() + token.slice(1);
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

function flatten(
  headerName: string,
  headerValue: string | string[],
): string[] {
  if (Array.isArray(headerValue)) {
    return headerValue.flatMap((value) => [headerName, value]);
  }
  return [headerName, headerValue];
}

function flattenHeadersToArray(headers: Headers): string[] {
  return Object.entries(headers).flatMap(([headerName, headerValue]) => flatten(headerName, headerValue));
}

export function encodeHeaders(headers: Headers | NormalizedHeaders, options?: EncodeHeaderOptions): Buffer {
  const arr = flattenHeadersToArray(headers);
  const shouldEncodeValue = options?.encodeValue ?? false;

  let totalLength = 0;
  const lines: string[] = [];
  for (let i = 0; i < arr.length; i += 2) {
    const headerName = arr[i];
    const headerValue = arr[i + 1];
    const encodedValue = shouldEncodeValue ? encodeURIComponent(headerValue) : headerValue;
    const line = `${canonicalizeHeaderName(headerName)}: ${encodedValue}${CRLF}`;
    lines.push(line);
    totalLength += Buffer.byteLength(line, 'utf8');
  }

  const result = Buffer.allocUnsafe(totalLength);
  let offset = 0;

  for (const line of lines) {
    offset += result.write(line, offset, 'utf8');
  }

  return result;
}
