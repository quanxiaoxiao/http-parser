import {
  readBodyLength,
} from '../body/body.js';
import {
  isStreamBody,
} from '../body/body-predicates.js';
import {
  stripHopByHopHeaders,
} from '../headers/header-strips.js';
import {
  appendHeader,
  deleteHeader,
} from '../headers/headers.js';
import {
  isRequestStartLine,
  isResponseStartLine,
} from '../start-line/start-line-predicates.js';
import type {
  Body,
  NormalizedHeaders,
  RequestStartLine,
  ResponseStartLine,
} from '../types.js';

const METHODS_WITHOUT_BODY = ['GET', 'HEAD', 'OPTIONS', 'TRACE'] as const;

const isStatusCodeWithoutBody = (statusCode: number): boolean => {
  return (
    (statusCode >= 100 && statusCode < 200) ||
    statusCode === 204 ||
    statusCode === 304
  );
};

const setHeadersForEmptyBody = (
  startLine: RequestStartLine | ResponseStartLine,
  headers: NormalizedHeaders,
): void => {
  stripHopByHopHeaders(headers);
  if (isRequestStartLine(startLine)) {
    const method = startLine.method?.toUpperCase() ?? '';
    if (!METHODS_WITHOUT_BODY.includes(method as typeof METHODS_WITHOUT_BODY[number])) {
      appendHeader(headers, 'content-length', '0');
    }
    return;
  }

  if (isResponseStartLine(startLine)) {
    const statusCode = startLine.statusCode as number;
    if (!isStatusCodeWithoutBody(statusCode)) {
      appendHeader(headers, 'content-length', '0');
    }
  }
};

const setHeadersForStreamBody = (headers: NormalizedHeaders): void => {
  deleteHeader(headers, 'content-length');
  deleteHeader(headers, 'content-range');
  appendHeader(headers, 'transfer-encoding', 'chunked');
};

const setHeadersForFixedBody = (
  headers: NormalizedHeaders,
  bodyLength: number,
): void => {
  deleteHeader(headers, 'transfer-encoding');
  appendHeader(headers, 'content-length', String(bodyLength));
};

export function applyFramingHeaders(
  startLine: RequestStartLine | ResponseStartLine,
  headers: NormalizedHeaders,
  body: Body,
) {
  if (isStreamBody(body)) {
    setHeadersForStreamBody(headers);
    return;
  }

  if (body == null) {
    setHeadersForEmptyBody(startLine, headers);
    return;
  }
  const bodyLength = readBodyLength(body);
  if (bodyLength === 0) {
    setHeadersForEmptyBody(startLine, headers);
    return;
  }
  setHeadersForFixedBody(headers, bodyLength);
}
