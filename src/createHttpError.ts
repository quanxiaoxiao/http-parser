import * as http from 'node:http';

export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message?: string) {
    super(message || http.STATUS_CODES[statusCode] || 'Unknown Error');
    this.name = 'HttpError';
    this.statusCode = statusCode;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }
}

export default function createHttpError(
  statusCode: number = 500,
  message?: string,
): HttpError {
  if (
    !Number.isInteger(statusCode) ||
    statusCode < 400 ||
    statusCode > 599
  ) {
    throw new TypeError(
      `statusCode must be an integer between 400 and 599, got ${statusCode}`,
    );
  }

  return new HttpError(statusCode, message);
}

export const createBadRequest = (message?: string) =>
  createHttpError(400, message);

export const createUnauthorized = (message?: string) =>
  createHttpError(401, message);

export const createForbidden = (message?: string) =>
  createHttpError(403, message);

export const createNotFound = (message?: string) =>
  createHttpError(404, message);

export const createConflict = (message?: string) =>
  createHttpError(409, message);

export const createInternalServerError = (message?: string) =>
  createHttpError(500, message);

export const createNotImplemented = (message?: string) =>
  createHttpError(501, message);

export const createServiceUnavailable = (message?: string) =>
  createHttpError(503, message);
