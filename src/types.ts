export type Headers = Record<string, string | string[]>;

export type HttpMethod = 'GET' | 'PUT' | 'DELETE' | 'POST' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT';

export type HttpMessagePhase =
  | 'StartLine'
  | 'Headers'
  | 'HeadersFinished'
  | 'Body'
  | 'Finished';

export interface RequestStartLine {
  method: string | null;
  path: string | null;
  version: number | null;
}

export interface ResponseStartLine {
  version: number | null;
  statusCode: number | null;
  statusMessage: string | null;
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
