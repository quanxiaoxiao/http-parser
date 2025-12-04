import createHeaderGetter from './createHeaderGetter';
import { type Header } from './types';

export default (header: Header): boolean => {

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
