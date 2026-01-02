// import { HttpDecodePhase } from './specs.js';

export enum HttpDecodeErrorCode {
  // general
  INVALID_SYNTAX = 'INVALID_SYNTAX',
  MESSAGE_TOO_LARGE = 'MESSAGE_TOO_LARGE',
  UNSUPPORTED_FEATURE = 'UNSUPPORTED_FEATURE',

  // line error
  INVALID_LINE_ENDING = 'INVALID_LINE_ENDING',
  UNEXPECTED_LF = 'UNEXPECTED_LF',
  BARE_CR = 'BARE_CR',
  BARE_LF = 'BARE_LF',

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
  INVALID_CHUNKED_SIZE_LINE_ENDING = 'INVALID_CHUNK_SIZE_LINE_ENDING',

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

export class HttpDecodeError extends Error {
  readonly code: HttpDecodeErrorCode;
  // readonly phase: HttpDecodePhase;
  readonly fatal: boolean;

  constructor(options: {
    code: HttpDecodeErrorCode;
    // phase: HttpDecodePhase;
    message: string;
    fatal?: boolean;
    cause?: unknown;
  }) {
    super(options.message);
    this.code = options.code;
    // this.phase = options.phase;
    this.fatal = options.fatal ?? true;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export function mapDecodeErrorToStatus(
  error: HttpDecodeError,
): number {
  switch (error.code) {
  case HttpDecodeErrorCode.HEADER_TOO_LARGE:
  case HttpDecodeErrorCode.MESSAGE_TOO_LARGE:
    return 431; // or 413

  case HttpDecodeErrorCode.INVALID_START_LINE:
  case HttpDecodeErrorCode.INVALID_HEADER:
  case HttpDecodeErrorCode.INVALID_CONTENT_LENGTH:
  case HttpDecodeErrorCode.INVALID_CHUNKED_ENCODING:
    return 400;

  case HttpDecodeErrorCode.UNSUPPORTED_HTTP_VERSION:
    return 505;

  case HttpDecodeErrorCode.UNSUPPORTED_FEATURE:
    return 501;

  default:
    return 400;
  }
}
