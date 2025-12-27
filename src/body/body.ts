import { Buffer } from 'node:buffer';

export function readBodyLength(body: Buffer | string): number {
  if (Buffer.isBuffer(body)) {
    return body.length;
  }
  return Buffer.byteLength(body, 'utf8');
}
