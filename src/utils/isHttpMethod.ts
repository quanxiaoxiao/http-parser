const HTTP_METHODS = [
  'GET',
  'PUT',
  'DELETE',
  'POST',
  'PATCH',
  'HEAD',
  'OPTIONS',
  'CONNECT',
] as const;

type HttpMethod = typeof HTTP_METHODS[number];

export function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.includes(value as HttpMethod);
}
