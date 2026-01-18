import {
  DecodeErrors,
  HttpDecodeError,
  HttpDecodeErrorCode,
} from '../errors.js';
import { DEFAULT_HEADER_LIMITS } from '../specs.js';
import type {
  DecodeLineResult,
  HeaderLimits,
  Headers,
} from '../types.js';
import { decodeHttpLine } from './http-line.js';

const CRLF_LENGTH = 2;
const COLON = 0x3a;
const INVALID_HEADER_NAME = /[^!#$%&'*+\-.^_`|~0-9a-z]/i;

export enum HeadersState {
  LINE = 'line',
  FINISHED = 'finished',
}

export interface HeadersStateData {
  buffer: Buffer;
  state: HeadersState;
  headers: Headers;
  rawHeaders: Array<[name: string, value: string]>,
  rawHeaderLines: string[];
  receivedBytes: number;
  limits: HeaderLimits,
}

function checkHeaderLimits(state: HeadersStateData) {
  if (state.receivedBytes > state.limits.maxHeaderBytes) {
    throw DecodeErrors.headersTooLarge(state.limits.maxHeaderBytes);
  }

  if (state.rawHeaderLines.length >= state.limits.maxHeaderCount) {
    throw DecodeErrors.headersTooMany(state.limits.maxHeaderCount);
  }
}

export function decodeHeaderLine(headerBuf: Buffer, limits: HeaderLimits): [string, string] {
  const len = headerBuf.length;

  if (len > limits.maxHeaderLineBytes) {
    throw DecodeErrors.headerLineTooLarge(limits.maxHeaderLineBytes);
  }

  const colonIndex = headerBuf.indexOf(COLON);

  if (colonIndex < 0) {
    throw DecodeErrors.headerMissingColon();
  }

  if (colonIndex === 0) {
    throw DecodeErrors.headerNameEmpty();
  }

  if (colonIndex > limits.maxHeaderNameBytes) {
    throw DecodeErrors.headerNameTooLarge(limits.maxHeaderNameBytes);
  }

  const name = headerBuf.subarray(0, colonIndex).toString('ascii').trim();

  if (name === '') {
    throw DecodeErrors.headerNameEmpty();
  }

  if (INVALID_HEADER_NAME.test(name)) {
    throw DecodeErrors.invalidHeaderName(name);
  }

  const valueLength = len - colonIndex - 1;

  if (valueLength > limits.maxHeaderValueBytes) {
    throw DecodeErrors.headerValueTooLarge(limits.maxHeaderValueBytes);
  }

  const value = headerBuf.subarray(colonIndex + 1).toString('ascii').trim();

  return [name.toLowerCase(), value];
}

export function createHeadersStateData(limits: HeaderLimits = DEFAULT_HEADER_LIMITS): HeadersStateData {
  return {
    buffer: Buffer.alloc(0),
    headers: {},
    rawHeaders: [],
    rawHeaderLines: [],
    state: HeadersState.LINE,
    receivedBytes: 0,
    limits,
  };
}

function addHeader(state: HeadersStateData, name: string, value: string): void {
  const existing = state.headers[name];
  state.rawHeaders.push([name, value]);
  if (existing === undefined) {
    state.headers[name] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    state.headers[name] = [existing, value];
  }
}

function processHeaderLine(
  state: HeadersStateData,
  buffer: Buffer,
  offset: number,
): { offset: number; shouldContinue: boolean } {
  let lineResult: DecodeLineResult | null;
  try {
    lineResult = decodeHttpLine(
      buffer.subarray(offset),
      0,
      { maxLineLength: state.limits.maxHeaderLineBytes },
    );
  } catch (error) {
    if (error instanceof HttpDecodeError) {
      if (error.code === HttpDecodeErrorCode.LINE_TOO_LARGE) {
        throw DecodeErrors.headerLineTooLarge(state.limits.maxHeaderLineBytes);
      }
      throw DecodeErrors.invalidHeader(error.message);
    }
    throw error;
  }

  const line = lineResult?.line;
  if (!line) {
    const remainingBytes = buffer.length - offset;
    if (state.receivedBytes + remainingBytes > state.limits.maxHeaderBytes) {
      throw DecodeErrors.headersTooLarge(state.limits.maxHeaderBytes);
    }
    return { offset, shouldContinue: false };
  }

  const lineLength = line.length + CRLF_LENGTH;
  const newOffset = offset + lineLength;

  if (line.length === 0) {
    state.state = HeadersState.FINISHED;
    return { offset: newOffset, shouldContinue: false };
  }

  state.receivedBytes += lineLength;

  checkHeaderLimits(state);

  const [headerName, headerValue] = decodeHeaderLine(line, state.limits);
  addHeader(state, headerName, headerValue);
  state.rawHeaderLines.push(line.toString('ascii'));

  return { offset: newOffset, shouldContinue: true };
}

export function decodeHeaders(
  prev: HeadersStateData,
  input: Buffer,
): HeadersStateData {
  if (prev.state === HeadersState.FINISHED) {
    throw new Error('Headers parsing already finished');
  }

  const next: HeadersStateData = {
    ...prev,
    buffer: prev.buffer.length === 0 ? input : Buffer.concat([prev.buffer, input]),
  };

  let offset = 0;

  while (offset < next.buffer.length && next.state !== HeadersState.FINISHED) {
    const result = processHeaderLine(next, next.buffer, offset);
    offset = result.offset;
    if (!result.shouldContinue) {
      break;
    }
  }

  if (offset > 0) {
    next.buffer = next.buffer.subarray(offset);
  }

  return next;
}

export function isHeadersFinished(state: HeadersStateData) {
  return state.state === HeadersState.FINISHED;
}
