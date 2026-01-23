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

function createErrorPreview(string_: string, maxLength: number = ERROR_PREVIEW_LENGTH): string {
  return string_.length > maxLength
    ? `${string_.substring(0, maxLength)}...`
    : string_;
}

function validateInput(string_: string, type: 'request' | 'response') {
  if (!string_ || typeof string_ !== 'string') {
    throw new TypeError(`Invalid input: ${type} line must be a non-empty string`);
  }
}

function validateHttpVersion(versionString: string): HttpVersion {
  const version = HTTP_VERSION_MAP[versionString?.toUpperCase()];
  if (version === undefined) {
    throw DecodeErrors.unsupportedHttpVersion(versionString);
  }
  return version as HttpVersion;
}

export function decodeRequestStartLine(
  string_: string,
  limits: StartLineLimits = DEFAULT_START_LINE_LIMITS,
): RequestStartLine {
  validateInput(string_, 'request');
  const trimmedString = string_.trim();
  const matches = trimmedString.match(REQUEST_STARTLINE_REG);

  if (!matches) {
    throw DecodeErrors.invalidStartLine(createErrorPreview(trimmedString));
  }

  const [, method, path, versionString] = matches;
  const version = validateHttpVersion(versionString!);

  if (path!.length > limits.maxUriBytes) {
    throw DecodeErrors.uriTooLarge(limits.maxUriBytes);
  }

  return {
    raw: string_,
    method: method!.toUpperCase() as HttpMethod,
    path: path!,
    version,
  };
};

export function decodeResponseStartLine(string_: string, limits: StartLineLimits = DEFAULT_START_LINE_LIMITS): ResponseStartLine {
  validateInput(string_, 'response');

  const trimmedString = string_.trim();
  const matches = trimmedString.match(RESPONSE_STARTLINE_REG);

  if (!matches) {
    throw DecodeErrors.invalidResponseStartLine(createErrorPreview(trimmedString));
  }

  const [, versionString, statusCodeString, statusText] = matches;

  const version = validateHttpVersion(versionString!);
  const statusCode = parseInteger(statusCodeString as string);

  if (statusCode == null || statusCode < MIN_STATUS_CODE || statusCode > MAX_STATUS_CODE) {
    throw DecodeErrors.invalidStatusCode(statusCode ?? 0, MIN_STATUS_CODE, MAX_STATUS_CODE);
  }

  const finalStatusMessage = statusText?.trim() || STATUS_CODES[statusCode] || 'Unknown';

  if (finalStatusMessage.length > limits.maxReasonPhraseBytes) {
    throw DecodeErrors.reasonPhraseTooLarge(limits.maxReasonPhraseBytes);
  }

  return {
    raw: string_,
    version,
    statusCode,
    statusText: finalStatusMessage,
  };
}
