import createHeaderGetter from './createHeaderGetter.js';
import { type Headers } from './types.js';

export default (header: Headers): boolean => {

  const getter = createHeaderGetter(header);

  if (getter('transfer-encoding')) {
    return true;
  }

  const contentLength = getter('content-length');

  if (!contentLength) {
    return false;
  }

  if (contentLength === '0') {
    return false;
  }

  return true;
};
