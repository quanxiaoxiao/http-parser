import * as http from 'node:http';

import { DecodeHttpError } from '../errors.js';
import parseInteger from '../parseInteger.js';
import { type ResponseStartLine } from '../types.js';

const HTTP_VERSION_1_0 = 1.0;
const HTTP_VERSION_1_1 = 1.1;
const MIN_STATUS_CODE = 100;
const MAX_STATUS_CODE = 599;
const ERROR_PREVIEW_LENGTH = 50;

const RESPONSE_STARTLINE_REG = /^(HTTP\/1\.[01])\s+(\d{3})(?:\s+(.*))?$/i;

const HTTP_VERSION_MAP: Record<string, number> = {
  'HTTP/1.0': HTTP_VERSION_1_0,
  'HTTP/1.1': HTTP_VERSION_1_1,
};

export default function parseResponseLine(str: string): ResponseStartLine {
  if (!str?.trim()) {
    throw new DecodeHttpError('Invalid input: response line must be a non-empty string');
  }

  const trimmedStr = str.trim();
  const matches = trimmedStr.match(RESPONSE_STARTLINE_REG);

  if (!matches) {
    const preview = trimmedStr.length > ERROR_PREVIEW_LENGTH
      ? `${trimmedStr.substring(0, ERROR_PREVIEW_LENGTH)}...`
      : trimmedStr;
    throw new DecodeHttpError(`Failed to parse HTTP response line: "${preview}"`);
  }

  const [, versionStr, statusCodeStr, statusMessage] = matches;

  const version = HTTP_VERSION_MAP[versionStr?.toUpperCase() as string];

  if (version === undefined) {
    throw new DecodeHttpError(`Unsupported HTTP version: ${versionStr}`);
  }

  const statusCode = parseInteger(statusCodeStr as string);

  if (statusCode == null || statusCode < MIN_STATUS_CODE || statusCode > MAX_STATUS_CODE) {
    throw new DecodeHttpError(`Invalid HTTP status code: ${statusCode} (must be ${MIN_STATUS_CODE}-${MAX_STATUS_CODE})`);
  }

  const finalStatusMessage = statusMessage?.trim() || http.STATUS_CODES[statusCode] || 'Unknown';

  return {
    version,
    statusCode,
    statusMessage: finalStatusMessage,
  };
}
