import * as http from 'node:http';

import type { RequestStartLine, ResponseStartLine } from '../types.js';

export function encodeRequestLine(startLine: RequestStartLine = {
  method: 'GET',
  path: '/',
  version: 1.1,
}) {
  const { method = 'GET', path = '/', version = 1.1 } = startLine;
  const versionStr = `HTTP/${String(Number.isInteger(version) ? `${version}.0` : version)}`;
  const line = `${method.toUpperCase()} ${path} ${versionStr}`;

  return Buffer.from(line);
}

export function encodeResponseLine(startLine: ResponseStartLine = {
  version: 1.1,
  statusCode: 200,
  statusText: 'OK',
}) {
  const { version, statusCode = 200, statusText } = startLine;
  const versionStr = `HTTP/${String(Number.isInteger(version) ? `${version}.0` : version)}`;
  const text = statusText ?? http.STATUS_CODES[statusCode] ?? 'Unknown';
  const line = `${versionStr} ${statusCode} ${text}`;
  return Buffer.from(line);
}
