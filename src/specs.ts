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

export const CR = 0x0d;
export const LF = 0x0a;
export const CRLF = '\r\n';

export enum HttpDecodePhase {
  START_LINE,
  HEADERS,
  BODY_CHUNKED,
  DISCARDING,
  BODY_CONTENT_LENGTH,
  FINISHED,
}
