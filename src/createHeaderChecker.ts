import {
  type Headers,
} from './types.js';

export default (obj: Headers) => {
  const lowerCaseKeys = new Set(Object.keys(obj).map(key => key.toLowerCase()));

  return (headerName: string | string[]): boolean => {
    if (Array.isArray(headerName)) {
      if (headerName.length === 0) {
        return false;
      }
      return headerName.every((name) => lowerCaseKeys.has(name.toLowerCase()));
    }
    return lowerCaseKeys.has(headerName.toLowerCase());
  };
};
