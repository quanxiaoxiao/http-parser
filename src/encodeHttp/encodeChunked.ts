import { Buffer } from 'node:buffer';

import { type TrailerHeaders } from '../types.js';

const CRLF = Buffer.from('\r\n');
const FINAL_CHUNK = Buffer.from('0\r\n');
const EMPTY_BUFFER = Buffer.alloc(0);
const DEFAULT_CHUNK_SIZE = 8192;

type ChunkedEncodeOptions = {
  trailers?: TrailerHeaders;
};

type ChunkedBufferOptions = ChunkedEncodeOptions & {
  chunkSize?: number;
};

function encodeChunkSize(size: number): Buffer {
  const hex = size.toString(16);
  return Buffer.from(hex, 'ascii');
}

function encodeChunk(data: Buffer): Buffer {
  if (data.length === 0) {
    return EMPTY_BUFFER;
  }

  const chunkSize = encodeChunkSize(data.length);
  const totalLength = chunkSize.length + CRLF.length + data.length + CRLF.length;
  const result = Buffer.allocUnsafe(totalLength);

  let offset = 0;
  offset += chunkSize.copy(result, offset);
  offset += CRLF.copy(result, offset);
  offset += data.copy(result, offset);
  CRLF.copy(result, offset);

  return result;
}

function encodeTrailerHeaders(trailers?: TrailerHeaders): Buffer {
  if (!trailers || Object.keys(trailers).length === 0) {
    return CRLF;
  }
  const lines = Object.entries(trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\r\n');

  return Buffer.from(`${lines}\r\n\r\n`, 'ascii');
}

function encodeFinalChunk(trailers?: TrailerHeaders): Buffer {
  const trailerBuf = encodeTrailerHeaders(trailers);
  const totalLength = FINAL_CHUNK.length + trailerBuf.length;
  const result = Buffer.allocUnsafe(totalLength);
  FINAL_CHUNK.copy(result, 0);
  trailerBuf.copy(result, FINAL_CHUNK.length);
  return result;
}

function* splitBuffer(
  buffer: Buffer,
  chunkSize: number,
): Generator<Buffer, void, unknown> {
  let offset = 0;

  while (offset < buffer.length) {
    const end = Math.min(offset + chunkSize, buffer.length);
    yield buffer.subarray(offset, end);
    offset = end;
  }
}

export function encodeChunkedBuffer(
  body: Buffer,
  options?: ChunkedBufferOptions,
): Buffer {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const trailers = options?.trailers;

  if (body.length === 0) {
    return encodeFinalChunk(trailers);
  }

  const parts: Buffer[] = [];

  for (const chunk of splitBuffer(body, chunkSize)) {
    const encoded = encodeChunk(chunk);
    if (encoded.length > 0) {
      parts.push(encoded);
    }
  }

  parts.push(encodeFinalChunk(trailers));

  return Buffer.concat(parts);
}

export async function* encodeChunkedStream(
  source: AsyncIterable<Buffer>,
  options?: ChunkedBufferOptions,
): AsyncIterable<Buffer> {
  const trailers = options?.trailers;
  const chunkSize = options?.chunkSize ?? 8192;

  for await (const chunk of source) {
    if (chunk.length === 0) {
      continue;
    }

    for (const subChunk of splitBuffer(chunk, chunkSize)) {
      yield encodeChunk(subChunk);
    }

  }

  yield encodeFinalChunk(trailers);
}

export function encodeChunked(
  body: Buffer,
  options?: ChunkedBufferOptions,
): Buffer;

export function encodeChunked(
  body: AsyncIterable<Buffer>,
  options?: ChunkedEncodeOptions,
): AsyncIterable<Buffer>;

export function encodeChunked(
  body: Buffer | AsyncIterable<Buffer>,
  options?: ChunkedBufferOptions,
): Buffer | AsyncIterable<Buffer> {
  if (Buffer.isBuffer(body)) {
    return encodeChunkedBuffer(body, options);
  }
  return encodeChunkedStream(body, options);
}
