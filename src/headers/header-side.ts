export enum HeaderSide {
  Request = 'request',
  Response = 'response',
  Both = 'both',
  Unknown = 'unknown'
}

const REQUEST_ONLY_HEADERS = [
  'host', 'expect', 'if-match', 'if-none-match', 'if-modified-since',
  'if-unmodified-since', 'if-range', 'range', 'max-forwards', 'te',
  'upgrade', 'accept', 'accept-encoding', 'accept-language', 'accept-charset',
  'user-agent', 'referer', 'origin', 'authorization', 'proxy-authorization',
  'from', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
  'sec-fetch-user', 'dnt', 'purpose',
] as const;

const RESPONSE_ONLY_HEADERS = [
  'accept-ranges', 'age', 'etag', 'last-modified', 'location', 'retry-after',
  'vary', 'content-range', 'allow', 'server', 'set-cookie', 'www-authenticate',
  'proxy-authenticate', 'strict-transport-security', 'content-security-policy',
  'content-security-policy-report-only', 'x-frame-options',
  'x-content-type-options', 'referrer-policy', 'permissions-policy',
  'cross-origin-opener-policy', 'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
] as const;

const BOTH_HEADERS = [
  'content-type', 'content-length', 'content-encoding', 'transfer-encoding',
  'cache-control', 'expires', 'warning', 'date',
] as const;

const REQUEST_HEADER_SET = new Set(REQUEST_ONLY_HEADERS) as Set<string>;;
const RESPONSE_HEADER_SET = new Set(RESPONSE_ONLY_HEADERS) as Set<string>;
const BOTH_HEADER_SET = new Set(BOTH_HEADERS) as Set<string>;

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
