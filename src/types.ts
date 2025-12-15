export type Headers = Record<string, string | string[]>;

export type HttpMethod = 'GET' | 'PUT' | 'DELETE' | 'POST' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT';

export type HttpMessagePhase =
  | 'StartLine'
  | 'Headers'
  | 'HeadersFinished'
  | 'Body'
  | 'Finished';

export interface HttpParserHooks {
  onMessageBegin?(): void;

  onStartLine?(line: string): void;
  onRequestStartLine?(method: string, path: string, version: string): void;
  onResponseStartLine?(version: string, status: number, reason: string): void;

  onHeadersBegin?(): void;
  onHeaderField?(field: string): void;
  onHeaderValue?(value: string): void;
  onHeader?(field: string, value: string): void;
  onHeadersComplete?(headers: Record<string, string | string[]>): void;

  onBodyBegin?(): void;
  onBody?(chunk: Uint8Array): void;
  onBodyEnd?(): void;

  // chunked only
  onChunkBegin?(size: number): void;
  onChunkSize?(size: number): void;
  onChunkData?(chunk: Uint8Array): void;
  onChunkEnd?(): void;
  onChunksComplete?(): void;

  // trailer
  onTrailerHeader?(field: string, value: string): void;
  onTrailersComplete?(): void;

  onMessageComplete?(): void;

  // errors
  onError?(err: Error): void;
}
