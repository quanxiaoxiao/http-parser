import { decodeHttpLine } from '../decodeHttpLine.js';
import { DecodeHttpError } from '../errors.js';
import { type Headers } from '../types.js';
import parseHeaderLine from './parseHeaderLine.js';

export interface HeadersState {
  buffer: Buffer;
  headers: Headers;
  finished: boolean;
  bytesReceived: number;
  rawHeaders: string[];
}

const CRLF_LENGTH = 2;

export function createHeadersState(): HeadersState {
  return {
    buffer: Buffer.alloc(0),
    headers: {},
    rawHeaders: [],
    bytesReceived: 0,
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

export function parseHeaders(
  prev: HeadersState,
  input: Buffer,
  onHeader?: (field: string, value: string, headers: Headers) => void,
): HeadersState {
  if (prev.finished) {
    throw new DecodeHttpError('Headers parsing already finished');
  }

  const buffer = prev.buffer.length === 0
    ? input
    : Buffer.concat([prev.buffer, input]);

  const headers = { ...prev.headers };
  const rawHeaders = [...prev.rawHeaders];
  let bytesReceived = prev.bytesReceived;
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
      bytesReceived += line.length;
      finished = true;
      break;
    }

    bytesReceived += lineLength;

    const [name, value] = parseHeaderLine(line.toString());
    rawHeaders.push(name, value);
    const lowerName = name.toLowerCase();
    addHeader(headers, lowerName, value);
    if (onHeader) {
      onHeader(lowerName, value, headers);
    }
  }

  return {
    buffer: buffer.subarray(offset),
    headers,
    rawHeaders,
    bytesReceived,
    finished,
  };
}
