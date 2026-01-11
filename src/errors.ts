// import { HttpDecodePhase } from './specs.js';

export enum HttpDecodeErrorCode {
  // =========================
  // General / Global
  // =========================
  INVALID_SYNTAX = 'INVALID_SYNTAX',
  MESSAGE_TOO_LARGE = 'MESSAGE_TOO_LARGE',
  UNSUPPORTED_FEATURE = 'UNSUPPORTED_FEATURE',

  PARSE_TIMEOUT = 'PARSE_TIMEOUT',
  PARSE_NO_PROGRESS = 'PARSE_NO_PROGRESS',

  // =========================
  // Line / CRLF
  // =========================
  LINE_TOO_LARGE = 'LINE_TOO_LARGE',
  UNEXPECTED_LF = 'UNEXPECTED_LF',
  BARE_CR = 'BARE_CR',
  BARE_LF = 'BARE_LF',
  TOO_MANY_EMPTY_LINES = 'TOO_MANY_EMPTY_LINES',

  // =========================
  // Start line
  // =========================
  START_LINE_TOO_LARGE = 'START_LINE_TOO_LARGE',
  METHOD_TOO_LARGE = 'METHOD_TOO_LARGE',
  URI_TOO_LARGE = 'URI_TOO_LARGE',
  REASON_PHARSE_TOO_LARGE = 'REASON_PHARSE_TOO_LARGE',

  INVALID_START_LINE = 'INVALID_START_LINE',
  INVALID_METHOD = 'INVALID_METHOD',
  INVALID_STATUS_CODE = 'INVALID_STATUS_CODE',
  UNSUPPORTED_HTTP_VERSION = 'UNSUPPORTED_HTTP_VERSION',

  // =========================
  // Headers
  // =========================
  INVALID_HEADER = 'INVALID_HEADER',
  HEADER_TOO_LARGE = 'HEADER_TOO_LARGE',
  HEADER_LINE_TOO_LARGE = 'HEADER_LINE_TOO_LARGE',
  HEADER_TOO_MANY = 'HEADER_TOO_MANY',
  HEADER_NAME_TOO_LARGE = 'HEADER_NAME_TOO_LARGE',
  HEADER_VALUE_TOO_LARGE = 'HEADER_VALUE_TOO_LARGE',

  DUPLICATE_CONTENT_LENGTH = 'DUPLICATE_CONTENT_LENGTH',
  CONFLICTING_CONTENT_LENGTH = 'CONFLICTING_CONTENT_LENGTH',
  CONFLICTING_TRANSFER_ENCODING = 'CONFLICTING_TRANSFER_ENCODING',
  INVALID_TRANSFER_ENCODING = 'INVALID_TRANSFER_ENCODING',

  // =========================
  // Body (Content-Length)
  // =========================
  INVALID_CONTENT_LENGTH = 'INVALID_CONTENT_LENGTH',
  CONTENT_LENGTH_TOO_LARGE = 'CONTENT_LENGTH_TOO_LARGE',
  BODY_TOO_LARGE = 'BODY_TOO_LARGE',
  BODY_LENGTH_MISMATCH = 'BODY_LENGTH_MISMATCH',

  // =========================
  // Body (Chunked)
  // =========================
  INVALID_CHUNKED_ENCODING = 'INVALID_CHUNKED_ENCODING',

  INVALID_CHUNK_SIZE = 'INVALID_CHUNK_SIZE',
  CHUNK_SIZE_TOO_LARGE = 'CHUNK_SIZE_TOO_LARGE',
  CHUNK_LINE_TOO_LARGE = 'CHUNK_LINE_TOO_LARGE',
  INVALID_CHUNK_EXTENSION = 'INVALID_CHUNK_EXTENSION',

  CHUNK_DATA_TOO_LARGE = 'CHUNK_DATA_TOO_LARGE',
  CHUNK_COUNT_EXCEEDED = 'CHUNK_COUNT_EXCEEDED',

  INVALID_CHUNK_SIZE_LINE_ENDING = 'INVALID_CHUNK_SIZE_LINE_ENDING',
  INVALID_CHUNK_DATA_LINE_ENDING = 'INVALID_CHUNK_DATA_LINE_ENDING',

  TRAILER_TOO_MANY = 'TRAILER_TOO_MANY',
  TRAILER_TOO_LARGE = 'TRAILER_TOO_LARGE',
  INVALID_TRAILER = 'INVALID_TRAILER',
  UNSUPPORTED_CHUNK_EXTENSION = 'UNSUPPORTED_CHUNK_EXTENSION',

  // =========================
  // Numeric parsing
  // =========================
  INTEGER_OVERFLOW = 'INTEGER_OVERFLOW',
  HEX_NUMBER_OVERFLOW = 'HEX_NUMBER_OVERFLOW',
  TOO_MANY_LEADING_ZEROS = 'TOO_MANY_LEADING_ZEROS',

  // =========================
  // Parser state / DFA
  // =========================
  TOO_MANY_STATE_TRANSITIONS = 'TOO_MANY_STATE_TRANSITIONS',
  REPEATING_STATE_DETECTED = 'REPEATING_STATE_DETECTED',

  // =========================
  // Buffer / Resource
  // =========================
  BUFFER_LIMIT_EXCEEDED = 'BUFFER_LIMIT_EXCEEDED',
  BUFFER_REALLOC_LIMIT_EXCEEDED = 'BUFFER_REALLOC_LIMIT_EXCEEDED',

  // =========================
  // Internal
  // =========================
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
    this.name = this.constructor.name;
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
