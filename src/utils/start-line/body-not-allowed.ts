import type { RequestStartLine, ResponseStartLine } from '../../types.js';
import { isRequestStartLine } from './is-request.js';
import { isResponseStartLine } from './is-response.js';

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'CONNECT', 'TRACE', 'OPTIONS']);

const BODYLESS_STATUS_CODES = new Set([
  100, // Continue
  101, // Switching Protocols
  102, // Processing
  103, // Early Hints
  204, // No Content
  205, // Reset Content
  304, // Not Modified
]);

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
