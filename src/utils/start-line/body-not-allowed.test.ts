import * as assert from 'node:assert';
import { describe,test } from 'node:test';

import { bodyNotAllowed } from './body-not-allowed.js';

describe('bodyNotAllowed', () => {
  describe('Request Start Line - Bodyless Methods', () => {
    test('should return true for GET method', () => {
      const startLine = { method: 'GET', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for HEAD method', () => {
      const startLine = { method: 'HEAD', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for DELETE method', () => {
      const startLine = { method: 'DELETE', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for CONNECT method', () => {
      const startLine = { method: 'CONNECT', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for TRACE method', () => {
      const startLine = { method: 'TRACE', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for OPTIONS method', () => {
      const startLine = { method: 'OPTIONS', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should handle lowercase method names', () => {
      const startLine = { method: 'get', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should handle mixed case method names', () => {
      const startLine = { method: 'GeT', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });
  });

  describe('Request Start Line - Methods with Body', () => {
    test('should return false for POST method', () => {
      const startLine = { method: 'POST', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });

    test('should return false for PUT method', () => {
      const startLine = { method: 'PUT', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });

    test('should return false for PATCH method', () => {
      const startLine = { method: 'PATCH', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });
  });

  describe('Response Start Line - Bodyless Status Codes', () => {
    test('should return true for 100 Continue', () => {
      const startLine = { statusCode: 100, statusMessage: 'Continue', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for 101 Switching Protocols', () => {
      const startLine = { statusCode: 101, statusMessage: 'Switching Protocols', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for 102 Processing', () => {
      const startLine = { statusCode: 102, statusMessage: 'Processing', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for 103 Early Hints', () => {
      const startLine = { statusCode: 103, statusMessage: 'Early Hints', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for 204 No Content', () => {
      const startLine = { statusCode: 204, statusMessage: 'No Content', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for 205 Reset Content', () => {
      const startLine = { statusCode: 205, statusMessage: 'Reset Content', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for 304 Not Modified', () => {
      const startLine = { statusCode: 304, statusMessage: 'Not Modified', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });
  });

  describe('Response Start Line - 1xx Status Code Range', () => {
    test('should return true for status code 104 in 1xx range', () => {
      const startLine = { statusCode: 104, statusMessage: 'Custom', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for status code 150 in 1xx range', () => {
      const startLine = { statusCode: 150, statusMessage: 'Custom', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });

    test('should return true for status code 199 in 1xx range', () => {
      const startLine = { statusCode: 199, statusMessage: 'Custom', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), true);
    });
  });

  describe('Response Start Line - Status Codes with Body', () => {
    test('should return false for 200 OK', () => {
      const startLine = { statusCode: 200, statusMessage: 'OK', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });

    test('should return false for 201 Created', () => {
      const startLine = { statusCode: 201, statusMessage: 'Created', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });

    test('should return false for 400 Bad Request', () => {
      const startLine = { statusCode: 400, statusMessage: 'Bad Request', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });

    test('should return false for 404 Not Found', () => {
      const startLine = { statusCode: 404, statusMessage: 'Not Found', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });

    test('should return false for 500 Internal Server Error', () => {
      const startLine = { statusCode: 500, statusMessage: 'Internal Server Error', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });
  });

  describe('Edge Cases', () => {
    test('should return false when method is undefined', () => {
      const startLine = { method: undefined, uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });

    test('should return false when statusCode is null', () => {
      const startLine = { statusCode: null, statusMessage: 'Unknown', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });

    test('should return false when statusCode is undefined', () => {
      const startLine = { statusCode: undefined, statusMessage: 'Unknown', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });

    test('should return false for empty method string', () => {
      const startLine = { method: '', uri: '/test', version: '1.1' };
      assert.strictEqual(bodyNotAllowed(startLine), false);
    });
  });
});
