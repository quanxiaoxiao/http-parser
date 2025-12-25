import type { Headers, NormalizedHeaders } from '../../types.js';

export function normalizeHeaders(input?: Headers): NormalizedHeaders {
  if (!input) {
    return {};
  }

  const headers: NormalizedHeaders = {};

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
