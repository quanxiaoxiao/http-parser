// import { HttpDecodeState } from './specs.js';

/**
 * HTTP 解码错误类别
 */
export enum HttpDecodeErrorCategory {
  SYNTAX = 'SYNTAX',
  SIZE_LIMIT = 'SIZE_LIMIT',
  STATE = 'STATE',
  UNSUPPORTED = 'UNSUPPORTED',
  RESOURCE = 'RESOURCE',
  INTERNAL = 'INTERNAL',
}

/**
 * HTTP 解码错误代码
 */
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

/**
 * 错误代码到错误类别的映射
 */
export const ERROR_CATEGORY: Record<HttpDecodeErrorCode, HttpDecodeErrorCategory> = {
  // General / Global
  [HttpDecodeErrorCode.INVALID_SYNTAX]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.MESSAGE_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.UNSUPPORTED_FEATURE]: HttpDecodeErrorCategory.UNSUPPORTED,
  [HttpDecodeErrorCode.PARSE_TIMEOUT]: HttpDecodeErrorCategory.RESOURCE,
  [HttpDecodeErrorCode.PARSE_NO_PROGRESS]: HttpDecodeErrorCategory.STATE,

  // Line / CRLF
  [HttpDecodeErrorCode.LINE_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.INVALID_LINE_ENDING]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.UNEXPECTED_LF]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.BARE_CR]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.BARE_LF]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.TOO_MANY_EMPTY_LINES]: HttpDecodeErrorCategory.SIZE_LIMIT,

  // Start line
  [HttpDecodeErrorCode.START_LINE_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.METHOD_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.URI_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.REASON_PHARSE_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.INVALID_START_LINE]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.INVALID_METHOD]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.INVALID_STATUS_CODE]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.UNSUPPORTED_HTTP_VERSION]: HttpDecodeErrorCategory.UNSUPPORTED,

  // Headers
  [HttpDecodeErrorCode.INVALID_HEADER]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.HEADER_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.HEADER_LINE_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.HEADER_TOO_MANY]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.HEADER_NAME_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.HEADER_VALUE_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.DUPLICATE_CONTENT_LENGTH]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.CONFLICTING_CONTENT_LENGTH]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.CONFLICTING_TRANSFER_ENCODING]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.INVALID_TRANSFER_ENCODING]: HttpDecodeErrorCategory.SYNTAX,

  // Body (Content-Length)
  [HttpDecodeErrorCode.INVALID_CONTENT_LENGTH]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.CONTENT_LENGTH_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.BODY_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.BODY_LENGTH_MISMATCH]: HttpDecodeErrorCategory.SYNTAX,

  // Body (Chunked)
  [HttpDecodeErrorCode.INVALID_CHUNKED_ENCODING]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.INVALID_CHUNK_SIZE]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.CHUNK_LINE_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.INVALID_CHUNK_EXTENSION]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.CHUNK_DATA_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.CHUNK_COUNT_EXCEEDED]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.INVALID_CHUNK_SIZE_LINE_ENDING]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.INVALID_CHUNK_DATA_LINE_ENDING]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.TRAILER_TOO_MANY]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.TRAILER_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.INVALID_TRAILER]: HttpDecodeErrorCategory.SYNTAX,
  [HttpDecodeErrorCode.UNSUPPORTED_CHUNK_EXTENSION]: HttpDecodeErrorCategory.UNSUPPORTED,
  [HttpDecodeErrorCode.CHUNK_EXTENSION_TOO_LARGE]: HttpDecodeErrorCategory.SIZE_LIMIT,

  // Numeric parsing
  [HttpDecodeErrorCode.INTEGER_OVERFLOW]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.HEX_NUMBER_OVERFLOW]: HttpDecodeErrorCategory.SIZE_LIMIT,
  [HttpDecodeErrorCode.TOO_MANY_LEADING_ZEROS]: HttpDecodeErrorCategory.SYNTAX,

  // Parser state / DFA
  [HttpDecodeErrorCode.TOO_MANY_STATE_TRANSITIONS]: HttpDecodeErrorCategory.STATE,
  [HttpDecodeErrorCode.REPEATING_STATE_DETECTED]: HttpDecodeErrorCategory.STATE,

  // Buffer / Resource
  [HttpDecodeErrorCode.BUFFER_LIMIT_EXCEEDED]: HttpDecodeErrorCategory.RESOURCE,
  [HttpDecodeErrorCode.BUFFER_REALLOC_LIMIT_EXCEEDED]: HttpDecodeErrorCategory.RESOURCE,

  // Internal
  [HttpDecodeErrorCode.INTERNAL_ERROR]: HttpDecodeErrorCategory.INTERNAL,
} as const;

