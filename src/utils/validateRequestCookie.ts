export interface CookiePair {
  name: string;
  value: string;
}

export interface CookieParsed {
  cookies: CookiePair[];
  map: Record<string, string>;
}

export type CookieValidationResult =
  | { valid: true; value: CookieParsed }
  | { valid: false; reason: string };

export interface CookieValidationOptions {
  forbidDuplicateNames?: boolean;
  decodeValue?: boolean;
  maxCookies?: number;
}

const COOKIE_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/;
const COOKIE_VALUE_REGEX = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;
const INVALID_CHARS_REGEX = /[\r\n]/;

const DEFAULT_MAX_COOKIES = 100;

export function validateRequestCookie(
  raw: string,
  options: CookieValidationOptions = {},
): CookieValidationResult {
  if (typeof raw !== 'string') {
    return { valid: false, reason: 'Cookie header is not a string' };
  }

  if (INVALID_CHARS_REGEX.test(raw)) {
    return { valid: false, reason: 'Cookie header contains CR/LF' };
  }

  const pairs = raw.split(';');
  const maxCookies = options.maxCookies ?? DEFAULT_MAX_COOKIES;

  if (pairs.length > maxCookies) {
    return { valid: false, reason: `Too many cookies (>${maxCookies})` };
  }

  const cookies: CookiePair[] = [];
  const map: Record<string, string> = {};
  const seen = options.forbidDuplicateNames ? new Set<string>() : null;

  for (const part of pairs) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      return { valid: false, reason: `Invalid cookie pair: "${trimmed}"` };
    }

    const name = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (!COOKIE_NAME_REGEX.test(name)) {
      return { valid: false, reason: `Invalid cookie name: "${name}"` };
    }

    if (!COOKIE_VALUE_REGEX.test(value)) {
      return { valid: false, reason: `Invalid cookie value for "${name}"` };
    }

    if (options.decodeValue) {
      try {
        value = decodeURIComponent(value);
      } catch {
        return {
          valid: false,
          reason: `Failed to decode cookie value: "${name}"`,
        };
      }
    }

    if (seen) {
      if (seen.has(name)) {
        return { valid: false, reason: `Duplicate cookie name: "${name}"` };
      }
      seen.add(name);
    }

    cookies.push({ name, value });
    map[name] = value;
  }

  if (cookies.length === 0) {
    return { valid: false, reason: 'No valid cookies found' };
  }

  return { valid: true, value: { cookies, map } };
}
