import parseInteger from '../parseInteger.js';
import { type Body, type Headers, type NormalizedHeaders } from '../types.js';
import { validateConnectionHeader } from './headers/connection-header.js';

const HOP_BY_HOP_HEADERS = [
  'connection',
  'transfer-encoding',
  'content-length',
  'trailer',
  'upgrade',
  'expect',
  'te',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
] as const;

const FRAMING_HEADERS = [
  'content-length',
  'transfer-encoding',
  'content-encoding',
  'content-type',
  'content-range',
] as const;

function isBodyAsyncIterable(value: Body): value is AsyncIterable<Buffer> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value
  );
}

export function normalizeHeaders(input?: Headers): NormalizedHeaders {
  if (!input) {
    return {};
  }

  const headers: NormalizedHeaders = {};

  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (rawValue == null) {
      continue;
    }

    const key = rawKey.toLowerCase();
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    const normalizedValues = values
      .filter((v): v is string => v != null)
      .map(v => v.trim())
      .filter(v => v.length > 0);

    if (normalizedValues.length === 0) {
      continue;
    }

    if (headers[key]) {
      headers[key].push(...normalizedValues);
    } else {
      headers[key] = normalizedValues;
    }
  }

  return headers;
}

export function getHeaderValue(
  headers: NormalizedHeaders | Headers,
  key: string,
): string[] | undefined {
  const values = headers[key.toLowerCase()];
  if (values == null) {
    return undefined;
  }
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return undefined;
    }
    return values;
  }
  return [values];
}

export function setHeader(
  headers: NormalizedHeaders,
  key: string,
  value: string | string[],
): void {
  const normalizedKey = key.toLowerCase();
  headers[normalizedKey] = Array.isArray(value) ? value : [value];
}

export function appendHeader(
  headers: NormalizedHeaders,
  key: string,
  value: string | string[],
): void {
  const normalizedKey = key.toLowerCase();
  const values = Array.isArray(value) ? value : [value];
  const existing = headers[normalizedKey];
  if (existing) {
    existing.push(...values);
  } else {
    headers[normalizedKey] = values;
  }
}

export function deleteHeader(headers: NormalizedHeaders, key: string): boolean {
  const normalizedKey = key.toLowerCase();
  if (normalizedKey in headers) {
    delete headers[normalizedKey];
    return true;
  }
  return false;
}

export function stripHopByHopHeaders(
  headers: NormalizedHeaders,
): void {
  for (const key of HOP_BY_HOP_HEADERS) {
    delete headers[key];
  }
}

export function sanitizeHeaders(headers: NormalizedHeaders): void {
  const connectionValue = getHeaderValue(headers, 'connection');
  if (connectionValue) {
    const validation = validateConnectionHeader(connectionValue.join(','));
    stripHopByHopHeaders(headers);
    for (const key of validation.hopByHopHeaders) {
      delete headers[key.toLowerCase()];
    }
  }
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

export function isChunked(headers: Headers | NormalizedHeaders): boolean {
  const te = getHeaderValue(headers, 'transfer-encoding');
  if (!te) {
    return false;
  }

  return te.join(',').toLowerCase().includes('chunked');
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

export function hasZeroContentLength(headers: Headers | NormalizedHeaders): boolean {
  const cl = getHeaderValue(headers, 'content-length');
  if (!cl) {
    return false;
  }

  const length = parseInteger(cl[0]!);
  if (length == null) {
    return false;
  }
  return length === 0;
}

export function hasBody(headers: Headers | NormalizedHeaders): boolean {
  const contentLengthValue = getHeaderValue(headers, 'content-length');
  if (contentLengthValue) {
    const length = parseInteger(contentLengthValue[0]!);
    if (length != null && length > 0) {
      return true;
    }
  }

  return isChunked(headers);
}

export function stripFramingHeaders(headers: NormalizedHeaders): void {
  for (const key of FRAMING_HEADERS) {
    delete headers[key];
  }
}
