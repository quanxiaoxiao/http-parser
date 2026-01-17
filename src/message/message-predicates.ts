import { getHeaderValues } from '../headers/headers.js';
import { type HttpMessage } from '../types.js';

export function isWebSocketRequest(httpMessage: HttpMessage): boolean {
  if ('method' in httpMessage && httpMessage.method !== 'GET') {
    return false;
  }

  const connectionValue = getHeaderValues(httpMessage.headers, 'connection');
  if (!connectionValue?.[0]) {
    return false;
  }

  const upgradeValue = getHeaderValues(httpMessage.headers, 'upgrade');
  if (!upgradeValue?.[0]) {
    return false;
  }

  return (
    connectionValue[0].toLowerCase() === 'upgrade' &&
    upgradeValue[0].toLowerCase() === 'websocket'
  );
}
