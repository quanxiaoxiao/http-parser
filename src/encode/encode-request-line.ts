import { type RequestStartLine } from '../types.js';

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
