import * as http from 'node:http';

import { type ResponseStartLine } from '../types.js';

export function encodeResponseLine(startLine: ResponseStartLine = {
  version: 1.1,
  statusCode: 200,
  statusText: 'OK',
}) {
  const { version, statusCode = 200, statusText } = startLine;
  const versionStr = typeof version === 'number' ? `HTTP/${version}` : String(version);
  const text = statusText ?? http.STATUS_CODES[statusCode] ?? 'Unknown';
  const line = `${versionStr} ${statusCode} ${text}`;
  return Buffer.from(line);
}
