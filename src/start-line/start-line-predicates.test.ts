import * as assert from 'node:assert';
import { describe,test } from 'node:test';

import {
  bodyNotAllowed,
  isHttpMethod,
  isRequestStartLine,
  isResponseStartLine,
} from './start-line-predicates.js';

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

describe('HTTP Utils Tests', () => {
  describe('isRequestStartLine', () => {
    test('should return true for request start line', () => {
      const requestLine = { method: 'GET', path: '/', version: 'HTTP/1.1' };
      assert.strictEqual(isRequestStartLine(requestLine), true);
    });

    test('should return false for response start line', () => {
      const responseLine = { statusCode: 200, statusMessage: 'OK', version: 'HTTP/1.1' };
      assert.strictEqual(isRequestStartLine(responseLine), false);
    });

    test('should handle various HTTP methods', () => {
      const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      methods.forEach(method => {
        const line = { method, path: '/api', version: 'HTTP/1.1' };
        assert.strictEqual(isRequestStartLine(line), true);
      });
    });
  });

  describe('isResponseStartLine', () => {
    test('should return true for response start line', () => {
      const responseLine = { statusCode: 404, statusMessage: 'Not Found', version: 'HTTP/1.1' };
      assert.strictEqual(isResponseStartLine(responseLine), true);
    });

    test('should return false for request start line', () => {
      const requestLine = { method: 'POST', path: '/data', version: 'HTTP/1.1' };
      assert.strictEqual(isResponseStartLine(requestLine), false);
    });

    test('should handle various status codes', () => {
      const codes = [200, 201, 301, 404, 500];
      codes.forEach(statusCode => {
        const line = { statusCode, statusMessage: 'Message', version: 'HTTP/1.1' };
        assert.strictEqual(isResponseStartLine(line), true);
      });
    });
  });

  describe('isHttpMethod', () => {
    test('should return true for valid HTTP methods', () => {
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT'];
      validMethods.forEach(method => {
        assert.strictEqual(isHttpMethod(method), true, `${method} should be valid`);
      });
    });

    test('should return false for invalid HTTP methods', () => {
      const invalidMethods = ['INVALID', 'FETCH', 'UPDATE', 'get', 'post'];
      invalidMethods.forEach(method => {
        assert.strictEqual(isHttpMethod(method), false, `${method} should be invalid`);
      });
    });

    test('should be case-sensitive', () => {
      assert.strictEqual(isHttpMethod('get'), false);
      assert.strictEqual(isHttpMethod('GET'), true);
    });
  });

  describe('bodyNotAllowed', () => {
    describe('Request methods without body', () => {
      test('should return true for GET requests', () => {
        const line = { method: 'GET', path: '/', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });

      test('should return true for HEAD requests', () => {
        const line = { method: 'HEAD', path: '/', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });

      test('should return true for DELETE requests', () => {
        const line = { method: 'DELETE', path: '/resource', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });

      test('should return true for CONNECT requests', () => {
        const line = { method: 'CONNECT', path: '/tunnel', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });

      test('should return true for TRACE requests', () => {
        const line = { method: 'TRACE', path: '/', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });

      test('should return true for OPTIONS requests', () => {
        const line = { method: 'OPTIONS', path: '/', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });

      test('should handle case-insensitive method names', () => {
        const line = { method: 'get', path: '/', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });
    });

    describe('Request methods with body allowed', () => {
      test('should return false for POST requests', () => {
        const line = { method: 'POST', path: '/api', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), false);
      });

      test('should return false for PUT requests', () => {
        const line = { method: 'PUT', path: '/api', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), false);
      });

      test('should return false for PATCH requests', () => {
        const line = { method: 'PATCH', path: '/api', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), false);
      });
    });

    describe('Response status codes without body', () => {
      test('should return true for 1xx informational responses', () => {
        [100, 101, 102, 103].forEach(statusCode => {
          const line = { statusCode, statusMessage: 'Info', version: 'HTTP/1.1' };
          assert.strictEqual(bodyNotAllowed(line), true, `Status ${statusCode} should not allow body`);
        });
      });

      test('should return true for any 1xx status code in range', () => {
        for (let code = 100; code < 200; code++) {
          const line = { statusCode: code, statusMessage: 'Info', version: 'HTTP/1.1' };
          assert.strictEqual(bodyNotAllowed(line), true, `Status ${code} should not allow body`);
        }
      });

      test('should return true for 204 No Content', () => {
        const line = { statusCode: 204, statusMessage: 'No Content', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });

      test('should return true for 205 Reset Content', () => {
        const line = { statusCode: 205, statusMessage: 'Reset Content', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });

      test('should return true for 304 Not Modified', () => {
        const line = { statusCode: 304, statusMessage: 'Not Modified', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), true);
      });
    });

    describe('Response status codes with body allowed', () => {
      test('should return false for 2xx success responses', () => {
        [200, 201, 202, 203, 206].forEach(statusCode => {
          const line = { statusCode, statusMessage: 'Success', version: 'HTTP/1.1' };
          assert.strictEqual(bodyNotAllowed(line), false, `Status ${statusCode} should allow body`);
        });
      });

      test('should return false for 3xx redirection responses', () => {
        [300, 301, 302, 303, 307, 308].forEach(statusCode => {
          const line = { statusCode, statusMessage: 'Redirect', version: 'HTTP/1.1' };
          assert.strictEqual(bodyNotAllowed(line), false, `Status ${statusCode} should allow body`);
        });
      });

      test('should return false for 4xx client error responses', () => {
        [400, 401, 403, 404, 405].forEach(statusCode => {
          const line = { statusCode, statusMessage: 'Error', version: 'HTTP/1.1' };
          assert.strictEqual(bodyNotAllowed(line), false, `Status ${statusCode} should allow body`);
        });
      });

      test('should return false for 5xx server error responses', () => {
        [500, 501, 502, 503].forEach(statusCode => {
          const line = { statusCode, statusMessage: 'Error', version: 'HTTP/1.1' };
          assert.strictEqual(bodyNotAllowed(line), false, `Status ${statusCode} should allow body`);
        });
      });
    });

    describe('Edge cases', () => {
      test('should handle missing method in request line', () => {
        const line = { path: '/', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), false);
      });

      test('should handle null statusCode in response line', () => {
        const line = { statusCode: null, statusMessage: 'Unknown', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), false);
      });

      test('should handle undefined statusCode in response line', () => {
        const line = { statusMessage: 'Unknown', version: 'HTTP/1.1' };
        assert.strictEqual(bodyNotAllowed(line), false);
      });
    });
  });
});
