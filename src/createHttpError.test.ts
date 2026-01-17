import * as assert from 'node:assert';
import { describe,test } from 'node:test';

import createHttpError, {
  createBadRequest,
  createConflict,
  createForbidden,
  createInternalServerError,
  createNotFound,
  createNotImplemented,
  createServiceUnavailable,
  createUnauthorized,
  HttpError,
} from './createHttpError.js';

describe('HttpError', () => {
  test('should create an HttpError instance with status code and message', () => {
    const error = new HttpError(404, 'Not Found');

    assert.strictEqual(error.statusCode, 404);
    assert.strictEqual(error.message, 'Not Found');
    assert.strictEqual(error.name, 'HttpError');
    assert.strictEqual(error instanceof Error, true);
    assert.strictEqual(error instanceof HttpError, true);
  });

  test('should use default HTTP status text when message is not provided', () => {
    const error = new HttpError(404);

    assert.strictEqual(error.statusCode, 404);
    assert.strictEqual(error.message, 'Not Found');
  });

  test('should handle unknown status codes gracefully', () => {
    const error = new HttpError(999);

    assert.strictEqual(error.statusCode, 999);
    assert.strictEqual(error.message, 'Unknown Error');
  });

  test('should maintain proper stack trace', () => {
    const error = new HttpError(500);

    assert.strictEqual(!!error.stack, true);
    assert.strictEqual(error.stack.includes('HttpError'), true);
  });
});

describe('createHttpError', () => {
  test('should create an error with valid status code', () => {
    const error = createHttpError(404, 'Resource not found');

    assert.strictEqual(error instanceof HttpError, true);
    assert.strictEqual(error.statusCode, 404);
    assert.strictEqual(error.message, 'Resource not found');
  });

  test('should use default status code 500 when not provided', () => {
    const error = createHttpError();

    assert.strictEqual(error.statusCode, 500);
    assert.strictEqual(error.message, 'Internal Server Error');
  });

  test('should use default HTTP status text when message is not provided', () => {
    const error = createHttpError(403);

    assert.strictEqual(error.statusCode, 403);
    assert.strictEqual(error.message, 'Forbidden');
  });

  test('should accept status codes from 400 to 599', () => {
    const error400 = createHttpError(400);
    const error599 = createHttpError(599);

    assert.strictEqual(error400.statusCode, 400);
    assert.strictEqual(error599.statusCode, 599);
  });

  test('should throw TypeError for status code below 400', () => {
    assert.throws(
      () => createHttpError(399),
      {
        name: 'TypeError',
        message: 'statusCode must be an integer between 400 and 599, got 399',
      },
    );
  });

  test('should throw TypeError for status code above 599', () => {
    assert.throws(
      () => createHttpError(600),
      {
        name: 'TypeError',
        message: 'statusCode must be an integer between 400 and 599, got 600',
      },
    );
  });

  test('should throw TypeError for non-integer status code', () => {
    assert.throws(
      () => createHttpError(404.5),
      {
        name: 'TypeError',
        message: 'statusCode must be an integer between 400 and 599, got 404.5',
      },
    );
  });

  test('should throw TypeError for non-numeric status code', () => {
    assert.throws(
      () => createHttpError('404' as any),
      TypeError,
    );
  });
});

describe('Convenience factory functions', () => {
  test('createBadRequest should create 400 error', () => {
    const error = createBadRequest('Invalid input');

    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(error.message, 'Invalid input');
  });

  test('createBadRequest should use default message', () => {
    const error = createBadRequest();

    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(error.message, 'Bad Request');
  });

  test('createUnauthorized should create 401 error', () => {
    const error = createUnauthorized('Authentication required');

    assert.strictEqual(error.statusCode, 401);
    assert.strictEqual(error.message, 'Authentication required');
  });

  test('createForbidden should create 403 error', () => {
    const error = createForbidden('Access denied');

    assert.strictEqual(error.statusCode, 403);
    assert.strictEqual(error.message, 'Access denied');
  });

  test('createNotFound should create 404 error', () => {
    const error = createNotFound('User not found');

    assert.strictEqual(error.statusCode, 404);
    assert.strictEqual(error.message, 'User not found');
  });

  test('createConflict should create 409 error', () => {
    const error = createConflict('Resource already exists');

    assert.strictEqual(error.statusCode, 409);
    assert.strictEqual(error.message, 'Resource already exists');
  });

  test('createInternalServerError should create 500 error', () => {
    const error = createInternalServerError('Something went wrong');

    assert.strictEqual(error.statusCode, 500);
    assert.strictEqual(error.message, 'Something went wrong');
  });

  test('createNotImplemented should create 501 error', () => {
    const error = createNotImplemented('Feature not available');

    assert.strictEqual(error.statusCode, 501);
    assert.strictEqual(error.message, 'Feature not available');
  });

  test('createServiceUnavailable should create 503 error', () => {
    const error = createServiceUnavailable('Service temporarily down');

    assert.strictEqual(error.statusCode, 503);
    assert.strictEqual(error.message, 'Service temporarily down');
  });
});

describe('Error handling in Express/Koa middleware (integration)', () => {
  test('should be catchable in try-catch blocks', () => {
    try {
      throw createNotFound('User not found');
    } catch (error) {
      assert.ok(error instanceof HttpError);
      assert.strictEqual((error as HttpError).statusCode, 404);
      assert.strictEqual((error as HttpError).message, 'User not found');
    }
  });

  test('should work with Promise rejection', async () => {
    await assert.rejects(
      async () => {
        throw createUnauthorized('Invalid token');
      },
      {
        name: 'HttpError',
        statusCode: 401,
        message: 'Invalid token',
      },
    );
  });

  test('should preserve error properties when re-thrown', () => {
    try {
      try { // eslint-disable-line
        throw createBadRequest('Invalid data');
      } catch (err) {
        throw err;
      }
    } catch (error) {
      assert.ok(error instanceof HttpError);
      assert.strictEqual((error as HttpError).statusCode, 400);
      assert.strictEqual((error as HttpError).message, 'Invalid data');
    }
  });
});
