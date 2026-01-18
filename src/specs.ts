import type {
  ChunkedBodyLimits, FixedLengthBodyLimits, HeaderLimits, HttpLineLimits, StartLineLimits,
} from './types.js';

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

export enum HttpDecodeState {
  START_LINE = 'start_line',
  HEADERS = 'headers',
  BODY_CHUNKED = 'body_chunked',
  BODY_FIXED_LENGTH = 'body_fixed_length',
  BODY_CLOSE_DELIMITED = 'body_close_delimited',
  UPGRADE = 'upgrade', // HTTP framing 终止，协议移交
  FINISHED = 'finished', // HTTP message 完整结束
}

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

export const DEFAULT_FIXED_LENGTH_BODY_LIMITS: FixedLengthBodyLimits = {
  maxBodySize: 8 * 1024 * 1024,
  maxReadChunkSize: 64 * 1024,
  maxBodyReadTimeMs: 30_000,
  allowEmptyBody: true,
} as const;

export const DEFAULT_CHUNKED_BODY_LIMITS: ChunkedBodyLimits = {
  maxBodySize: 8 * 1024 * 1024,
  maxReadChunkSize: 64 * 1024,
  maxBodyReadTimeMs: 30_000,
  maxChunkSizeHexDigits: 8,
  maxChunkExtensionLength: 256,

  maxChunkSize: 1 * 1024 * 1024,
  maxChunks: 1024,
  maxTrailers: 32,
  maxTrailerSize: 8 * 1024,
} as const;

export const DEFAULT_HTTP_LINE_LIMINTS: HttpLineLimits = {
  maxLineLength: 16 * 1024,
} as const;
