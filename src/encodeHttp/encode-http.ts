import { encodeHttpLine } from '../encodeHttpLine.js';
import { type Body, type Headers,type NormalizedHeaders,type RequestStartLine } from '../types.js';
import { applyFramingHeaders, normalizeHeaders, stripHopByHopHeaders } from '../utils/headers.js';
import { encodeChunkedStream } from './encode-body-chunked.js';
import { encodeHeaders } from './encode-headers.js';
import { encodeRequestLine } from './encode-request-line.js';

function isAsyncIterable(value: unknown): value is AsyncIterable<Buffer> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value
  );
}

async function* encodeBody(body: Body): AsyncGenerator<Buffer> {
  if (isAsyncIterable(body)) {
    yield* encodeChunkedStream(body);
    return;
  }
  if (typeof body === 'string') {
    yield Buffer.from(body, 'utf-8');
    return;
  }
  if (Buffer.isBuffer(body)) {
    yield body;
    return;
  }
  throw new TypeError(`Unsupported body type: ${typeof body}`);
}

export async function* encodeHttpRequest({
  startLine,
  headers,
  body,
}: { startLine: RequestStartLine, headers: Headers, body?: Body}) {
  yield encodeHttpLine(encodeHttpLine(encodeRequestLine(startLine)));
  const headersNormalized = normalizeHeaders(headers);
  stripHopByHopHeaders(headersNormalized);
  applyFramingHeaders(headersNormalized, body);
  yield encodeHttpLine(encodeHeaders(headersNormalized));

  if (body != null) {
    yield* encodeBody(body);
  }
}
