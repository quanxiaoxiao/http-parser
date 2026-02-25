export type CacheControlDirectiveValue = number | string | boolean;

export type CacheControlParsed = Record<string, CacheControlDirectiveValue>;

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
  valueRaw: string,
): { value: CacheControlDirectiveValue; error?: undefined } | { error: string; value?: undefined } {
  if (NUMERIC_PATTERN.test(valueRaw)) {
    const number_ = Number(valueRaw);
    if (number_ < 0) {
      return { error: `directive ${key} value must be >=0` };
    }
    if (!Number.isSafeInteger(number_)) {
      return { error: `directive ${key} value exceeds safe integer range` };
    }
    return { value: number_ };
  }

  if (valueRaw.startsWith('"') && valueRaw.endsWith('"')) {
    if (valueRaw.length < 2) {
      return { error: `directive ${key} has invalid quoted value` };
    }
    const unquoted = valueRaw.slice(1, -1);
    if (unquoted.includes('"')) {
      return { error: `directive ${key} has unescaped quote in value` };
    }
    return { value: unquoted };
  }

  if (/^[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/.test(valueRaw)) {
    return { value: valueRaw };
  }

  return { error: `directive ${key} has invalid value format: ${valueRaw}` };
}

function splitDirectives(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];

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
    const valueRaw = equalIndex === -1 ? undefined : part.slice(equalIndex + 1).trim();

    if (!DIRECTIVE_NAME_PATTERN.test(key)) {
      return { valid: false, reason: `invalid directive name: ${key}` };
    }

    if (key in directives) {
      return { valid: false, reason: `duplicate directive: ${key}` };
    }

    if (valueRaw === undefined) {
      directives[key] = true;
    } else {
      const parsedValue = parseDirectiveValue(key, valueRaw);
      if (parsedValue.error) {
        return { valid: false, reason: parsedValue.error };
      }
      directives[key] = parsedValue.value!;
    }
  }

  return { valid: true, directives };
}

export default validateCacheControl;
