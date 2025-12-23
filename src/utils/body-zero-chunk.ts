import { type Headers, type HttpMessage } from '../types.js';
import { getHeaderValue } from './headers.js';

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

function bodyNotAllowed(msg: HttpMessage): boolean {
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

/**
 * Check if Transfer-Encoding contains "chunked"
 */
function isChunked(msg: HttpMessage): boolean {
  const te = getHeaderValue(msg.headers, 'transfer-encoding');
  if (!te) {
    return false;
  }

  const encodings = Array.isArray(te)
    ? te.join(',').toLowerCase()
    : te.toLowerCase();

  return encodings.includes('chunked');
}

function isZeroChunkOnly(body: unknown): boolean {
  if (body === null || body === undefined) {
    return true;
  }

  if (Buffer.isBuffer(body)) {
    const zeroChunk = Buffer.from('0\r\n\r\n');
    const altZeroChunk = Buffer.from('0\r\n\r\n'); // with optional trailers
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

  // For streams or other body types, check if empty
  if (Array.isArray(body)) {
    return body.length === 0;
  }

  return false;
}

/**
 * Get header value in case-insensitive manner
 */

/**
 * Remove framing-related headers
 */
function stripFramingHeaders(msg: HttpMessage): void {
  for (const header of FRAMING_HEADERS) {
    // Remove both lowercase and original case versions
    delete msg.headers[header];
    
    // Case-insensitive removal
    for (const key of Object.keys(msg.headers)) {
      if (key.toLowerCase() === header) {
        delete msg.headers[key];
      }
    }
  }
}

/**
 * Check if Content-Length header indicates zero length
 */
function hasZeroContentLength(msg: HttpMessage): boolean {
  const cl = getHeaderValue(msg.headers, 'content-length');
  
  if (!cl) return false;

  const value = Array.isArray(cl) ? cl[0] : cl;
  
  // Parse and validate
  const length = parseInt(value, 10);
  return !isNaN(length) && length === 0;
}

export function normalizeZeroLengthBody(msg: HttpMessage): HttpMessage {
  // Create a shallow copy to avoid mutating the original
  const normalized = { ...msg, headers: { ...msg.headers } };

  // Rule 1: Method/Status semantically prohibits body
  if (bodyNotAllowed(normalized)) {
    stripFramingHeaders(normalized);
    normalized.body = null;
    return normalized;
  }

  // Rule 2: Explicit Content-Length: 0
  if (hasZeroContentLength(normalized)) {
    stripFramingHeaders(normalized);
    normalized.body = null;
    return normalized;
  }

  // Rule 3: Chunked encoding with only zero-length chunk
  if (isChunked(normalized) && isZeroChunkOnly(normalized.body)) {
    stripFramingHeaders(normalized);
    normalized.body = null;
    return normalized;
  }

  return normalized;
}

/**
 * Validate if a message has been properly normalized
 */
export function isNormalized(msg: HttpMessage): boolean {
  if (msg.body === null) {
    // If body is null, framing headers should be removed
    return !FRAMING_HEADERS.some(h => getHeaderValue(msg.headers, h) !== undefined);
  }
  return true;
}

// Example usage and tests
if (require.main === module) {
  // Test 1: GET request (method prohibits body)
  const getRequest: HttpMessage = {
    method: 'GET',
    headers: { 'content-length': '100' },
    body: 'some data',
  };
  console.log('GET request:', normalizeZeroLengthBody(getRequest));

  // Test 2: 204 No Content (status prohibits body)
  const noContentResponse: HttpMessage = {
    statusCode: 204,
    headers: { 'content-length': '50' },
    body: 'data',
  };
  console.log('204 response:', normalizeZeroLengthBody(noContentResponse));

  // Test 3: Content-Length: 0
  const zeroLengthPost: HttpMessage = {
    method: 'POST',
    headers: { 'content-length': '0' },
    body: '',
  };
  console.log('Zero-length POST:', normalizeZeroLengthBody(zeroLengthPost));

  // Test 4: Chunked with zero chunk
  const chunkedEmpty: HttpMessage = {
    method: 'POST',
    headers: { 'transfer-encoding': 'chunked' },
    body: '0\r\n\r\n',
  };
  console.log('Chunked empty:', normalizeZeroLengthBody(chunkedEmpty));
}
