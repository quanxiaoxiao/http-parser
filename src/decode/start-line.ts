import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import parseInteger from '../parseInteger.js';
import { DEFAULT_START_LINE_LIMITS } from '../specs.js';
import { STATUS_CODES } from '../status-codes.js';
import type { HttpMethod, HttpVersion, RequestStartLine, ResponseStartLine,StartLineLimits } from '../types.js';

const REQUEST_STARTLINE_REG = /^(\w+)\s+(\S+)\s+(HTTP\/1\.[01])$/i;
const RESPONSE_STARTLINE_REG = /^(HTTP\/1\.[01])\s+(\d{3})(?:\s+(.*))?$/i;

const HTTP_VERSION_1_0 = 1.0;
const HTTP_VERSION_1_1 = 1.1;

const MAX_STATUS_CODE = 599;
const MIN_STATUS_CODE = 100;
const ERROR_PREVIEW_LENGTH = 50;

const HTTP_VERSION_MAP: Record<string, number> = {
  'HTTP/1.0': HTTP_VERSION_1_0,
  'HTTP/1.1': HTTP_VERSION_1_1,
} as const;

function createErrorPreview(str: string, maxLength: number = ERROR_PREVIEW_LENGTH): string {
  return str.length > maxLength
    ? `${str.substring(0, maxLength)}...`
    : str;
}

function validateInput(str: string, type: 'request' | 'response'): string {
  if (!str || typeof str !== 'string') {
    throw new TypeError(`Invalid input: ${type} line must be a non-empty string`);
  }
}

function validateHttpVersion(versionStr: string): HttpVersion {
  const version = HTTP_VERSION_MAP[versionStr?.toUpperCase()];
  if (version === undefined) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.UNSUPPORTED_HTTP_VERSION,
      message: `Unsupported HTTP version: ${versionStr}`,
    });
  }
  return version as HttpVersion;
}

export function decodeRequestStartLine(
  str: string,
  limit: StartLineLimits = DEFAULT_START_LINE_LIMITS,
): RequestStartLine {
  validateInput(str, 'request');
  const trimmedStr = str.trim();
  const matches = trimmedStr.match(REQUEST_STARTLINE_REG);

  if (!matches) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_START_LINE,
      message: `Failed to parse HTTP request line: "${createErrorPreview(trimmedStr)}"`,
    });
  }

  const [, method, path, versionStr] = matches;
  const version = validateHttpVersion(versionStr!);

  if (path.length > limit.maxUriBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.URI_TOO_LARGE,
      message: `Start line URI too large: exceeds limit of ${limit.maxUriBytes} bytes`,
    });
  }

  return {
    raw: str,
    method: method!.toUpperCase() as HttpMethod,
    path: path!,
    version: version as HttpVersion,
  };
};

export function decodeResponseStartLine(str: string, limit: StartLineLimits = DEFAULT_START_LINE_LIMITS): ResponseStartLine {
  validateInput(str, 'response');

  const trimmedStr = str.trim();
  const matches = trimmedStr.match(RESPONSE_STARTLINE_REG);

  if (!matches) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_START_LINE,
      message: `Failed to parse HTTP response line: "${createErrorPreview(trimmedStr)}"`,
    });
  }

  const [, versionStr, statusCodeStr, statusText] = matches;

  const version = validateHttpVersion(versionStr!);
  const statusCode = parseInteger(statusCodeStr as string);

  if (statusCode == null || statusCode < MIN_STATUS_CODE || statusCode > MAX_STATUS_CODE) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_STATUS_CODE,
      message: `Invalid HTTP status code: ${statusCode} (must be ${MIN_STATUS_CODE}-${MAX_STATUS_CODE})`,
    });
  }

  const finalStatusMessage = statusText?.trim() || STATUS_CODES[statusCode] || 'Unknown';

  if (finalStatusMessage.length > limit.maxReasonPhraseBytes) {
    throw new HttpDecodeError({
      code: HttpDecodeErrorCode.INVALID_REASON_PHRASE,
      message: 'HTTP response status message too large',
    });
  }

  return {
    raw: str,
    version: version as HttpVersion,
    statusCode,
    statusText: finalStatusMessage,
  };
}
