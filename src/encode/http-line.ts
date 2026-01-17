import { Buffer } from 'node:buffer';

import {
  CR,
  LF,
} from '../specs.js';

export function encodeHttpLine(buf: Buffer): Buffer {
  const result = Buffer.allocUnsafe(buf.length + 2);
  buf.copy(result, 0);
  result[buf.length] = CR;
  result[buf.length + 1] = LF;
  return result;
}

export function encodeHttpLines(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    return Buffer.alloc(0);
  }
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length + 2, 0);
  const result = Buffer.allocUnsafe(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    buf.copy(result, offset);
    offset += buf.length;
    result[offset++] = CR;
    result[offset++] = LF;
  }
  return result;
}
