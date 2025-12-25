import type { Body, NormalizedHeaders } from '../../types.js';
import { deleteHeader, setHeader } from './headers.js';

function isBodyAsyncIterable(value: Body): value is AsyncIterable<Buffer> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value
  );
}

export function applyFramingHeaders(
  headers: NormalizedHeaders,
  body: Body,
): void {
  deleteHeader(headers, 'content-length');
  deleteHeader(headers, 'transfer-encoding');
  if (body == null) {
    return;
  }

  if (typeof body === 'string') {
    const length = Buffer.byteLength(body, 'utf8');
    setHeader(headers, 'content-length', length.toString());
    return;
  }

  if (Buffer.isBuffer(body)) {
    setHeader(headers, 'content-length', body.length.toString());
    return;
  }

  if (isBodyAsyncIterable(body)) {
    setHeader(headers, 'transfer-encoding', 'chunked');
    return;
  }

  throw new Error('Unsupported body type');
}

export function applyHostHeader(
  headers: NormalizedHeaders,
  host: string,
): void {
  if (!host) {
    throw new Error('Client request requires host');
  }

  setHeader(headers, 'host', host);
}
