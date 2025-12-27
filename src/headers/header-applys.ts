import { isStreamBody } from '../body/body-predicates.js';
import type { Body, NormalizedHeaders } from '../types.js';
import { deleteHeader, setHeader } from './headers.js';

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

  if (isStreamBody(body)) {
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
