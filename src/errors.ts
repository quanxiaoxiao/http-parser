export enum HttpDecodeErrorCode {
  // general
  INVALID_SYNTAX = 'INVALID_SYNTAX',
  MESSAGE_TOO_LARGE = 'MESSAGE_TOO_LARGE',
  UNSUPPORTED_FEATURE = 'UNSUPPORTED_FEATURE',

  // Start line
  INVALID_START_LINE = 'INVALID_START_LINE',
  URI_TOO_LONG = 'URI_TOO_LONG',
  UNSUPPORTED_HTTP_VERSION = 'UNSUPPORTED_HTTP_VERSION',

  // Headers
  INVALID_HEADER = 'INVALID_HEADER',
  HEADER_TOO_LARGE = 'HEADER_TOO_LARGE',

  // Body
  INVALID_CONTENT_LENGTH = 'INVALID_CONTENT_LENGTH',
  INVALID_CHUNKED_ENCODING = 'INVALID_CHUNKED_ENCODING',

  // Internal
  INTERNAL_ERROR = 'INTERNAL_ERROR',
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
