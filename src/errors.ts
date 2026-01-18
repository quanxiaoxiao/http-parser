// import { HttpDecodeState } from './specs.js';
export enum HttpDecodeErrorCategory {
  SYNTAX = 'SYNTAX',
  SIZE_LIMIT = 'SIZE_LIMIT',
  STATE = 'STATE',
  UNSUPPORTED = 'UNSUPPORTED',
  RESOURCE = 'RESOURCE',
  INTERNAL = 'INTERNAL',
}

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
  INVALID_LINE_ENDING = 'INVALID_LINE_ENDING',
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
  CHUNK_EXTENSION_TOO_LARGE = 'CHUNK_EXTENSION_TOO_LARGE',

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

export const ERROR_CATEGORY: Record<HttpDecodeErrorCode, HttpDecodeErrorCategory> = {
  [HttpDecodeErrorCode.INVALID_SYNTAX]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.LINE_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.TOO_MANY_STATE_TRANSITIONS]: HttpDecodeErrorCategory.STATE,
  [HttpDecodeErrorCode.UNSUPPORTED_HTTP_VERSION]: HttpDecodeErrorCategory.UNSUPPORTED,
  [HttpDecodeErrorCode.BUFFER_LIMIT_EXCEEDED]: HttpDecodeErrorCategory.RESOURCE,
  [HttpDecodeErrorCode.INTERNAL_ERROR]: HttpDecodeErrorCategory.INTERNAL,
};

export class HttpDecodeError extends Error {
  readonly code: HttpDecodeErrorCode;
  readonly fatal: boolean;

  constructor(options: {
    code: HttpDecodeErrorCode;
    message: string;
    fatal?: boolean;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.fatal = options.fatal ?? true;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}
