import { type Headers } from '../types.js';

type ConnectionToken = 'close' | 'keep-alive' | 'upgrade' | string;

interface ConnectionValidationResult {
  valid: boolean;
  tokens: ConnectionToken[];
  hasClose: boolean;
  hasKeepAlive: boolean;
  hasUpgrade: boolean;
  hopByHopHeaders: string[];
  errors?: string[];
}

const TOKEN_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const STANDARD_HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function validateConnectionHeader(
  value: string | undefined,
): ConnectionValidationResult {
  if (!value?.trim()) {
    return {
      valid: true,
      tokens: [],
      hasClose: false,
      hasKeepAlive: false,
      hasUpgrade: false,
      hopByHopHeaders: [],
    };
  }

  const errors: string[] = [];
  const normalized: string[] = [];
  const result: ConnectionValidationResult = {
    valid: true,
    tokens: [],
    hasClose: false,
    hasKeepAlive: false,
    hasUpgrade: false,
    hopByHopHeaders: [],
  };

  const tokens = value.split(',');
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!.trim();
    if (!token) {
      continue;
    }
    if (!TOKEN_REGEX.test(token)) {
      errors.push(`Invalid connection token: "${token}"`);
      continue;
    }
    const lower = token.toLowerCase();
    normalized.push(lower);
    switch (lower) {
    case 'close':
      result.hasClose = true;
      break;
    case 'keep-alive':
      result.hasKeepAlive = true;
      break;
    case 'upgrade':
      result.hasUpgrade = true;
      break;
    default:
      result.hopByHopHeaders.push(lower);
    }
  }

  result.tokens = normalized;
  result.valid = errors.length === 0;
  if (errors.length > 0) {
    result.errors = errors;
  }

  return result;
}

export function stripHopByHopHeaders(
  headers: Headers,
  connection: ConnectionValidationResult,
): Headers {
  const result: Headers = {};
  const hopByHop = new Set([
    ...STANDARD_HOP_BY_HOP,
    ...connection.hopByHopHeaders,
  ]);

  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      const lowerKey = key.toLowerCase();
      if (!hopByHop.has(lowerKey)) {
        result[key] = headers[key]!;
      }
    }
  }

  return result;
}

export function sanitizeHeaders(headers: Headers): Headers {
  const connectionValue = headers.connection;
  const validation = validateConnectionHeader(connectionValue as string | undefined);
  return stripHopByHopHeaders(headers, validation);
}
