export type Headers = Record<string, string | string[]>;

export type NormalizedHeaders = Record<string, string[]>

export type HttpParsePhase = 'STARTLINE' | 'HEADERS' | 'BODY_CHUNKED' | 'BODY_CONTENT_LENGTH';

export type HttpMethod = 'GET' | 'PUT' | 'DELETE' | 'POST' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT';

export type TrailerHeaders = Record<string, string>;

export type HttpVersion = 1.0 | 1.1;

export interface RequestStartLine {
  method?: HttpMethod;
  path?: string;
  version?: HttpVersion;
}

export interface ResponseStartLine {
  version?: HttpVersion;
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
