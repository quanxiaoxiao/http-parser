import {
  STANDARD_HEADERS,
} from '../specs.js';

const HEADER_NAME_REGEX = /^([A-Z][a-z0-9]*)(-[A-Z][a-z0-9]*)*$/;
const FORBIDDEN_PREFIX = /^X-/i;

const VALID_TOKEN_CHARS = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;

const STANDARD_HEADERS_SET = new Set(STANDARD_HEADERS) as ReadonlySet<string>;

interface LintResult {
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

function findSimilarHeader(name: string): string | null {
  const nameLower = name.toLowerCase();

  for (const standard of STANDARD_HEADERS_SET) {
    if (Math.abs(nameLower.length - standard.length) <= 2) {
      if (nameLower.startsWith(standard.slice(0, 3)) ||
          standard.startsWith(nameLower.slice(0, 3))) {
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

  const nameLower = name.toLowerCase();

  if (name === nameLower && name.includes('-')) {
    warnings.push('Header name should use Title-Case, not all-lowercase');
  }

  if (!STANDARD_HEADERS_SET.has(nameLower)) {
    const similar = findSimilarHeader(name);
    if (similar) {
      suggestions.push(`Did you mean: ${similar}?`);
    }
  }

  if (nameLower === 'referrer') {
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
