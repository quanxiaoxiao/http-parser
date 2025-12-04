import createHeaderGetter from './createHeaderGetter';
import { type Header, type HttpMethod } from './types';

export default (method: HttpMethod, header: Header): boolean => {
  if (method !== 'GET') {
    return false;
  }
  const getter = createHeaderGetter(header);
  const connectionValue = getter('connection');
  if (!connectionValue || typeof connectionValue !== 'string') {
    return false;
  }
  if (!/^upgrade$/i.test(connectionValue as string)) {
    return false;
  }
  const upgradeValue = getter('upgrade');
  if (!upgradeValue || typeof upgradeValue !== 'string') {
    return false;
  }
  return /^websocket$/i.test(upgradeValue as string);
};
