import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { DEFAULT_HEADER_LIMITS } from '../specs.js';
import type { HeaderLimits, Headers } from '../types.js';
import { decodeHttpLine } from './http-line.js';

const CRLF_LENGTH = 2;
const COLON = 0x3a;
const INVALID_HEADER_NAME = /[^!#$%&'*+\-.^_`|~0-9a-z]/i;

function checkHeaderLimits(state: HeadersState, lineLength: number) {
  state.receivedBytes += lineLength;

  if (state.receivedBytes > state.limits.maxHeaderBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_TOO_LARGE,
      message: `Headers too large: exceeds limit of ${state.limits.maxHeaderBytes} bytes`,
    });
  }

  if (state.headersRaw.length >= state.limits.maxHeaderCount) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_TOO_MANY,
      message: `Headers too many: exceeds limit of ${state.limits.maxHeaderCount} count`,
    });
  }
}

export enum HeadersDecodePhase {
  LINE = 'line',
  DONE = 'done',
}

export function decodeHeaderLine(headerBuf: Buffer, limits: HeaderLimits): [string, string] {
  const len = headerBuf.length;

  if (len > limits.maxHeaderLineBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_LINE_TOO_LARGE,
      message: `Header line too large: exceeds limit of ${limits.maxHeaderLineBytes} bytes`,
    });
  }

  const colonIndex = headerBuf.indexOf(COLON);

  if (colonIndex < 0) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: 'Header missing ":" separator',
    });
  }

  if (colonIndex === 0) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: 'Header name is empty',
    });
  }

  if (colonIndex > limits.maxHeaderNameBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_NAME_TOO_LARGE,
      message: `Header name too large: exceeds limit of ${limits.maxHeaderNameBytes} bytes`,
    });
  }

  const name = headerBuf.subarray(0, colonIndex).toString('ascii').trim();

  if (name === '') {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: 'Header name is empty',
    });
  }

  if (INVALID_HEADER_NAME.test(name)) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: `Invalid characters in header name: ${name}`,
    });
  }

  const valueLength = len - colonIndex - 1;

  if (valueLength > limits.maxHeaderValueBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_VALUE_TOO_LARGE,
      message: `Header value too large: exceeds limit of ${limits.maxHeaderValueBytes} bytes`,
    });
  }

  const value = headerBuf.subarray(colonIndex + 1).toString('ascii').trim();

  return [name.toLowerCase(), value];
}

export interface HeadersState {
  buffer: Buffer | null;
  headers: Headers;
  phase: HeadersDecodePhase;
  headersRaw: string[];
  receivedBytes: number;
  limits: HeaderLimits,
}

export function createHeadersState(limits: HeaderLimits = DEFAULT_HEADER_LIMITS): HeadersState {
  return {
    buffer: Buffer.alloc(0),
    headers: {},
    headersRaw: [],
    phase: HeadersDecodePhase.LINE,
    receivedBytes: 0,
    limits,
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
    headersRaw: [...prev.headersRaw],
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
        line = decodeHttpLine(state.buffer.subarray(offset), 0, state.limits.maxHeaderLineBytes);
      } catch (error) {
        if (error instanceof HttpDecodeError) {
          if (error.code === HttpDecodeErrorCode.LINE_TOO_LARGE) {
            throw new HttpDecodeError({
              code: HttpDecodeErrorCode.HEADER_LINE_TOO_LARGE,
              message: `HTTP header line too large: exceeds limit of ${state.limits.maxHeaderLineBytes} bytes`,
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
        const remainingBytes = state.buffer.length - offset;
        if (state.receivedBytes + remainingBytes > state.limits.maxHeaderBytes) {
          throw new HttpDecodeError({
            code: HttpDecodeErrorCode.HEADER_TOO_LARGE,
            message: `Headers too large: exceeds limit of ${state.limits.maxHeaderBytes} bytes`,
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

      const [headerName, headerValue] = decodeHeaderLine(line, state.limits);
      addHeader(state, headerName, headerValue);
      state.headersRaw.push(line.toString('ascii'));
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
