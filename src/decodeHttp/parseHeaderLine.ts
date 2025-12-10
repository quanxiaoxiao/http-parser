import { DecodeHttpError } from '../errors.js';

export default function parseHeaderLine(headerString: string): [string, string] {
  const separatorIndex = headerString.indexOf(':');
  if (separatorIndex === -1) {
    throw new DecodeHttpError(`HTTP Header missing ':' separator in "${headerString}"`);
  }
  const name = headerString.slice(0, separatorIndex).trim();
  const value = headerString.slice(separatorIndex + 1).trim();
  if (!name) {
    throw new DecodeHttpError(`HTTP Header has empty name in "${headerString}"`);
  }
  if (!value) {
    throw new DecodeHttpError(`HTTP Header has empty value in "${headerString}"`);
  }
  return [name, value];
}
