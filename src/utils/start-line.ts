import { type RequestStartLine, type ResponseStartLine } from '../types.js';

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
  if (startLine.method != null) {
    const method = startLine.method.toUpperCase();
    if (BODYLESS_METHODS.has(method)) {
      return true;
    }
  }

  if (startLine.statusCode != null) {
    if (BODYLESS_STATUS_CODES.has(startLine.statusCode)) {
      return true;
    }
    if (startLine.statusCode >= 100 && startLine.statusCode < 200) {
      return true;
    }
  }

  return false;
}
