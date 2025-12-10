
export type Headers = Record<string, string | string[]>;

export type HttpMethod = 'GET' | 'PUT' | 'DELETE' | 'POST' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT';

export type HttpMessagePhase =
  | 'StartLine'
  | 'Headers'
  | 'HeadersFinished'
  | 'Body'
  | 'Finished';
