import { Buffer } from 'node:buffer';

import { encodeHttpLine } from '../encodeHttpLine.js';
import { type Headers,type RequestStartLine } from '../types.js';
import encodeHeaders from './encodeHeaders.js';
import encodeRequestLine from './encodeRequestLine.js';

export function* encodeHttpRequest({
  startLine,
  headers,
  body,
}: { startLine: RequestStartLine, headers: Headers, body?: Buffer}) {
  yield encodeHttpLine(encodeRequestLine(startLine));
}
