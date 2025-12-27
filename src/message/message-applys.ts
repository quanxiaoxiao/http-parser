import { isRequestStartLine } from '../start-line/start-line-predicates.js';
import type { Body, Headers,RequestStartLine, ResponseStartLine } from '../types.js';

export function decideBodyHeaders(
  startLine: RequestStartLine | ResponseStartLine,
  headers: Headers,
  body: Body,
) {
  if (isRequestStartLine(startLine)) {
    if (method !== 'GET' && method !== 'HEAD') {
      setHeader('Content-Length', '0');
    }
    return;
  }

  if (isStream(body)) {
    setHeader('Transfer-Encoding', 'chunked');
    return;
  }

  setHeader('Content-Length', String(body.length));
}
