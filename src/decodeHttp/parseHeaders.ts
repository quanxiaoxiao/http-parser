import { DecodeHttpError } from '../errors.js';
import { type Headers } from '../types.js';
import parseHeaderLine from './parseHeaderLine.js';

export type HeadersState = {
  buffer: Buffer;
  headers: Headers | null;
  finished: boolean;
  rawHeaders: string[];
};

const DOUBLE_CRLF = Buffer.from('\r\n\r\n');
const MAX_HEADER_SIZE = 16 * 1024;

export function createHeadersState(): HeadersState {
  return {
    buffer: Buffer.alloc(0),
    headers: null,
    rawHeaders: [],
    finished: false,
  };
}

function findHeadersEnd(buffer: Buffer): number {
  return buffer.indexOf(DOUBLE_CRLF);
}

function parseHeadersBlock(headersBuffer: Buffer): [Headers, string[]] {
  const headersText = headersBuffer.toString('utf-8');
  const lines = headersText.split('\r\n');
  const headers: Headers = {};

  const rawHeaders = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const parsed = parseHeaderLine(line);
    const [name, value] = parsed;
    rawHeaders.push(name, value);
    const lowerCaseName = name.toLowerCase();
    if (headers[lowerCaseName]) {
      headers[lowerCaseName] = [...(Array.isArray(headers[lowerCaseName]) ? headers[lowerCaseName] : [headers[lowerCaseName]]), value];
    } else {
      headers[lowerCaseName] = value;
    }
  }

  return [headers, rawHeaders];
}

export function parseHeaders(
  prev: HeadersState,
  input: Buffer,
): HeadersState {
  if (prev.finished) {
    throw new DecodeHttpError('Headers parsing already finished');
  }

  const newBuffer = prev.buffer.length > 0
    ? Buffer.concat([prev.buffer, input])
    : input;

  if (newBuffer.length > MAX_HEADER_SIZE) {
    throw new DecodeHttpError(`Headers too large: ${newBuffer.length} bytes exceeds limit of ${MAX_HEADER_SIZE}`);
  }

  const headersEnd = findHeadersEnd(newBuffer);

  if (headersEnd === -1) {
    return {
      buffer: newBuffer,
      headers: null,
      rawHeaders: [],
      finished: false,
    };
  }

  const headersBuffer = newBuffer.slice(0, headersEnd);
  const [headers, rawHeaders] = parseHeadersBlock(headersBuffer);

  return {
    buffer: newBuffer,
    headers,
    rawHeaders,
    finished: true,
  };
}
