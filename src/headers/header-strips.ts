import type { NormalizedHeaders } from '../types.js';
import { validateConnectionHeader } from './connection-header.js';
import { getHeaderValues } from './headers.js';

const HOP_BY_HOP_HEADERS = [
  'connection',
  'transfer-encoding',
  'content-length',
  'trailer',
  'upgrade',
  'expect',
  'te',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
] as const;

const FRAMING_HEADERS = [
  'content-length',
  'transfer-encoding',
  'content-encoding',
  'content-type',
  'content-range',
] as const;

export function stripHopByHopHeaders(headers: NormalizedHeaders): void {
  for (const key of HOP_BY_HOP_HEADERS) {
    delete headers[key];
  }
}

export function stripFramingHeaders(headers: NormalizedHeaders): void {
  for (const key of FRAMING_HEADERS) {
    delete headers[key];
  }
}

export function sanitizeHeaders(headers: NormalizedHeaders): void {
  const connectionValue = getHeaderValues(headers, 'connection');
  if (connectionValue) {
    const validation = validateConnectionHeader(connectionValue.join(','));
    stripHopByHopHeaders(headers);
    for (const key of validation.hopByHopHeaders) {
      delete headers[key.toLowerCase()];
    }
  }
}
