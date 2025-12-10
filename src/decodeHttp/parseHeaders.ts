import { DecodeHttpError } from '../errors.js';
import { type Headers } from '../types.js';
import parseHeaderLine from './parseHeaderLine.js';

export interface HeadersState {
  buffer: Buffer;
  headers: Headers | null;
  finished: boolean;
  rawHeaders: string[];
}

const DOUBLE_CRLF = Buffer.from('\r\n\r\n');
const DOUBLE_CRLF_LENGTH = 4;
const CRLF = '\r\n';
const MAX_HEADER_SIZE = 16 * 1024; // 16KB

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
  const lines = headersText.split(CRLF);
  const headers: Headers = {};
  const rawHeaders: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const [name, value] = parseHeaderLine(line);
    rawHeaders.push(name, value);
    const lowerName = name.toLowerCase();
    const existing = headers[lowerName];
    if (existing !== undefined) {
      headers[lowerName] = Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
    } else {
      headers[lowerName] = value;
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

  const headersBuffer = newBuffer.subarray(0, headersEnd);
  const [headers, rawHeaders] = parseHeadersBlock(headersBuffer);

  return {
    buffer: newBuffer.subarray(headersEnd + DOUBLE_CRLF_LENGTH),
    headers,
    rawHeaders,
    finished: true,
  };
}
