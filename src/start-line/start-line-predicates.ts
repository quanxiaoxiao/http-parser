import type {
  RequestStartLine, ResponseStartLine,
} from '../types.js';

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'CONNECT', 'TRACE', 'OPTIONS']) as ReadonlySet<string>;

const HTTP_METHODS = [
  'GET',
  'PUT',
  'DELETE',
  'POST',
  'PATCH',
  'HEAD',
  'OPTIONS',
  'CONNECT',
] as const;

const BODYLESS_STATUS_CODES = new Set([
  100, // Continue
  101, // Switching Protocols
  102, // Processing
  103, // Early Hints
  204, // No Content
  205, // Reset Content
  304, // Not Modified
]) as ReadonlySet<number>;

type HttpMethod = typeof HTTP_METHODS[number];

export function isRequestStartLine(startLine: RequestStartLine | ResponseStartLine): startLine is RequestStartLine {
  return 'method' in startLine;
}

export function isResponseStartLine(startLine: RequestStartLine | ResponseStartLine): startLine is ResponseStartLine {
  return 'statusCode' in startLine;
}

export function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.includes(value as HttpMethod);
}

export function bodyNotAllowed(startLine: RequestStartLine | ResponseStartLine): boolean {
  if (isRequestStartLine(startLine) && startLine.method) {
    if (BODYLESS_METHODS.has(startLine.method.toUpperCase())) {
      return true;
    }
  }

  if (isResponseStartLine(startLine) && startLine.statusCode != null) {
    const { statusCode } = startLine;
    if (BODYLESS_STATUS_CODES.has(statusCode)) {
      return true;
    }
    if (statusCode >= 100 && statusCode < 200) {
      return true;
    }
  }

  return false;
}
