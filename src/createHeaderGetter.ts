import { type Header } from './types.js';

export default (obj: Header) => {
  const headers: Header = {};
  for (const key in obj) {
    const headerValue = obj[key];
    if (headerValue != null) {
      headers[key.toLowerCase()] = headerValue;
    }
  }
  return (headerName: string): string | number | string[] | null =>
    headers[headerName.toLowerCase()] ?? null;
};
