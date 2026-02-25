import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  DecodeErrors,
  ERROR_CATEGORY,
  ERROR_DISPOSITION,
  HttpDecodeError,
  HttpDecodeErrorCategory,
  HttpDecodeErrorCode,
  HttpErrorDisposition,
} from './errors.js';

describe('HttpDecodeError', () => {
  describe('Constructor', () => {
    it('should create error with required fields', () => {
      const error = new HttpDecodeError({
        code: HttpDecodeErrorCode.INVALID_SYNTAX,
        message: 'Test error',
      });

      assert.strictEqual(error.code, HttpDecodeErrorCode.INVALID_SYNTAX);
      assert.strictEqual(error.message, 'Test error');
      assert.strictEqual(error.category, HttpDecodeErrorCategory.SYNTAX);
      assert.strictEqual(error.fatal, true);
      assert.strictEqual(error.name, 'HttpDecodeError');
    });

    it('should use code as message when message is not provided', () => {
      const error = new HttpDecodeError({
        code: HttpDecodeErrorCode.INVALID_SYNTAX,
        message: '',
      });

      assert.strictEqual(error.message, '');
    });

    it('should respect custom fatal flag', () => {
      const error = new HttpDecodeError({
        code: HttpDecodeErrorCode.INVALID_SYNTAX,
        message: 'Test',
        fatal: false,
      });

      assert.strictEqual(error.fatal, false);
    });

    it('should store cause when provided', () => {
      const cause = new Error('Original error');
      const error = new HttpDecodeError({
        code: HttpDecodeErrorCode.INVALID_SYNTAX,
        message: 'Test',
        cause,
      });

      assert.strictEqual(error.cause, cause);
    });

    it('should use default fatal value based on category', () => {
      const syntaxError = new HttpDecodeError({
        code: HttpDecodeErrorCode.INVALID_SYNTAX,
        message: 'Test',
      });
      assert.strictEqual(syntaxError.fatal, true);

      const sizeError = new HttpDecodeError({
        code: HttpDecodeErrorCode.MESSAGE_TOO_LARGE,
        message: 'Test',
      });
      assert.strictEqual(sizeError.fatal, true);
    });
  });

  describe('ERROR_CATEGORY mapping', () => {
    it('should map SYNTAX errors correctly', () => {
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.INVALID_SYNTAX],
        HttpDecodeErrorCategory.SYNTAX,
      );
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.INVALID_LINE_ENDING],
        HttpDecodeErrorCategory.SYNTAX,
      );
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.BARE_CR],
        HttpDecodeErrorCategory.SYNTAX,
      );
    });

    it('should map SIZE_LIMIT errors correctly', () => {
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.MESSAGE_TOO_LARGE],
        HttpDecodeErrorCategory.SIZE_LIMIT,
      );
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.LINE_TOO_LARGE],
        HttpDecodeErrorCategory.SIZE_LIMIT,
      );
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.HEADER_TOO_LARGE],
        HttpDecodeErrorCategory.SIZE_LIMIT,
      );
    });

    it('should map UNSUPPORTED errors correctly', () => {
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.UNSUPPORTED_FEATURE],
        HttpDecodeErrorCategory.UNSUPPORTED,
      );
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.UNSUPPORTED_HTTP_VERSION],
        HttpDecodeErrorCategory.UNSUPPORTED,
      );
    });

    it('should map STATE errors correctly', () => {
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.PARSE_NO_PROGRESS],
        HttpDecodeErrorCategory.STATE,
      );
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.TOO_MANY_STATE_TRANSITIONS],
        HttpDecodeErrorCategory.STATE,
      );
    });

    it('should map RESOURCE errors correctly', () => {
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.PARSE_TIMEOUT],
        HttpDecodeErrorCategory.RESOURCE,
      );
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.BUFFER_LIMIT_EXCEEDED],
        HttpDecodeErrorCategory.RESOURCE,
      );
    });

    it('should map INTERNAL errors correctly', () => {
      assert.strictEqual(
        ERROR_CATEGORY[HttpDecodeErrorCode.INTERNAL_ERROR],
        HttpDecodeErrorCategory.INTERNAL,
      );
    });

    it('should have mapping for all error codes', () => {
      const allCodes = Object.values(HttpDecodeErrorCode);
      const mappedCodes = Object.keys(ERROR_CATEGORY);

      assert.strictEqual(allCodes.length, mappedCodes.length);
      allCodes.forEach(code => {
        assert.ok(code in ERROR_CATEGORY, `Missing category mapping for ${code}`);
      });
    });
  });

  describe('ERROR_DISPOSITION mapping', () => {
    it('should map REJECT_MESSAGE disposition correctly', () => {
      assert.strictEqual(
        ERROR_DISPOSITION[HttpDecodeErrorCode.INVALID_SYNTAX],
        HttpErrorDisposition.REJECT_MESSAGE,
      );
      assert.strictEqual(
        ERROR_DISPOSITION[HttpDecodeErrorCode.HEADER_TOO_LARGE],
        HttpErrorDisposition.REJECT_MESSAGE,
      );
    });

    it('should map CLOSE_CONNECTION disposition correctly', () => {
      assert.strictEqual(
        ERROR_DISPOSITION[HttpDecodeErrorCode.PARSE_TIMEOUT],
        HttpErrorDisposition.CLOSE_CONNECTION,
      );
      assert.strictEqual(
        ERROR_DISPOSITION[HttpDecodeErrorCode.BODY_LENGTH_MISMATCH],
        HttpErrorDisposition.CLOSE_CONNECTION,
      );
      assert.strictEqual(
        ERROR_DISPOSITION[HttpDecodeErrorCode.INTERNAL_ERROR],
        HttpErrorDisposition.CLOSE_CONNECTION,
      );
    });

    it('should close connection for chunked encoding errors', () => {
      assert.strictEqual(
        ERROR_DISPOSITION[HttpDecodeErrorCode.INVALID_CHUNKED_ENCODING],
        HttpErrorDisposition.CLOSE_CONNECTION,
      );
      assert.strictEqual(
        ERROR_DISPOSITION[HttpDecodeErrorCode.INVALID_CHUNK_SIZE],
        HttpErrorDisposition.CLOSE_CONNECTION,
      );
    });

    it('should close connection for state machine errors', () => {
      assert.strictEqual(
        ERROR_DISPOSITION[HttpDecodeErrorCode.TOO_MANY_STATE_TRANSITIONS],
        HttpErrorDisposition.CLOSE_CONNECTION,
      );
      assert.strictEqual(
        ERROR_DISPOSITION[HttpDecodeErrorCode.REPEATING_STATE_DETECTED],
        HttpErrorDisposition.CLOSE_CONNECTION,
      );
    });

    it('should have disposition for all error codes', () => {
      const allCodes = Object.values(HttpDecodeErrorCode);
      const mappedCodes = Object.keys(ERROR_DISPOSITION);

      assert.strictEqual(allCodes.length, mappedCodes.length);
      allCodes.forEach(code => {
        assert.ok(code in ERROR_DISPOSITION, `Missing disposition mapping for ${code}`);
      });
    });
  });

  describe('DecodeErrors helpers', () => {
    it('invalidLineEnding should create correct error', () => {
      const error = DecodeErrors.invalidLineEnding();

      assert.strictEqual(error.code, HttpDecodeErrorCode.INVALID_LINE_ENDING);
      assert.strictEqual(error.message, 'Invalid CRLF sequence');
      assert.strictEqual(error.category, HttpDecodeErrorCategory.SYNTAX);
    });

    it('invalidLineEnding should include cause', () => {
      const cause = new Error('Test cause');
      const error = DecodeErrors.invalidLineEnding(cause);

      assert.strictEqual(error.cause, cause);
    });

    it('lineTooLarge should create correct error', () => {
      const error = DecodeErrors.lineTooLarge(1024);

      assert.strictEqual(error.code, HttpDecodeErrorCode.LINE_TOO_LARGE);
      assert.strictEqual(error.message, 'Line exceeds limit (1024 bytes)');
      assert.strictEqual(error.category, HttpDecodeErrorCategory.SIZE_LIMIT);
    });

    it('unsupportedHttpVersion should create correct error', () => {
      const error = DecodeErrors.unsupportedHttpVersion('HTTP/0.9');

      assert.strictEqual(error.code, HttpDecodeErrorCode.UNSUPPORTED_HTTP_VERSION);
      assert.strictEqual(error.message, 'Unsupported HTTP version: HTTP/0.9');
      assert.strictEqual(error.category, HttpDecodeErrorCategory.UNSUPPORTED);
    });

    it('invalidSyntax should create error with details', () => {
      const error = DecodeErrors.invalidSyntax('missing colon');

      assert.strictEqual(error.code, HttpDecodeErrorCode.INVALID_SYNTAX);
      assert.strictEqual(error.message, 'Invalid syntax: missing colon');
    });

    it('invalidSyntax should create error without details', () => {
      const error = DecodeErrors.invalidSyntax();

      assert.strictEqual(error.code, HttpDecodeErrorCode.INVALID_SYNTAX);
      assert.strictEqual(error.message, 'Invalid syntax');
    });

    it('bodyLengthMismatch should create correct error', () => {
      const error = DecodeErrors.bodyLengthMismatch(100, 50);

      assert.strictEqual(error.code, HttpDecodeErrorCode.BODY_LENGTH_MISMATCH);
      assert.strictEqual(error.message, 'Body length mismatch: expected 100, got 50');
      assert.strictEqual(error.category, HttpDecodeErrorCategory.SYNTAX);
    });

    it('headerTooLarge should create correct error', () => {
      const error = DecodeErrors.headerTooLarge(8192);

      assert.strictEqual(error.code, HttpDecodeErrorCode.HEADER_TOO_LARGE);
      assert.strictEqual(error.message, 'Header exceeds limit (8192 bytes)');
      assert.strictEqual(error.category, HttpDecodeErrorCategory.SIZE_LIMIT);
    });

    it('internalError should create correct error', () => {
      const error = DecodeErrors.internalError('unexpected state');

      assert.strictEqual(error.code, HttpDecodeErrorCode.INTERNAL_ERROR);
      assert.strictEqual(error.message, 'Internal error: unexpected state');
      assert.strictEqual(error.category, HttpDecodeErrorCategory.INTERNAL);
    });

    it('internalError should include cause', () => {
      const cause = new Error('Stack overflow');
      const error = DecodeErrors.internalError('parser failure', cause);

      assert.strictEqual(error.cause, cause);
      assert.strictEqual(error.message, 'Internal error: parser failure');
    });
  });

  describe('Error inheritance', () => {
    it('should be instance of Error', () => {
      const error = new HttpDecodeError({
        code: HttpDecodeErrorCode.INVALID_SYNTAX,
        message: 'Test',
      });

      assert.ok(error instanceof Error);
      assert.ok(error instanceof HttpDecodeError);
    });

    it('should have correct stack trace', () => {
      const error = new HttpDecodeError({
        code: HttpDecodeErrorCode.INVALID_SYNTAX,
        message: 'Test',
      });

      assert.ok(error.stack);
      assert.ok(error.stack.includes('HttpDecodeError'));
    });
  });
});
