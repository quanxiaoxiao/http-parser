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

  onRequestStartLine?(method: string, path: string, version: number): void;
  onResponseStartLine?(version: string, status: number, reason: string): void;

  onHeadersBegin?(): void;
  onHeader?(field: string, value: string, headers: Headers): void;
  onHeadersComplete?(headers: Headers): void;

  onBodyBegin?(): void;
  onBody?(chunk: Uint8Array): void;
  onBodyComplete?(): void;

  onMessageComplete?(): void;

  // errors
  onError?(err: Error): void;
}