/**
 * 每个类别的默认致命性设置
 */
const DEFAULT_FATAL_BY_CATEGORY: Record<HttpDecodeErrorCategory, boolean> = {
  [HttpDecodeErrorCategory.SYNTAX]: true,
  [HttpDecodeErrorCategory.SIZE_LIMIT]: true,
  [HttpDecodeErrorCategory.STATE]: true,
  [HttpDecodeErrorCategory.UNSUPPORTED]: true,
  [HttpDecodeErrorCategory.RESOURCE]: true,
  [HttpDecodeErrorCategory.INTERNAL]: true,
} as const;

/**
 * HTTP 解码错误类
 */
export class HttpDecodeError extends Error {
  readonly code: HttpDecodeErrorCode;
  readonly fatal: boolean;
  readonly category: HttpDecodeErrorCategory;

  constructor(options: {
    code: HttpDecodeErrorCode;
    message: string;
    fatal?: boolean;
    cause?: unknown;
  }) {
    super(options.message ?? options.code);
    this.name = this.constructor.name;
    this.code = options.code;
    this.category = ERROR_CATEGORY[options.code];
    this.fatal = options.fatal ?? DEFAULT_FATAL_BY_CATEGORY[this.category];
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export enum HttpErrorDisposition {
  CLOSE_CONNECTION = 'CLOSE_CONNECTION',
  REJECT_MESSAGE = 'REJECT_MESSAGE',
  IGNORE = 'IGNORE',
}

export const ERROR_DISPOSITION: Record<HttpDecodeErrorCode, HttpErrorDisposition> = {
  [HttpDecodeErrorCode.INVALID_SYNTAX]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.MESSAGE_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.UNSUPPORTED_FEATURE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.PARSE_TIMEOUT]: HttpErrorDisposition.CLOSE_CONNECTION,
  [HttpDecodeErrorCode.PARSE_NO_PROGRESS]: HttpErrorDisposition.CLOSE_CONNECTION,

  [HttpDecodeErrorCode.LINE_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.INVALID_LINE_ENDING]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.UNEXPECTED_LF]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.BARE_CR]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.BARE_LF]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.TOO_MANY_EMPTY_LINES]: HttpErrorDisposition.REJECT_MESSAGE,

  [HttpDecodeErrorCode.START_LINE_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.METHOD_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.URI_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.REASON_PHARSE_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.INVALID_START_LINE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.INVALID_METHOD]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.INVALID_STATUS_CODE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.UNSUPPORTED_HTTP_VERSION]: HttpErrorDisposition.REJECT_MESSAGE,

  [HttpDecodeErrorCode.INVALID_HEADER]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.HEADER_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.HEADER_LINE_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.HEADER_TOO_MANY]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.HEADER_NAME_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.HEADER_VALUE_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.DUPLICATE_CONTENT_LENGTH]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.CONFLICTING_CONTENT_LENGTH]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.CONFLICTING_TRANSFER_ENCODING]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.INVALID_TRANSFER_ENCODING]: HttpErrorDisposition.REJECT_MESSAGE,

  // Body (Content-Length) - 消息体长度不匹配需关闭连接
  [HttpDecodeErrorCode.INVALID_CONTENT_LENGTH]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.CONTENT_LENGTH_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.BODY_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.BODY_LENGTH_MISMATCH]: HttpErrorDisposition.CLOSE_CONNECTION,

  // Body (Chunked) - 分块编码错误
  [HttpDecodeErrorCode.INVALID_CHUNKED_ENCODING]: HttpErrorDisposition.CLOSE_CONNECTION,
  [HttpDecodeErrorCode.INVALID_CHUNK_SIZE]: HttpErrorDisposition.CLOSE_CONNECTION,
  [HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.CHUNK_LINE_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.INVALID_CHUNK_EXTENSION]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.CHUNK_DATA_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.CHUNK_COUNT_EXCEEDED]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.INVALID_CHUNK_SIZE_LINE_ENDING]: HttpErrorDisposition.CLOSE_CONNECTION,
  [HttpDecodeErrorCode.INVALID_CHUNK_DATA_LINE_ENDING]: HttpErrorDisposition.CLOSE_CONNECTION,
  [HttpDecodeErrorCode.TRAILER_TOO_MANY]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.TRAILER_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.INVALID_TRAILER]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.UNSUPPORTED_CHUNK_EXTENSION]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.CHUNK_EXTENSION_TOO_LARGE]: HttpErrorDisposition.REJECT_MESSAGE,

  // Numeric parsing - 数字解析错误
  [HttpDecodeErrorCode.INTEGER_OVERFLOW]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.HEX_NUMBER_OVERFLOW]: HttpErrorDisposition.REJECT_MESSAGE,
  [HttpDecodeErrorCode.TOO_MANY_LEADING_ZEROS]: HttpErrorDisposition.REJECT_MESSAGE,

  // Parser state / DFA - 状态机错误,关闭连接
  [HttpDecodeErrorCode.TOO_MANY_STATE_TRANSITIONS]: HttpErrorDisposition.CLOSE_CONNECTION,
  [HttpDecodeErrorCode.REPEATING_STATE_DETECTED]: HttpErrorDisposition.CLOSE_CONNECTION,

  // Buffer / Resource - 资源限制,关闭连接
  [HttpDecodeErrorCode.BUFFER_LIMIT_EXCEEDED]: HttpErrorDisposition.CLOSE_CONNECTION,
  [HttpDecodeErrorCode.BUFFER_REALLOC_LIMIT_EXCEEDED]: HttpErrorDisposition.CLOSE_CONNECTION,

  // Internal - 内部错误,关闭连接
  [HttpDecodeErrorCode.INTERNAL_ERROR]: HttpErrorDisposition.CLOSE_CONNECTION,
} as const;

