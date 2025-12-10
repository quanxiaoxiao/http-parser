import createHeaderGetter from './createHeaderGetter.js';
import { type Headers, type HttpMethod } from './types.js';

export default (method: HttpMethod, headers: Headers): boolean => {
  if (method !== 'GET') {
    return false;
  }
  const getter = createHeaderGetter(headers);
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
