import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { DEFAULT_HEADER_LIMITS } from '../specs.js';
import type { HeaderLimits, Headers } from '../types.js';
import { decodeHttpLine } from './http-line.js';

const CRLF_LENGTH = 2;
const COLON = 0x3a;
const INVALID_HEADER_NAME = /[^!#$%&'*+\-.^_`|~0-9a-z]/i;

function checkHeaderLimits(state: HeadersState, lineLength: number) {
  state.receivedBytes += lineLength;

  if (state.receivedBytes > state.limit.maxHeaderBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_TOO_LARGE,
      message: `Headers too large: ${state.receivedBytes} bytes exceeds limit of ${state.limit.maxHeaderBytes}`,
    });
  }

  if (state.rawHeaders.length + 1 > state.limit.maxHeaderCount) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_TOO_MANY,
      message: `headers exceeds limit of ${state.limit.maxHeaderCount} count`,
    });
  }
}

export enum HeadersDecodePhase {
  LINE = 'line',
  DONE = 'done',
}

export function decodeHeaderLine(headerBuf: Buffer, limit: HeaderLimits): [string, string] {
  const len = headerBuf.length;

  if (len > limit.maxHeaderLineBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_LINE_TOO_LARGE,
      message: `Header line exceeds ${limit.maxHeaderLineBytes} bytes`,
    });
  }

  const colonIndex = headerBuf.indexOf(COLON);

  if (colonIndex < 0) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: 'Header missing ":" separator',
    });
  }

  if (colonIndex > limit.maxHeaderNameBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_NAME_TOO_LARGE,
      message: `Header name exceeds ${limit.maxHeaderNameBytes} bytes`,
    });
  }

  const name = headerBuf.subarray(0, colonIndex).toString('ascii');

  if (colonIndex === 0 || /^\s+$/.test(name)) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: 'Header name is empty',
    });
  }

  if (INVALID_HEADER_NAME.test(name.trim())) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: `Invalid characters in header name: ${name}`,
    });
  }

  const valueLength = len - colonIndex - 1;

  if (valueLength > limit.maxHeaderValueBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_VALUE_TOO_LARGE,
      message: `Header value exceeds ${limit.maxHeaderValueBytes} bytes`,
    });
  }

  const value = headerBuf.subarray(colonIndex + 1).toString('ascii');

  return [name, value];
}

export interface HeadersState {
  buffer: Buffer | null;
  headers: Headers;
  phase: HeadersDecodePhase,
  receivedBytes: number;
  rawHeaders: Array<[name: string, value: string]>;
  limit: HeaderLimits,
}

export function createHeadersState(limit: HeaderLimits = DEFAULT_HEADER_LIMITS): HeadersState {
  return {
    buffer: Buffer.alloc(0),
    headers: {},
    rawHeaders: [],
    phase: HeadersDecodePhase.LINE,
    receivedBytes: 0,
    limit,
  };
}

function addHeader(state: HeadersState, name: string, value: string): void {
  const existing = state.headers[name];
  if (existing === undefined) {
    state.headers[name] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    state.headers[name] = [existing, value];
  }
}

export function decodeHeaders(
  prev: HeadersState,
  input: Buffer,
): HeadersState {
  if (prev.phase === HeadersDecodePhase.DONE) {
    throw new Error('Headers parsing already finished');
  }

  const state = {
    ...prev,
    buffer: prev.buffer.length === 0 ? input : Buffer.concat([prev.buffer, input]),
    headers: { ...prev.headers },
    rawHeaders: [...prev.rawHeaders],
  };

  let offset = 0;

  while (offset < state.buffer.length) {
    if (state.phase === HeadersDecodePhase.DONE) {
      break;
    }
    switch (state.phase) {
    case HeadersDecodePhase.LINE: {
      let line;
      try {
        line = decodeHttpLine(state.buffer.subarray(offset), 0, state.limit.maxHeaderLineBytes);
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
        if (state.receivedBytes + (state.buffer.length - offset) > state.limit.maxHeaderBytes) {
          throw new HttpDecodeError({
            code: HttpDecodeErrorCode.HEADER_TOO_LARGE,
            message: `Headers too large: ${state.receivedBytes} bytes exceeds limit of ${state.limit.maxHeaderBytes}`,
          });
        }
        state.buffer = state.buffer.subarray(offset);
        return state;
      }

      const lineLength = line.length + CRLF_LENGTH;
      offset += lineLength;

      if (line.length === 0) {
        state.phase = HeadersDecodePhase.DONE;
        break;
      }

      checkHeaderLimits(state, lineLength);

      const [name, value] = decodeHeaderLine(line, state.limit);
      state.rawHeaders.push([name, value]);
      const headerName = name.trim().toLowerCase();
      const headerValue = value.trim();
      addHeader(state, headerName, headerValue);
      state.phase = HeadersDecodePhase.LINE;
      break;
    }
    case HeadersDecodePhase.DONE:
      state.buffer = state.buffer.subarray(offset);
      return state;
    default:
      throw new Error('Invalid headers parse state');
    }
  }

  state.buffer = state.buffer.subarray(offset);
  return state;
}

export function isHeadersFinished(state: HeadersState) {
  return state.phase === HeadersDecodePhase.DONE;
}
