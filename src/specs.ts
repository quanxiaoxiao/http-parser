import type { ChunkedBodyLimits, HeaderLimits, StartLineLimits } from './types.js';

export const REQUEST_ONLY_HEADERS = [
  'host', 'expect', 'if-match', 'if-none-match', 'if-modified-since',
  'if-unmodified-since', 'if-range', 'range', 'max-forwards', 'te',
  'upgrade', 'accept', 'accept-encoding', 'accept-language', 'accept-charset',
  'user-agent', 'referer', 'origin', 'authorization', 'proxy-authorization',
  'from', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
  'sec-fetch-user', 'dnt', 'purpose',
] as const;

export const RESPONSE_ONLY_HEADERS = [
  'accept-ranges', 'age', 'etag', 'last-modified', 'location', 'retry-after',
  'vary', 'content-range', 'allow', 'server', 'set-cookie', 'www-authenticate',
  'proxy-authenticate', 'strict-transport-security', 'content-security-policy',
  'content-security-policy-report-only', 'x-frame-options',
  'x-content-type-options', 'referrer-policy', 'permissions-policy',
  'cross-origin-opener-policy', 'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
] as const;

export const BOTH_HEADERS = [
  'content-type', 'content-length', 'content-encoding', 'transfer-encoding',
  'cache-control', 'expires', 'warning', 'date',
] as const;

export const STANDARD_HEADERS = [
  ...REQUEST_ONLY_HEADERS,
  ...RESPONSE_ONLY_HEADERS,
  ...BOTH_HEADERS,
] as const;

export const HttpMethods = ['GET', 'PUT', 'DELETE', 'POST',
  'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'] as const;

export const CR = 0x0d;
export const LF = 0x0a;
export const CRLF = '\r\n';

export const MAX_LINE_SIZE = 16 * 1024;

export enum HttpDecodePhase {
  START_LINE,
  HEADERS,
  BODY_CHUNKED,
  DISCARDING,
  BODY_CONTENT_LENGTH,
  FINISHED,
}

export const MAX_CHUNK_SIZE = 8 * 1024 * 1024;
export const MAX_CHUNK_COUNT = 10_000;
export const MAX_CHUNK_DURATION = 30_000;

export const DEFAULT_HEADER_LIMITS: HeaderLimits = {
  maxHeaderCount: 100,
  maxHeaderBytes: 32 * 1024,
  maxHeaderNameBytes: 256,
  maxHeaderValueBytes: 8 * 1024,
  maxHeaderLineBytes: 8 * 1024 + 256 + 1,
} as const;

export const DEFAULT_START_LINE_LIMITS: StartLineLimits = {
  maxStartLineBytes: 8 * 1024,
  maxMethodBytes: 32,
  maxUriBytes: 4 * 1024,
  maxReasonPhraseBytes: 512,
} as const;

export const DEFAULT_CHUNKED_BODY_LIMITS: ChunkedBodyLimits = {
  maxChunkCount: 1024,

  maxChunkSize: 8 * 1024 * 1024,
  maxChunkDataBytes: 8 * 1024 * 1024,

  maxChunkLineBytes: 1024,
  maxChunkExtensionsBytes: 512,

  maxTotalBodyBytes: 64 * 1024 * 1024,

  maxTrailerHeaderCount: 32,
  maxTrailerHeaderBytes: 8 * 1024,
} as const;
