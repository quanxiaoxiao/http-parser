export const contentTypes = [
  'application/json',
  'application/xml',
  'text/html',
  'text/plain',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'application/octet-stream',
];

export const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export const validDates = [
  'Sun, 06 Nov 1994 08:49:37 GMT',
  'Sunday, 06-Nov-94 08:49:37 GMT',
  'Sun Nov  6 08:49:37 1994',
];

export const invalidDates = [
  '',
  'Invalid Date',
  'Sun, 06 Nov 1994',
  'Sun, 32 Jan 1994 08:49:37 GMT',
  'Sun, 06 Nov 1994 25:00:00 GMT',
];

export const statusCodes = {
  informational: [100, 101, 102, 103],
  success: [200, 201, 204],
  redirect: [301, 302, 304],
  clientError: [400, 401, 403, 404, 429],
  serverError: [500, 502, 503, 504],
};