/**
 * 便捷的错误创建工具
 */
export const DecodeErrors = {
  invalidLineEnding(cause?: unknown): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_LINE_ENDING,
      message: 'Invalid CRLF sequence',
      cause,
    });
  },

  lfWithoutCr(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_LINE_ENDING,
      message: 'LF without preceding CR',
    });
  },

  crNotFollowedByLf(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_LINE_ENDING,
      message: 'CR not followed by LF',
    });
  },

  lineTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.LINE_TOO_LARGE,
      message: `Line exceeds limit (${limit} bytes)`,
    });
  },

  httpLineTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.LINE_TOO_LARGE,
      message: `HTTP line exceeds maximum length (${limit})`,
    });
  },

  unsupportedHttpVersion(version: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.UNSUPPORTED_HTTP_VERSION,
      message: `Unsupported HTTP version: ${version}`,
    });
  },

  invalidSyntax(details?: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_SYNTAX,
      message: details ? `Invalid syntax: ${details}` : 'Invalid syntax',
    });
  },

  multipleTransferEncoding(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_SYNTAX,
      message: 'multiple Transfer-Encoding headers',
    });
  },

  unsupportedTransferEncoding(encoding: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.UNSUPPORTED_FEATURE,
      message: `unsupported Transfer-Encoding: ${encoding}`,
    });
  },

  contentLengthWithTransferEncoding(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_SYNTAX,
      message: 'Content-Length with Transfer-Encoding',
    });
  },

  invalidContentLengthHeader(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_SYNTAX,
      message: 'Content-Length invalid',
    });
  },

  contentLengthOverflow(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.MESSAGE_TOO_LARGE,
      message: 'Content-Length overflow',
    });
  },

  multipleContentLengthHeaders(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_SYNTAX,
      message: 'multiple Content-Length headers',
    });
  },

  bodyLengthMismatch(expected: number, actual: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.BODY_LENGTH_MISMATCH,
      message: `Body length mismatch: expected ${expected}, got ${actual}`,
    });
  },

  headerTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_TOO_LARGE,
      message: `Header exceeds limit (${limit} bytes)`,
    });
  },

  headersTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_TOO_LARGE,
      message: `Headers too large: exceeds limit of ${limit} bytes`,
    });
  },

  headersTooMany(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_TOO_MANY,
      message: `Headers too many: exceeds limit of ${limit} count`,
    });
  },

  headerLineTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_LINE_TOO_LARGE,
      message: `Header line too large: exceeds limit of ${limit} bytes`,
    });
  },

  headerMissingColon(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: 'Header missing ":" separator',
    });
  },

  headerNameEmpty(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: 'Header name is empty',
    });
  },

  headerNameTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_NAME_TOO_LARGE,
      message: `Header name too large: exceeds limit of ${limit} bytes`,
    });
  },

  invalidHeaderName(name: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message: `Invalid characters in header name: ${name}`,
    });
  },

  headerValueTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.HEADER_VALUE_TOO_LARGE,
      message: `Header value too large: exceeds limit of ${limit} bytes`,
    });
  },

  invalidHeader(message: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_HEADER,
      message,
    });
  },

  startLineTooLarge(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.START_LINE_TOO_LARGE,
      message: 'HTTP start-line too large',
    });
  },

  invalidStartLine(details: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_START_LINE,
      message: `Request start line parse fail: "${details}"`,
    });
  },

  invalidResponseStartLine(details: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_START_LINE,
      message: `Response start line parse fail: "${details}"`,
    });
  },

  uriTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.URI_TOO_LARGE,
      message: `Request start line URI too large: exceeds limit of ${limit} bytes`,
    });
  },

  invalidStatusCode(code: number, min: number, max: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_STATUS_CODE,
      message: `Response start line invalid status code: ${code} (must be ${min}-${max})`,
    });
  },

  reasonPhraseTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.REASON_PHARSE_TOO_LARGE,
      message: `Response start line rease phase too large: exceeds limit of ${limit} bytes`,
    });
  },

  invalidContentLength(value: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_CONTENT_LENGTH,
      message: `Invalid Content-Length: ${value}`,
    });
  },

  contentLengthTooLarge(value: number, limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.CONTENT_LENGTH_TOO_LARGE,
      message: `Content-Length ${value} exceeds limit ${limit}`,
    });
  },

  unsupportedChunkExtension(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.UNSUPPORTED_CHUNK_EXTENSION,
      message: 'Unsupported chunk extension',
    });
  },

  chunkExtensionTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.CHUNK_EXTENSION_TOO_LARGE,
      message: `Chunk extension exceeds maximum allowed of ${limit}`,
    });
  },

  emptyChunkSize(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_CHUNK_SIZE,
      message: 'Empty chunk size line',
    });
  },

  invalidChunkSize(sizePart: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_CHUNK_SIZE,
      message: `Invalid chunk size: "${sizePart}"`,
    });
  },

  chunkSizeTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE,
      message: `Chunk size exceeds maximum allowed of ${limit}`,
    });
  },

  chunkSizeHexDigitsTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE,
      message: `Chunk size hex digits exceed limit of ${limit}`,
    });
  },

  trailerTooMany(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.TRAILER_TOO_MANY,
      message: `Trailers too many: exceeds limit of ${limit} count`,
    });
  },

  invalidTrailer(message: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_TRAILER,
      message,
    });
  },

  trailerTooLarge(limit: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.TRAILER_TOO_LARGE,
      message: `Trailer size exceeds maximum allowed of ${limit}`,
    });
  },

  invalidChunkSizeLineEnding(byte0: number, byte1: number): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_CHUNK_SIZE_LINE_ENDING,
      message: `Missing CRLF after chunk data (got: 0x${byte0?.toString(16)} 0x${byte1?.toString(16)})`,
    });
  },

  bodyCloseDelimitedNotImplemented(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.UNSUPPORTED_FEATURE,
      message: 'Body close-delimited not implemented',
    });
  },

  upgradeProtocolNotImplemented(): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.UNSUPPORTED_FEATURE,
      message: 'Upgrade protocol not implemented',
    });
  },

  internalError(message: string, cause?: unknown): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INTERNAL_ERROR,
      message: `Internal error: ${message}`,
      cause,
    });
  },

  httpParseFailedAtState(state: string, reason: string): HttpDecodeError {
    return new HttpDecodeError({
      code: HttpDecodeErrorCode.INTERNAL_ERROR,
      message: `HTTP parse failed at state "${state}". Reason: ${reason}`,
    });
  },
} as const;
