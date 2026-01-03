import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { type Headers } from '../types.js';
import { decodeHttpLine } from './http-line.js';

export function decodeHeaderLine(headerString: string): [string, string] {
  const separatorIndex = headerString.indexOf(':');
  if (separatorIndex === -1) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: `HTTP Header missing ':' separator in "${headerString}"`,
    });
  }
  const name = headerString.slice(0, separatorIndex);
  const value = headerString.slice(separatorIndex + 1);

  return [name, value];
}

export interface HeadersState {
  buffer: Buffer | null;
  headers: Headers;
  finished: boolean;
  receivedHeaders: number;
  rawHeaders: string[];
}

const CRLF_LENGTH = 2;

export function createHeadersState(): HeadersState {
  return {
    buffer: Buffer.alloc(0),
    headers: {},
    rawHeaders: [],
    receivedHeaders: 0,
    finished: false,
  };
}

function addHeader(headers: Headers, name: string, value: string): void {
  const existing = headers[name];
  if (existing === undefined) {
    headers[name] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    headers[name] = [existing, value];
  }
}

export function decodeHeaders(
  prev: HeadersState,
  input: Buffer,
): HeadersState {
  if (prev.finished) {
    throw new Error('Headers parsing already finished');
  }

  const buffer = prev.buffer.length === 0
    ? input
    : Buffer.concat([prev.buffer, input]);

  const headers = { ...prev.headers };
  const rawHeaders = [...prev.rawHeaders];
  let receivedHeaders = prev.receivedHeaders;
  let offset = 0;
  let finished = false;

  while (offset < buffer.length) {
    const line = decodeHttpLine(buffer.subarray(offset));
    if (!line) {
      break;
    }

    const lineLength = line.length + CRLF_LENGTH;
    offset += lineLength;

    if (line.length === 0) {
      finished = true;
      break;
    }

    receivedHeaders += lineLength;

    const [name, value] = decodeHeaderLine(line.toString());
    rawHeaders.push(name, value);
    const lowerName = name.trim().toLowerCase();
    const headerValue = value.trim();
    addHeader(headers, lowerName, headerValue);
  }

  return {
    buffer: buffer.subarray(offset),
    headers,
    rawHeaders,
    receivedHeaders,
    finished,
  };
}
