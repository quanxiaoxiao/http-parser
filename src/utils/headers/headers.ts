import type { Headers, NormalizedHeaders } from '../../types.js';

export function getHeaderValue(
  headers: NormalizedHeaders | Headers,
  key: string,
): string[] | undefined {
  const values = headers[key.toLowerCase()];
  if (values == null) {
    return undefined;
  }
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return undefined;
    }
    return values;
  }
  return [values];
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
  const existing = headers[normalizedKey];
  if (existing) {
    existing.push(...values);
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
