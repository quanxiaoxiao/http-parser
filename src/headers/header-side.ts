import { BOTH_HEADERS, REQUEST_ONLY_HEADERS, RESPONSE_ONLY_HEADERS } from '../specs.js';

export enum HeaderSide {
  Request = 'request',
  Response = 'response',
  Both = 'both',
  Unknown = 'unknown'
}

const REQUEST_HEADER_SET = new Set(REQUEST_ONLY_HEADERS) as ReadonlySet<string>;;
const RESPONSE_HEADER_SET = new Set(RESPONSE_ONLY_HEADERS) as ReadonlySet<string>;
const BOTH_HEADER_SET = new Set(BOTH_HEADERS) as ReadonlySet<string>;

export function getHeaderSide(headerName: string): HeaderSide {
  if (!headerName) {
    return HeaderSide.Unknown;
  }

  const normalized = headerName.trim().toLowerCase();

  if (REQUEST_HEADER_SET.has(normalized)) {
    return HeaderSide.Request;
  }
  if (RESPONSE_HEADER_SET.has(normalized)) {
    return HeaderSide.Response;
  }
  if (BOTH_HEADER_SET.has(normalized)) {
    return HeaderSide.Both;
  }

  return HeaderSide.Unknown;
}

export function isValidRequestHeader(headerName: string): boolean {
  const side = getHeaderSide(headerName);
  return side !== HeaderSide.Response;
}

export function isValidResponseHeader(headerName: string): boolean {
  const side = getHeaderSide(headerName);
  return side !== HeaderSide.Request;
}
