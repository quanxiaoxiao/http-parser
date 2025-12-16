export type CacheControlDirectiveValue = number | string | boolean;

export interface CacheControlParsed {
  [directive: string]: CacheControlDirectiveValue;
}

export type CacheControlResult =
  | {
      valid: true;
      directives: CacheControlParsed;
    }
  | {
      valid: false;
      reason: string;
    };

const CRLF_PATTERN = /[\r\n]/;
const DIRECTIVE_NAME_PATTERN = /^[a-z0-9!#$%&'*+.^_`|~-]+$/;
const NUMERIC_PATTERN = /^\d+$/;

function parseDirectiveValue(
  key: string,
  valRaw: string,
): { value: CacheControlDirectiveValue; error?: undefined } | { error: string; value?: undefined } {
  if (NUMERIC_PATTERN.test(valRaw)) {
    const num = Number(valRaw);
    if (num < 0) {
      return { error: `directive ${key} value must be >=0` };
    }
    if (!Number.isSafeInteger(num)) {
      return { error: `directive ${key} value exceeds safe integer range` };
    }
    return { value: num };
  }

  if (valRaw.startsWith('"') && valRaw.endsWith('"')) {
    if (valRaw.length < 2) {
      return { error: `directive ${key} has invalid quoted value` };
    }
    const unquoted = valRaw.slice(1, -1);
    if (unquoted.includes('"')) {
      return { error: `directive ${key} has unescaped quote in value` };
    }
    return { value: unquoted };
  }

  if (/^[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/.test(valRaw)) {
    return { value: valRaw };
  }

  return { error: `directive ${key} has invalid value format: ${valRaw}` };
}

function splitDirectives(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ',' && !inQuotes) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
      current = '';
    } else {
      current += char;
    }
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    parts.push(trimmed);
  }
  return parts;
}

export function validateCacheControl(value: string): CacheControlResult {
  if (typeof value !== 'string') {
    return { valid: false, reason: 'not a string' };
  }

  if (CRLF_PATTERN.test(value)) {
    return { valid: false, reason: 'contains CR/LF' };
  }

  const parts = splitDirectives(value);

  if (parts.length === 0) {
    return { valid: false, reason: 'empty Cache-Control header' };
  }

  const directives: CacheControlParsed = {};

  for (const part of parts) {
    const equalIndex = part.indexOf('=');
    const key = (equalIndex === -1 ? part : part.slice(0, equalIndex))
      .trim()
      .toLowerCase();
    const valRaw = equalIndex === -1 ? undefined : part.slice(equalIndex + 1).trim();

    if (!DIRECTIVE_NAME_PATTERN.test(key)) {
      return { valid: false, reason: `invalid directive name: ${key}` };
    }

    if (key in directives) {
      return { valid: false, reason: `duplicate directive: ${key}` };
    }

    if (valRaw === undefined) {
      directives[key] = true;
    } else {
      const parsedValue = parseDirectiveValue(key, valRaw);
      if (parsedValue.error) {
        return { valid: false, reason: parsedValue.error };
      }
      directives[key] = parsedValue.value!;
    }
  }

  return { valid: true, directives };
}

export default validateCacheControl;
