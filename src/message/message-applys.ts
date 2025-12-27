import { isStreamBody } from '../body/body-predicates.js';
import { appendHeader } from '../headers/headers.js';
import { isRequestStartLine } from '../start-line/start-line-predicates.js';
import type { Body, Headers, NormalizedHeaders, RequestStartLine, ResponseStartLine } from '../types.js';

export function decideBodyHeaders(
  startLine: RequestStartLine | ResponseStartLine,
  headers: NormalizedHeaders,
  body: Body,
) {
  if (isStreamBody(body)) {
    appendHeader(headers, 'transfer-encoding', 'chunked');
    return;
  }

  if (isRequestStartLine(startLine)) {
    if (method !== 'GET' && method !== 'HEAD') {
      setHeader('Content-Length', '0');
    }
    return;
  }

  setHeader('Content-Length', String(body.length));
}
