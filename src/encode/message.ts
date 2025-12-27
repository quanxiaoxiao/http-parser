import { isStreamBody } from '../body/body-predicates.js';
import { applyFramingHeaders } from '../headers/header-applys.js';
import { normalizeHeaders } from '../headers/header-normalize.js';
import { stripHopByHopHeaders } from '../headers/header-strips.js';
import type { Body, Headers, RequestStartLine } from '../types.js';
import { encodeChunkedStream } from './body-chunked.js';
import { encodeHeaders } from './headers.js';
import { encodeHttpLine } from './http-line.js';
import { encodeRequestLine } from './start-line.js';

async function* encodeBody(body: Body): AsyncGenerator<Buffer> {
  if (isStreamBody(body)) {
    yield* encodeChunkedStream(body);
    return;
  }
  if (typeof body === 'string') {
    if (body === '') {
      return;
    }
    yield Buffer.from(body, 'utf-8');
    return;
  }
  if (Buffer.isBuffer(body)) {
    if (body.length === 0) {
      return;
    }
    yield body;
    return;
  }
  throw new TypeError(`Unsupported body type: ${typeof body}`);
}

export async function* encodeRequest({
  startLine,
  headers,
  body,
}: { startLine: RequestStartLine, headers: Headers, body?: Body}) {
  yield encodeHttpLine(encodeRequestLine(startLine));
  const headersNormalized = normalizeHeaders(headers);
  stripHopByHopHeaders(headersNormalized);
  applyFramingHeaders(headersNormalized, body);
  yield encodeHttpLine(encodeHeaders(headersNormalized));

  if (body != null) {
    yield* encodeBody(body);
  }
}
