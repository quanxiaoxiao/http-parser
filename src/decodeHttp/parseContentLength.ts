import { DecodeHttpError } from '../errors.js';

export type ContentLengthState = {
  buffer: Buffer;
  contentLength: number;
  bytesReceived: number;
  bodyChunks: Buffer[];
  finished: boolean;
};

export function createContentLengthState(contentLength: number): ContentLengthState {
  if (!Number.isInteger(contentLength) || contentLength < 0) {
    throw new DecodeHttpError(`Invalid content length: ${contentLength}`);
  }

  return {
    buffer: Buffer.alloc(0),
    contentLength,
    bytesReceived: 0,
    bodyChunks: [],
    finished: contentLength === 0,
  };
}

export function parseContentLength(
  prev: ContentLengthState,
  input: Buffer,
  onChunk?: (chunk: Buffer) => void,
): ContentLengthState {
  if (prev.finished) {
    throw new DecodeHttpError('Content-Length parsing already finished');
  }

  const totalBytes = prev.bytesReceived + input.length;

  if (totalBytes > prev.contentLength) {
    throw new DecodeHttpError(`Received more data than Content-Length: ${totalBytes} > ${prev.contentLength}`);
  }

  const finished = totalBytes === prev.contentLength;

  if (onChunk) {
    if (input.length > 0) {
      onChunk(input);
    }
    return {
      buffer: Buffer.alloc(0),
      contentLength: prev.contentLength,
      bytesReceived: totalBytes,
      bodyChunks: [],
      finished,
    };
  }

  return {
    buffer: prev.bodyChunks.length === 0 && input.length > 0 ? input : Buffer.concat([prev.buffer, input]),
    contentLength: prev.contentLength,
    bytesReceived: totalBytes,
    bodyChunks: input.length > 0 ? [...prev.bodyChunks, input] : prev.bodyChunks,
    finished,
  };
}

export function getProgress(state: ContentLengthState): number {
  if (state.contentLength === 0) {
    return 1;
  }
  return state.bytesReceived / state.contentLength;
}

export function getRemainingBytes(state: ContentLengthState): number {
  return state.contentLength - state.bytesReceived;
}
