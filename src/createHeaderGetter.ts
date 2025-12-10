import { type Headers } from './types.js';

export default (obj: Headers) => {
  const headers: Headers = {};
  for (const key in obj) {
    const headerValue = obj[key];
    if (headerValue != null) {
      headers[key.toLowerCase()] = headerValue;
    }
  }
  return (headerName: string): string | number | string[] | null =>
    headers[headerName.toLowerCase()] ?? null;
};
