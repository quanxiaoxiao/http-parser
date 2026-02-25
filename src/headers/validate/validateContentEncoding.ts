export type ContentEncoding =
  | 'gzip'
  | 'br'
  | 'deflate'
  | 'identity'
  | 'zstd'
  | string;

export interface ContentEncodingParsed {
  encodings: ContentEncoding[];
}

export type ContentEncodingValidationResult =
  | {
      valid: true;
      value: ContentEncodingParsed;
    }
  | {
      valid: false;
      reason: string;
    };

export interface ValidationOptions {
  forbidIdentityMix?: boolean;
  strictKnownEncodings?: boolean;
}

const TOKEN_REGEX = /^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/;

const KNOWN_ENCODINGS = new Set([
  'gzip',
  'br',
  'deflate',
  'identity',
  'zstd',
] as const);

const createError = (reason: string): ContentEncodingValidationResult => ({
  valid: false,
  reason,
});

const createSuccess = (encodings: ContentEncoding[]): ContentEncodingValidationResult => ({
  valid: true,
  value: { encodings },
});

function validateBasicFormat(raw: string): string | null {
  if (typeof raw !== 'string') {
    return 'Content-Encoding is not a string';
  }
  if (/[\r\n]/.test(raw)) {
    return 'Content-Encoding contains CR/LF';
  }
  return null;
}

function parseEncodings(raw: string): string[] {
  return raw
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
}

function validateEncodingToken(
  part: string,
  seen: Set<string>,
  options?: ValidationOptions,
): string | null {
  const encoding = part.toLowerCase();

  if (!TOKEN_REGEX.test(encoding)) {
    return `invalid encoding token: ${part}`;
  }

  if (seen.has(encoding)) {
    return `duplicate encoding: ${encoding}`;
  }

  if (options?.strictKnownEncodings && !KNOWN_ENCODINGS.has(encoding as any)) { // eslint-disable-line
    return `unknown encoding: ${encoding}`;
  }

  return null;
}

function validateIdentityMix(
  encodings: ContentEncoding[],
  forbidIdentityMix?: boolean,
): string | null {
  if (forbidIdentityMix && encodings.includes('identity') && encodings.length > 1) {
    return 'identity must not be combined with other encodings';
  }
  return null;
}

export function validateContentEncoding(
  raw: string,
  options?: ValidationOptions,
): ContentEncodingValidationResult {
  const formatError = validateBasicFormat(raw);
  if (formatError) {
    return createError(formatError);
  }

  const parts = parseEncodings(raw);
  if (parts.length === 0) {
    return createError('Content-Encoding is empty');
  }

  const encodings: ContentEncoding[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const error = validateEncodingToken(part, seen, options);
    if (error) {
      return createError(error);
    }

    const encoding = part.toLowerCase();
    seen.add(encoding);
    encodings.push(encoding);
  }

  const identityError = validateIdentityMix(encodings, options?.forbidIdentityMix);
  if (identityError) {
    return createError(identityError);
  }

  return createSuccess(encodings);
}
