import type { NormalizedHeaders } from '../types.js';
import { setHeader } from './headers.js';

export function applyHostHeader(
  headers: NormalizedHeaders,
  host: string,
): void {
  if (!host) {
    throw new Error('Client request requires host');
  }

  setHeader(headers, 'host', host);
}
