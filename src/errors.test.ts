import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  DecodeHttpError,
  EncodeHttpError,
  HttpUrlParseError,
} from './errors';

describe('Custom Error Classes', () => {
  describe('HttpUrlParseError', () => {
    it('should create error with default message', () => {
      const error = new HttpUrlParseError();

      assert.strictEqual(error.message, 'Http Url Parse Error');
      assert.strictEqual(error.code, 'ERR_HTTP_URL_PARSE');
      assert.strictEqual(error.name, 'HttpUrlParseError');
      assert.ok(error instanceof Error);
      assert.ok(error instanceof HttpUrlParseError);
    });

    it('should create error with custom message', () => {
      const customMessage = 'Invalid URL format';
      const error = new HttpUrlParseError(customMessage);

      assert.strictEqual(error.message, customMessage);
      assert.strictEqual(error.code, 'ERR_HTTP_URL_PARSE');
    });

    it('should have proper stack trace', () => {
      const error = new HttpUrlParseError();

      assert.ok(error.stack);
      assert.ok(error.stack?.includes('HttpUrlParseError'));
    });

    it('should be throwable and catchable', () => {
      assert.throws(
        () => {
          throw new HttpUrlParseError('Test error');
        },
        (error: Error) => {
          return (
            error instanceof HttpUrlParseError &&
            error.message === 'Test error' &&
            error.code === 'ERR_HTTP_URL_PARSE'
          );
        },
      );
    });
  });

  describe('EncodeHttpError', () => {
    it('should create error with default message', () => {
      const error = new EncodeHttpError();

      assert.strictEqual(error.message, 'Encode Http Error');
      assert.strictEqual(error.code, 'ERR_ENCODE_HTTP');
      assert.strictEqual(error.name, 'EncodeHttpError');
      assert.ok(error instanceof Error);
      assert.ok(error instanceof EncodeHttpError);
    });

    it('should create error with custom message', () => {
      const customMessage = 'Failed to encode request body';
      const error = new EncodeHttpError(customMessage);

      assert.strictEqual(error.message, customMessage);
      assert.strictEqual(error.code, 'ERR_ENCODE_HTTP');
    });

    it('should have proper stack trace', () => {
      const error = new EncodeHttpError();

      assert.ok(error.stack);
      assert.ok(error.stack?.includes('EncodeHttpError'));
    });

    it('should be distinguishable from other error types', () => {
      const encodeError = new EncodeHttpError();
      const parseError = new HttpUrlParseError();

      assert.ok(encodeError instanceof EncodeHttpError);
      assert.ok(!(encodeError instanceof HttpUrlParseError));
      assert.ok(!(parseError instanceof EncodeHttpError));
    });
  });

  describe('DecodeHttpError', () => {
    it('should create error with default message', () => {
      const error = new DecodeHttpError();

      assert.strictEqual(error.message, 'Decode Http Error');
      assert.strictEqual(error.code, 'ERR_DECODE_HTTP');
      assert.strictEqual(error.name, 'DecodeHttpError');
      assert.ok(error instanceof Error);
      assert.ok(error instanceof DecodeHttpError);
    });

    it('should create error with custom message', () => {
      const customMessage = 'Invalid response format';
      const error = new DecodeHttpError(customMessage);

      assert.strictEqual(error.message, customMessage);
      assert.strictEqual(error.code, 'ERR_DECODE_HTTP');
    });

    it('should have proper stack trace', () => {
      const error = new DecodeHttpError();

      assert.ok(error.stack);
      assert.ok(error.stack?.includes('DecodeHttpError'));
    });
  });

  describe('Error inheritance and behavior', () => {
    it('all custom errors should be instances of Error', () => {
      const errors = [
        new HttpUrlParseError(),
        new EncodeHttpError(),
        new DecodeHttpError(),
      ];

      errors.forEach((error) => {
        assert.ok(error instanceof Error);
      });
    });

    it('should maintain unique error codes', () => {
      const parseError = new HttpUrlParseError();
      const encodeError = new EncodeHttpError();
      const decodeError = new DecodeHttpError();

      const codes = [parseError.code, encodeError.code, decodeError.code];
      const uniqueCodes = new Set(codes);

      assert.strictEqual(codes.length, uniqueCodes.size);
    });

    it('should handle error serialization', () => {
      const error = new HttpUrlParseError('Test error');
      const serialized = JSON.stringify(error);

      assert.ok(serialized);
    });

    it('should work with try-catch blocks', () => {
      function throwError(): void {
        throw new EncodeHttpError('Encoding failed');
      }

      try {
        throwError();
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof EncodeHttpError);
        assert.strictEqual((error as EncodeHttpError).code, 'ERR_ENCODE_HTTP');
      }
    });

    it('should preserve error properties when re-thrown', () => {
      const originalError = new DecodeHttpError('Original message');

      try {
        throw originalError;
      } catch (error) {
        assert.strictEqual(error, originalError);
        assert.strictEqual((error as DecodeHttpError).message, 'Original message');
        assert.strictEqual((error as DecodeHttpError).code, 'ERR_DECODE_HTTP');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string as message', () => {
      const error = new HttpUrlParseError('');

      assert.strictEqual(error.message, '');
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new EncodeHttpError(longMessage);

      assert.strictEqual(error.message, longMessage);
      assert.strictEqual(error.message.length, 10000);
    });

    it('should handle special characters in message', () => {
      const specialMessage = '特殊字符 🚀 \n\t\r"\'\\';
      const error = new DecodeHttpError(specialMessage);

      assert.strictEqual(error.message, specialMessage);
    });
  });
});
