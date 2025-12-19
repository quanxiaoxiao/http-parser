import { type Headers, type NormalizedHeaders } from '../types.js';

export function normalizeHeaders(input?: Headers): NormalizedHeaders {
  const headers: NormalizedHeaders = {};
  if (!input) {
    return headers;
  }

  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (rawValue == null) {
      continue;
    }

    const key = rawKey.toLowerCase();
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    const normalizedValues = values
      .filter((v): v is string => v != null)
      .map(v => v.trim())
      .filter(v => v.length > 0);

    if (normalizedValues.length === 0) {
      continue;
    }

    if (headers[key]) {
      headers[key].push(...normalizedValues);
    } else {
      headers[key] = normalizedValues;
    }
  }

  return headers;
}

export function getHeaderValue(
  headers: NormalizedHeaders,
  key: string,
): string | undefined {
  const values = headers[key.toLowerCase()];
  return values?.[0];
}

export function setHeader(
  headers: NormalizedHeaders,
  key: string,
  value: string | string[],
): void {
  const normalizedKey = key.toLowerCase();
  headers[normalizedKey] = Array.isArray(value) ? value : [value];
}

export function appendHeader(
  headers: NormalizedHeaders,
  key: string,
  value: string | string[],
): void {
  const normalizedKey = key.toLowerCase();
  const values = Array.isArray(value) ? value : [value];
  if (headers[normalizedKey]) {
    headers[normalizedKey].push(...values);
  } else {
    headers[normalizedKey] = values;
  }
}

export function deleteHeader(headers: NormalizedHeaders, key: string): boolean {
  const normalizedKey = key.toLowerCase();
  if (normalizedKey in headers) {
    delete headers[normalizedKey];
    return true;
  }
  return false;
}
