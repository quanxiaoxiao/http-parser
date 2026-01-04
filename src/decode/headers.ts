import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { DEFAULT_HEADER_LIMITS } from '../specs.js';
import type { HeaderLimits, Headers } from '../types.js';
import { decodeHttpLine } from './http-line.js';

const CRLF_LENGTH = 2;

function normalizeHeaderValue(value: string): string {
  return value.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
}

export enum HeadersDecodePhase {
  LINE = 'line',
  DONE = 'done',
}

export function decodeHeaderLine(headerBuf: Buffer, limit: HeaderLimits): [string, string] {
  const COLON = 0x3a;
  const len = headerBuf.length;

  if (len > limit.maxHeaderLineBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_LINE_TOO_LARGE,
      message: `Header line exceeds ${limit.maxHeaderLineBytes} bytes`,
    });
  }

  const colonIndex = headerBuf.indexOf(COLON);

  if (colonIndex === -1) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: 'HTTP Header missing ":" separator',
    });
  }

  if (colonIndex > limit.maxHeaderNameBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_NAME_TOO_LARGE,
      message: `Header name exceeds ${limit.maxHeaderNameBytes} bytes`,
    });
  }

  const valueLength = len - colonIndex - 1;

  if (valueLength > limit.maxHeaderValueBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_VALUE_TOO_LARGE,
      message: `Header value exceeds ${limit.maxHeaderValueBytes} bytes`,
    });
  }

  const name = headerBuf.subarray(0, colonIndex).toString('ascii');
  const value = headerBuf.subarray(colonIndex + 1).toString('ascii');

  return [name, value];
}

export interface HeadersState {
  buffer: Buffer | null;
  headers: Headers;
  phase: HeadersDecodePhase,
  receivedBytes: number;
  receivedCount: number;
  rawHeaders: string[];
  limit: HeaderLimits,
}

export function createHeadersState(limit: HeaderLimits = DEFAULT_HEADER_LIMITS): HeadersState {
  return {
    buffer: Buffer.alloc(0),
    headers: {},
    rawHeaders: [],
    phase: HeadersDecodePhase.LINE,
    receivedBytes: 0,
    receivedCount: 0,
    limit,
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
  if (prev.phase === HeadersDecodePhase.DONE) {
    throw new Error('Headers parsing already finished');
  }

  const buffer = prev.buffer.length === 0
    ? input
    : Buffer.concat([prev.buffer, input]);

  const headers = { ...prev.headers };
  const rawHeaders = [...prev.rawHeaders];
  let receivedBytes = prev.receivedBytes;
  let offset = 0;
  let receivedCount = prev.receivedCount;

  let phase = prev.phase;

  while (offset < buffer.length) {
    switch (phase) {
    case HeadersDecodePhase.LINE: {
      let line;
      try {
        line = decodeHttpLine(buffer.subarray(offset), 0, prev.limit.maxHeaderLineBytes);
      } catch (error) {
        if (error instanceof HttpDecodeError) {
          if (error.code === HttpDecodeErrorCode.LINE_TOO_LARGE) {
            throw new HttpDecodeError({
              code: HttpDecodeErrorCode.HEADER_LINE_TOO_LARGE,
              message: 'HTTP header line too large',
            });
          }
          throw new HttpDecodeError({
            code: HttpDecodeErrorCode.INVALID_HEADER,
            message: error.message,
          });
        }
        throw error;
      }
      if (!line) {
        return {
          ...prev,
          buffer: buffer.subarray(offset),
        };
      }

      const lineLength = line.length + CRLF_LENGTH;
      offset += lineLength;

      if (line.length === 0) {
        phase = HeadersDecodePhase.DONE;
        break;
      }

      receivedCount ++;
      receivedBytes += lineLength;

      if (receivedCount > prev.limit.maxHeaderCount) {
        throw new HttpDecodeError({
          code: HttpDecodeErrorCode.HEADER_TOO_MANY,
          message: `headers exceeds limit of ${prev.limit.maxHeaderCount} count`,
        });
      }

      const [name, value] = decodeHeaderLine(line, prev.limit);
      rawHeaders.push(name, value);
      const headerName = name.trim().toLowerCase();
      const headerValue = normalizeHeaderValue(value);
      if (headerName.length === 0 || /\s/.test(headerName)) {
        throw new HttpDecodeError({
          code: HttpDecodeErrorCode.INVALID_HEADER,
          message: 'Invalid HTTP header name',
        });
      }
      addHeader(headers, headerName, headerValue);
      phase = HeadersDecodePhase.LINE;
      break;
    }
    case HeadersDecodePhase.DONE:
      return {
        phase,
        buffer: buffer.subarray(offset),
        receivedCount,
        headers,
        rawHeaders,
        receivedBytes,
        limit: prev.limit,
      };
    default:
      throw new Error('Invalid headers parse state');
    }
    if (phase === HeadersDecodePhase.DONE) {
      break;
    }
  }

  return {
    phase,
    limit: prev.limit,
    buffer: buffer.subarray(offset),
    receivedCount,
    headers,
    rawHeaders,
    receivedBytes,
  };
}

export function isHeadersFinished(state: HeadersState) {
  return state.phase === HeadersDecodePhase.DONE;
}
