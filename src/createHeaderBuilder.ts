import { type Headers } from './types.js';

type HeaderEntry = [data: Headers, raw: string[]];

const normalizeHeaderKey = (key: string): string => key.toLowerCase();

const mergeHeaderValue = (
  existing: string | string[] | undefined,
  value: string | string[],
): string | string[] => {
  if (existing === undefined) return value;
  const existingArray = Array.isArray(existing) ? existing : [existing];
  const newArray = Array.isArray(value) ? value : [value];
  return [...existingArray, ...newArray];
};

export default (initialHeader: Headers = {}) => {
  const raw: string[] = [];
  const data: Headers = {};

  for (const [key, value] of Object.entries(initialHeader)) {
    const normalizedKey = normalizeHeaderKey(key);
    const values = Array.isArray(value) ? value : [value];
    values.forEach(v => raw.push(key, v));
    data[normalizedKey] = mergeHeaderValue(data[normalizedKey], value);
  }

  return (...args: [string, string | string[]] | []): HeaderEntry => {
    if (args.length === 0) {
      return [data, raw];
    }
    const [key, value] = args;
    const normalizedKey = normalizeHeaderKey(key);
    const values = Array.isArray(value) ? value : [value];
    values.forEach(v => raw.push(key, v));
    data[normalizedKey] = mergeHeaderValue(data[normalizedKey], value);
    return [data, raw];
  };
};
