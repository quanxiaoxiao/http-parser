import createHeaderGetter from './createHeaderGetter';

export default (headers: Record<string, string | string[] | number>): boolean => {

  const getter = createHeaderGetter(headers);

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
