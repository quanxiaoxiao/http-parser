export interface CustomErrorOptions {
  code: string;
  message?: string;
  cause?: Error;
}

function createCustomError(code: string, defaultMessage: string) {
  return class extends Error {
    public readonly code: string;

    constructor(message?: string) {
      super(message ?? defaultMessage);
      this.name = this.constructor.name;
      this.code = code;
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
    }
  };
}

export class HttpUrlParseError extends createCustomError(
  'ERR_HTTP_URL_PARSE',
  'Http Url Parse Error',
) {};

export class EncodeHttpError extends createCustomError(
  'ERR_ENCODE_HTTP',
  'Encode Http Error',
) {};

export class DecodeHttpError extends createCustomError(
  'ERR_DECODE_HTTP',
  'Decode Http Error',
) {};
