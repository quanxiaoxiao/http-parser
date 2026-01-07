import { Buffer } from 'node:buffer';

export type Headers = Record<string, string | string[]>;

export type NormalizedHeaders = Record<string, string[]>

export type HttpMethod = 'GET' | 'PUT' | 'DELETE' | 'POST' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE';

export type TrailerHeaders = Record<string, string>;

export type HttpVersion = 1.0 | 1.1;

export type Body = undefined | null | string | Buffer | AsyncIterable<Buffer>;

export type BodyType = 'chunked' | 'fixed';

export type BodyState = 'NONE' | 'FIXED' | 'STREAM';

export interface BufferQueue {
  chunks: Buffer[];
  length: number;
}

export interface HttpMessage {
  method?: string;
  statusCode?: number;
  headers: Headers | NormalizedHeaders;
  body: unknown;
}

export interface RequestStartLine {
  method?: HttpMethod;
  path?: string;
  raw?: string;
  version?: HttpVersion;
}

export interface ResponseStartLine {
  version?: HttpVersion;
  raw?: string;
  statusCode?: number;
  statusText?: string;
}

export interface HttpParserHooks {
  onMessageBegin?(): void;

  onRequestStartLine?(startLine: RequestStartLine): void;
  onResponseStartLine?(startLine: ResponseStartLine): void;

  onHeadersBegin?(): void;
  onHeader?(field: string, value: string, headers: Headers): void;
  onHeadersComplete?(headers: Headers): void;

  onBodyBegin?(): void;
  onBody?(chunk: Uint8Array): void;
  onBodyComplete?(): void;

  onMessageComplete?(): void;

  onError?(err: Error): void;
}

export interface HeaderLimits {
  maxHeaderCount: number;
  maxHeaderBytes: number;
  maxHeaderLineBytes: number;
  maxHeaderNameBytes: number;
  maxHeaderValueBytes: number;
}

export interface StartLineLimits {
  maxStartLineBytes: number;
  maxMethodBytes: number;
  maxUriBytes: number;
  maxReasonPhraseBytes: number;
}

export interface ChunkedBodyLimits {
  maxChunkCount: number;

  maxChunkSize: number;
  maxChunkDataBytes: number;

  maxChunkLineBytes: number;
  maxChunkExtensionsBytes: number;

  maxTotalBodyBytes: number;

  maxTrailerHeaderCount: number;
  maxTrailerHeaderBytes: number;
}
