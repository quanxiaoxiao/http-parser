import { DecodeHttpError } from '../errors.js';

const REQUEST_STARTLINE_REG = /^(\w+)\s+([^\s]+)\s+(HTTP\/1\.[01])$/i;

const HTTP_VERSION_1_0 = 1.0;
const HTTP_VERSION_1_1 = 1.1;

const HTTP_VERSION_MAP: Record<string, number> = {
  'HTTP/1.0': HTTP_VERSION_1_0,
  'HTTP/1.1': HTTP_VERSION_1_1,
};

export interface RequestStartLine {
  method: string;
  path: string;
  version: number;
}

export default function parseRequestLine(str: string): RequestStartLine {
  if (!str || typeof str !== 'string') {
    throw new DecodeHttpError('Invalid input: request line must be a non-empty string');
  }

  const trimmedStr = str.trim();
  const matches = trimmedStr.match(REQUEST_STARTLINE_REG);
  if (!matches) {
    throw new DecodeHttpError(
      `Failed to parse HTTP request line: "${trimmedStr.substring(0, 50)}${trimmedStr.length > 50 ? '...' : ''}"`,
    );
  }

  const [, method, path, versionStr] = matches;
  const version = HTTP_VERSION_MAP[versionStr?.toUpperCase() as string];

  if (!version) {
    throw new DecodeHttpError(`Unsupported HTTP version: ${versionStr}`);
  }

  return {
    method: method?.toUpperCase() as string,
    path: path as string,
    version,
  };
};
