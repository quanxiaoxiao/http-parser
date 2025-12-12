import { type Headers } from '../types.js';
import validateHost from './validateHost.js';

interface ValidationError {
  header: string;
  error: string;
  value: unknown;
  index?: number;
}

type FormatValidator = (value: string) => boolean;

const HEADER_CONFIGS = {
  singleValue: new Set([
    // Content
    'content-length',
    'content-type',
    'content-encoding',
    'content-location',
    'content-disposition',

    // Request
    'host',
    'user-agent',
    'referer',
    'authorization',
    'origin',

    // Conditional
    'if-modified-since',
    'if-unmodified-since',
    'if-match',
    'if-none-match',

    // Routing / Control
    'max-forwards',
    'range',
    'content-range',

    // Caching
    'age',
    'etag',
    'location',
    'server',
    'date',
    'expires',
    'last-modified',
    'retry-after',

    // Connection-level
    'connection',
    'transfer-encoding',
    'te',
    'upgrade',

    // Cookie
    'cookie',
  ]),

  numeric: new Set([
    'content-length',
    'max-forwards',
    'age',
    'retry-after',
    'content-range',
  ]),

  date: new Set([
    'date',
    'expires',
    'last-modified',
    'if-modified-since',
    'if-unmodified-since',
    'retry-after',
  ]),

  multiComma: new Set([
    'accept',
    'accept-encoding',
    'accept-language',
    'allow',
    'cache-control',
    'connection',
    'pragma',
    'range',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'vary',
    'via',
    'warning',
  ]),

  multiSeparate: new Set([
    'set-cookie',
    'www-authenticate',
    'proxy-authenticate',
  ]),

  conflicts: [
    ['content-length', 'transfer-encoding'] as const,
  ] as const,
} as const;

const PATTERNS = {
  headerName: /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/,
  controlChars: /[\u0000-\u0008\u000A-\u001F\u007F]/, // eslint-disable-line no-control-regex
  numeric: /^\d+$/,
  contentType: /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.-]*(?:\s*;\s*.+)?$/,
  authorization: /^[a-zA-Z0-9_-]+\s+.+$/,
  range: /^bytes=\d*-\d*(?:,\s*\d*-\d*)*$/,
  contentRange: /^bytes\s+(?:\d+-\d+|\*)\/(?:\d+|\*)$/,
  accept: /^[a-zA-Z0-9*][a-zA-Z0-9!#$&^_.*-]*\/[a-zA-Z0-9*][a-zA-Z0-9!#$&^_.*-]*(?:\s*;\s*q=[0-1](?:\.\d+)?)?(?:\s*,\s*.+)?$/,
  cacheControl: /^(?:no-cache|no-store|no-transform|only-if-cached|public|private|must-revalidate|proxy-revalidate|max-age=\d+|s-maxage=\d+|max-stale(?:=\d+)?|min-fresh=\d+)(?:\s*,\s*(?:no-cache|no-store|no-transform|only-if-cached|public|private|must-revalidate|proxy-revalidate|max-age=\d+|s-maxage=\d+|max-stale(?:=\d+)?|min-fresh=\d+))*$/,
} as const;

const FORMAT_VALIDATORS: Record<string, FormatValidator> = {
  'content-type': (value) => PATTERNS.contentType.test(value),
  host: (value) => validateHost(value).valid,
  authorization: (value) => PATTERNS.authorization.test(value),
  range: (value) => PATTERNS.range.test(value),
  'content-range': (value) => PATTERNS.contentRange.test(value),
  accept: (value) => PATTERNS.accept.test(value),
  'cache-control': (value) => PATTERNS.cacheControl.test(value),
};

function createError(
  header: string,
  error: string,
  value: unknown,
  index?: number,
): ValidationError {
  const err: ValidationError = { header, error, value };
  if (index !== undefined) err.index = index;
  return err;
}

function validateNumericHeader(
  key: string,
  value: string,
  index: number,
  trimmedValue: string,
): ValidationError | null {
  if (!PATTERNS.numeric.test(trimmedValue)) {
    return createError(key, `${key} must be a non-negative integer`, value, index);
  }

  const num = Number(trimmedValue);
  if (num < 0 || !Number.isSafeInteger(num)) {
    return createError(key, `${key} value exceeds safe range`, value, index);
  }

  return null;
}

function validateConflictHeaders(
  headerNames: string[],
): ValidationError | null {
  const headerSet = new Set(headerNames);

  for (const [name1, name2] of HEADER_CONFIGS.conflicts) {
    if (headerSet.has(name1) && headerSet.has(name2)) {
      return createError(name1, `Cannot be used with ${name2}`, undefined);
    }
  }

  return null;
}

function validateDateHeader(
  key: string,
  value: string,
  index: number,
): ValidationError | null {
  const timestamp = Date.parse(value);
  if (isNaN(timestamp)) {
    return createError(key, `${key} must be a valid date format`, value, index);
  }
  return null;
}

function validateHeaderValue(
  key: string,
  value: string,
  index: number,
  headerName: string,
): ValidationError | null {
  if (typeof value !== 'string') {
    return createError(key, 'Headers value must be a string', value, index);
  }

  if (PATTERNS.controlChars.test(value)) {
    return createError(key, 'Headers value contains illegal control characters', value, index);
  }

  const trimmedValue = value.trim();

  if (HEADER_CONFIGS.numeric.has(headerName)) {
    return validateNumericHeader(key, value, index, trimmedValue);
  }

  if (HEADER_CONFIGS.date.has(headerName)) {
    return validateDateHeader(key, value, index);
  }

  const validator = FORMAT_VALIDATORS[headerName];
  if (validator && !validator(trimmedValue)) {
    return createError(key, `${key} has incorrect format`, value, index);
  }

  return null;
}

export default function validateHeaders(headers: Headers): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!headers || Object.keys(headers).length === 0) {
    return errors;
  }

  const headerNames = Object.keys(headers);

  for (const headerName of headerNames) {
    const headerValue = headers[headerName];
    if (!PATTERNS.headerName.test(headerName)) {
      errors.push(createError(headerName, 'Headers name contains illegal characters', headerValue));
      continue;
    }

    const values = Array.isArray(headerValue) ? headerValue : [headerValue];

    if (HEADER_CONFIGS.singleValue.has(headerName) && values.length > 1) {
      errors.push(createError(headerName, 'Headers cannot have multiple values', headerValue));
      continue;
    }

    for (let i = 0; i < values.length; i++) {
      const error = validateHeaderValue(headerName, values[i] as string, i, headerName);
      if (error) {
        errors.push(error);
      }
    }
  }

  const conflictError = validateConflictHeaders(headerNames);
  if (conflictError) {
    errors.push(conflictError);
  }

  return errors;
}

export { validateHeaders, type ValidationError };
