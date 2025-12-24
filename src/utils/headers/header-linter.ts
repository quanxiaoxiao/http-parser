const HEADER_NAME_REGEX = /^([A-Z][a-z0-9]*)(-[A-Z][a-z0-9]*)*$/;
const FORBIDDEN_PREFIX = /^X-/i;

const VALID_TOKEN_CHARS = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;

const STANDARD_HEADERS = new Set([
  'Accept', 'Accept-Encoding', 'Accept-Language', 'Authorization',
  'Cache-Control', 'Content-Type', 'Content-Length', 'Content-Encoding',
  'Cookie', 'Date', 'ETag', 'Expires', 'Host', 'If-Modified-Since',
  'If-None-Match', 'Last-Modified', 'Location', 'Range', 'Referer',
  'Server', 'Set-Cookie', 'Transfer-Encoding', 'User-Agent',
  'Vary', 'WWW-Authenticate', 'Access-Control-Allow-Origin',
  'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers',
  'Content-Security-Policy', 'Strict-Transport-Security',
]);

interface LintResult {
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

function findSimilarHeader(name: string): string | null {
  const nameLower = name.toLowerCase();

  for (const standard of STANDARD_HEADERS) {
    const standardLower = standard.toLowerCase();

    if (Math.abs(nameLower.length - standardLower.length) <= 2) {
      if (nameLower.startsWith(standardLower.slice(0, 3)) ||
          standardLower.startsWith(nameLower.slice(0, 3))) {
        return standard;
      }
    }
  }

  return null;
}

export function lintHeaderName(name: string): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push('Header name cannot be empty');
    return { errors, warnings, suggestions };
  }

  const trimmedName = name.trim();
  if (trimmedName !== name) {
    errors.push('Header name contains leading or trailing whitespace');
  }

  if (/\s/.test(name)) {
    errors.push('Header name cannot contain whitespace');
    return { errors, warnings, suggestions };
  }

  if (!VALID_TOKEN_CHARS.test(name)) {
    errors.push('Header name contains invalid characters (must be valid token chars per RFC 9110)');
  }

  if (name.length > 256) {
    errors.push('Header name is too long (max 256 characters recommended)');
  }

  if (!HEADER_NAME_REGEX.test(name)) {
    warnings.push('Header should use Title-Case with "-" separators (e.g., Content-Type)');
    const suggested = name
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('-');
    if (suggested !== name) {
      suggestions.push(`Consider using: ${suggested}`);
    }
  }

  if (FORBIDDEN_PREFIX.test(name)) {
    warnings.push('X- prefix is deprecated per RFC 6648, use a descriptive name instead');
  }

  if (/--/.test(name)) {
    errors.push('Header name contains consecutive hyphens');
  }

  if (name.startsWith('-') || name.endsWith('-')) {
    errors.push('Header name cannot start or end with a hyphen');
  }

  if (/^\d/.test(name)) {
    warnings.push('Header name should not start with a number');
  }

  if (name === name.toUpperCase() && name.length > 1 && /[A-Z]/.test(name)) {
    warnings.push('Avoid all-uppercase header names, use Title-Case instead');
  }

  if (name === name.toLowerCase() && name.includes('-')) {
    warnings.push('Header name should use Title-Case, not all-lowercase');
  }

  if (!STANDARD_HEADERS.has(name)) {
    const similar = findSimilarHeader(name);
    if (similar) {
      suggestions.push(`Did you mean: ${similar}?`);
    }
  }

  if (name.toLowerCase() === 'referrer') {
    suggestions.push('Note: The standard header is "Referer" (misspelled by design in HTTP spec)');
  }

  const reservedPrefixes = ['Sec-', 'Proxy-'];
  for (const prefix of reservedPrefixes) {
    if (name.startsWith(prefix)) {
      warnings.push(`"${prefix}" prefix is reserved for specific use cases`);
    }
  }

  return { errors, warnings, suggestions };
}
