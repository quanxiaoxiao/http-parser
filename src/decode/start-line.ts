import {
  DecodeErrors,
  HttpDecodeError,
  HttpDecodeErrorCode,
} from '../errors.js';
import { DEFAULT_START_LINE_LIMITS } from '../specs.js';
import { STATUS_CODES } from '../status-codes.js';
import type {
  HttpMethod,
  HttpVersion,
  RequestStartLine,
  ResponseStartLine,
  StartLineLimits,
} from '../types.js';
import { parseInteger } from '../utils/number.js';

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

function validateInput(str: string, type: 'request' | 'response') {
  if (!str || typeof str !== 'string') {
    throw new TypeError(`Invalid input: ${type} line must be a non-empty string`);
  }
}

function validateHttpVersion(versionStr: string): HttpVersion {
  const version = HTTP_VERSION_MAP[versionStr?.toUpperCase()];
  if (version === undefined) {
    throw DecodeErrors.unsupportedHttpVersion(versionStr);
  }
  return version as HttpVersion;
}

export function decodeRequestStartLine(
  str: string,
  limits: StartLineLimits = DEFAULT_START_LINE_LIMITS,
): RequestStartLine {
  validateInput(str, 'request');
  const trimmedStr = str.trim();
  const matches = trimmedStr.match(REQUEST_STARTLINE_REG);

  if (!matches) {
    throw DecodeErrors.invalidStartLine(createErrorPreview(trimmedStr));
  }

  const [, method, path, versionStr] = matches;
  const version = validateHttpVersion(versionStr!);

  if (path!.length > limits.maxUriBytes) {
    throw DecodeErrors.uriTooLarge(limits.maxUriBytes);
  }

  return {
    raw: str,
    method: method!.toUpperCase() as HttpMethod,
    path: path!,
    version: version as HttpVersion,
  };
};

export function decodeResponseStartLine(str: string, limits: StartLineLimits = DEFAULT_START_LINE_LIMITS): ResponseStartLine {
  validateInput(str, 'response');

  const trimmedStr = str.trim();
  const matches = trimmedStr.match(RESPONSE_STARTLINE_REG);

  if (!matches) {
    throw DecodeErrors.invalidResponseStartLine(createErrorPreview(trimmedStr));
  }

  const [, versionStr, statusCodeStr, statusText] = matches;

  const version = validateHttpVersion(versionStr!);
  const statusCode = parseInteger(statusCodeStr as string);

  if (statusCode == null || statusCode < MIN_STATUS_CODE || statusCode > MAX_STATUS_CODE) {
    throw DecodeErrors.invalidStatusCode(statusCode ?? 0, MIN_STATUS_CODE, MAX_STATUS_CODE);
  }

  const finalStatusMessage = statusText?.trim() || STATUS_CODES[statusCode] || 'Unknown';

  if (finalStatusMessage.length > limits.maxReasonPhraseBytes) {
    throw DecodeErrors.reasonPhraseTooLarge(limits.maxReasonPhraseBytes);
  }

  return {
    raw: str,
    version: version as HttpVersion,
    statusCode,
    statusText: finalStatusMessage,
  };
}
