import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import parseResponseLine from './parseResponseLine.js';

describe('parseResponseLine', () => {
  describe('Valid HTTP response lines', () => {
    it('should parse HTTP/1.1 200 OK', () => {
      const result = parseResponseLine('HTTP/1.1 200 OK');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.statusMessage, 'OK');
    });

    it('should parse HTTP/1.0 404 Not Found', () => {
      const result = parseResponseLine('HTTP/1.0 404 Not Found');
      assert.strictEqual(result.version, 1.0);
      assert.strictEqual(result.statusCode, 404);
      assert.strictEqual(result.statusMessage, 'Not Found');
    });

    it('should parse response line with extra whitespace', () => {
      const result = parseResponseLine('  HTTP/1.1 200 OK  ');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.statusMessage, 'OK');
    });

    it('should parse response line without status message', () => {
      const result = parseResponseLine('HTTP/1.1 200');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.statusMessage, 'OK'); // Default from http.STATUS_CODES
    });

    it('should parse response line with custom status message', () => {
      const result = parseResponseLine('HTTP/1.1 200 Custom Message');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.statusMessage, 'Custom Message');
    });

    it('should handle case-insensitive HTTP version', () => {
      const result = parseResponseLine('http/1.1 200 OK');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
    });
  });

  describe('Different status codes', () => {
    it('should parse 1xx informational status code', () => {
      const result = parseResponseLine('HTTP/1.1 100 Continue');
      assert.strictEqual(result.statusCode, 100);
      assert.strictEqual(result.statusMessage, 'Continue');
    });

    it('should parse 3xx redirection status code', () => {
      const result = parseResponseLine('HTTP/1.1 301 Moved Permanently');
      assert.strictEqual(result.statusCode, 301);
      assert.strictEqual(result.statusMessage, 'Moved Permanently');
    });

    it('should parse 5xx server error status code', () => {
      const result = parseResponseLine('HTTP/1.1 500 Internal Server Error');
      assert.strictEqual(result.statusCode, 500);
      assert.strictEqual(result.statusMessage, 'Internal Server Error');
    });

    it('should parse maximum valid status code', () => {
      const result = parseResponseLine('HTTP/1.1 599 Custom');
      assert.strictEqual(result.statusCode, 599);
    });

    it('should parse minimum valid status code', () => {
      const result = parseResponseLine('HTTP/1.1 100 Continue');
      assert.strictEqual(result.statusCode, 100);
    });
  });

  describe('Status message handling', () => {
    it('should use default status message for unknown status code', () => {
      const result = parseResponseLine('HTTP/1.1 599');
      assert.strictEqual(result.statusMessage, 'Unknown');
    });

    it('should trim status message whitespace', () => {
      const result = parseResponseLine('HTTP/1.1 200   OK   ');
      assert.strictEqual(result.statusMessage, 'OK');
    });

    it('should handle multi-word status messages', () => {
      const result = parseResponseLine('HTTP/1.1 500 Internal Server Error');
      assert.strictEqual(result.statusMessage, 'Internal Server Error');
    });
  });

  describe('Invalid input - empty or null', () => {
    it('should throw error for empty string', () => {
      assert.throws(
        () => parseResponseLine(''),
        {
          name: 'DecodeHttpError',
          message: /Invalid input: response line must be a non-empty string/,
        },
      );
    });

    it('should throw error for whitespace-only string', () => {
      assert.throws(
        () => parseResponseLine('   '),
        {
          name: 'DecodeHttpError',
          message: /Invalid input: response line must be a non-empty string/,
        },
      );
    });

    it('should throw error for null', () => {
      assert.throws(
        () => parseResponseLine(null),
        {
          name: 'DecodeHttpError',
          message: /Invalid input: response line must be a non-empty string/,
        },
      );
    });

    it('should throw error for undefined', () => {
      assert.throws(
        () => parseResponseLine(undefined),
        {
          name: 'DecodeHttpError',
          message: /Invalid input: response line must be a non-empty string/,
        },
      );
    });
  });

  describe('Invalid HTTP response format', () => {
    it('should throw error for invalid format', () => {
      assert.throws(
        () => parseResponseLine('Invalid Response Line'),
        {
          name: 'DecodeHttpError',
          message: /Failed to parse HTTP response line/,
        },
      );
    });

    it('should throw error for missing status code', () => {
      assert.throws(
        () => parseResponseLine('HTTP/1.1'),
        {
          name: 'DecodeHttpError',
          message: /Failed to parse HTTP response line/,
        },
      );
    });

    it('should throw error for invalid HTTP version format', () => {
      assert.throws(
        () => parseResponseLine('HTTP/2.0 200 OK'),
        {
          name: 'DecodeHttpError',
          message: /Failed to parse HTTP response line/,
        },
      );
    });

    it('should truncate long invalid input in error message', () => {
      const longString = 'x'.repeat(100);
      try {
        parseResponseLine(longString);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.match(err.message, /\.\.\./);
      }
    });
  });

  describe('Invalid status codes', () => {
    it('should throw error for status code below minimum', () => {
      assert.throws(
        () => parseResponseLine('HTTP/1.1 99 Below Min'),
        {
          name: 'DecodeHttpError',
        },
      );
    });

    it('should throw error for status code above maximum', () => {
      assert.throws(
        () => parseResponseLine('HTTP/1.1 600 Above Max'),
        {
          name: 'DecodeHttpError',
          message: /Invalid HTTP status code.*must be 100-599/,
        },
      );
    });

    it('should throw error for non-numeric status code', () => {
      assert.throws(
        () => parseResponseLine('HTTP/1.1 ABC Invalid'),
        {
          name: 'DecodeHttpError',
        },
      );
    });

    it('should throw error for floating point status code', () => {
      assert.throws(
        () => parseResponseLine('HTTP/1.1 200.5 Invalid'),
        {
          name: 'DecodeHttpError',
        },
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle status code with leading zeros', () => {
      const result = parseResponseLine('HTTP/1.1 200 OK');
      assert.strictEqual(result.statusCode, 200);
    });

    it('should handle mixed case in status message', () => {
      const result = parseResponseLine('HTTP/1.1 200 Ok MiXeD CaSe');
      assert.strictEqual(result.statusMessage, 'Ok MiXeD CaSe');
    });

    it('should parse HTTP/1.0 correctly', () => {
      const result = parseResponseLine('HTTP/1.0 200 OK');
      assert.strictEqual(result.version, 1.0);
    });

    it('should parse HTTP/1.1 correctly', () => {
      const result = parseResponseLine('HTTP/1.1 200 OK');
      assert.strictEqual(result.version, 1.1);
    });
  });
});
