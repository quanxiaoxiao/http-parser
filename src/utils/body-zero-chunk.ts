import { type Headers, type HttpMessage } from '../types.js';
import { getHeaderValue } from './headers.js';
import { parseInteger } from '../parseInteger.js';

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'CONNECT', 'TRACE', 'OPTIONS']);

const BODYLESS_STATUS_CODES = new Set([
  100, // Continue
  101, // Switching Protocols
  102, // Processing
  103, // Early Hints
  204, // No Content
  205, // Reset Content
  304, // Not Modified
]);

const FRAMING_HEADERS = [
  'content-length',
  'transfer-encoding',
  'content-encoding',
  'content-type',
  'content-range',
] as const;

export function bodyNotAllowed(msg: HttpMessage): boolean {
  if (msg.method) {
    const method = msg.method.toUpperCase();
    if (BODYLESS_METHODS.has(method)) {
      return true;
    }
  }

  if (msg.statusCode !== undefined) {
    if (BODYLESS_STATUS_CODES.has(msg.statusCode)) {
      return true;
    }
    if (msg.statusCode >= 100 && msg.statusCode < 200) {
      return true;
    }
  }

  return false;
}

function isChunked(msg: HttpMessage): boolean {
  const te = getHeaderValue(msg.headers, 'transfer-encoding');
  if (!te) {
    return false;
  }

  return te.join(',').toLowerCase().includes('chunked');
}

function isZeroChunkOnly(body: string | Buffer | null | undefined): boolean {
  if (body == null) {
    return true;
  }

  if (Buffer.isBuffer(body)) {
    const zeroChunk = Buffer.from('0\r\n\r\n');
    if (body.length === 5 && body.equals(zeroChunk)) {
      return true;
    }
    if (body.length === 0) {
      return true;
    }
  }

  if (typeof body === 'string') {
    const trimmed = body.trim();
    return trimmed === '' || trimmed === '0\r\n\r\n' || trimmed === '0';
  }

  return false;
}

function stripFramingHeaders(msg: HttpMessage): void {
  for (const header of FRAMING_HEADERS) {
    delete msg.headers[header];
    for (const key of Object.keys(msg.headers)) {
      if (key.toLowerCase() === header) {
        delete msg.headers[key];
      }
    }
  }
}

function hasZeroContentLength(msg: HttpMessage): boolean {
  const cl = getHeaderValue(msg.headers, 'content-length');
  if (!cl) {
    return false;
  }

  const length = parseInteger(cl[0] as string);
  if (length == null) {
    return false;
  }
  return length === 0;
}

export function normalizeZeroLengthBody(msg: HttpMessage): HttpMessage {
  const normalized = { ...msg, headers: { ...msg.headers } };

  if (bodyNotAllowed(normalized)) {
    stripFramingHeaders(normalized);
    normalized.body = null;
    return normalized;
  }

  if (hasZeroContentLength(normalized)) {
    stripFramingHeaders(normalized);
    normalized.body = null;
    return normalized;
  }

  if (isChunked(normalized) && isZeroChunkOnly(normalized.body)) {
    stripFramingHeaders(normalized);
    normalized.body = null;
    return normalized;
  }

  return normalized;
}

export function isNormalized(msg: HttpMessage): boolean {
  if (msg.body === null) {
    return !FRAMING_HEADERS.some(h => getHeaderValue(msg.headers, h) != null);
  }
  return true;
}
