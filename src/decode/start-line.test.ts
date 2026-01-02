import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { HttpDecodeError } from '../errors.js';
import { decodeRequestStartLine, decodeResponseStartLine } from './start-line.js';

describe('decodeRequestStartLine', () => {
  describe('正常情况', () => {
    it('应该正确解析标准的 GET 请求', () => {
      const result = decodeRequestStartLine('GET /api/users HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/users',
        raw: 'GET /api/users HTTP/1.1',
        version: 1.1,
      });
    });

    it('应该正确解析 POST 请求', () => {
      const result = decodeRequestStartLine('POST /api/users HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'POST',
        path: '/api/users',
        raw: 'POST /api/users HTTP/1.1',
        version: 1.1,
      });
    });

    it('应该正确解析根路径请求', () => {
      const result = decodeRequestStartLine('GET / HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/',
        raw: 'GET / HTTP/1.1',
        version: 1.1,
      });
    });

    it('应该正确解析带查询参数的路径', () => {
      const result = decodeRequestStartLine('GET /api/users?id=123&name=test HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/users?id=123&name=test',
        raw: 'GET /api/users?id=123&name=test HTTP/1.1',
        version: 1.1,
      });
    });

    it('应该正确解析星号路径 (OPTIONS)', () => {
      const result = decodeRequestStartLine('OPTIONS * HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'OPTIONS',
        path: '*',
        raw: 'OPTIONS * HTTP/1.1',
        version: 1.1,
      });
    });

    it('应该正确解析 HTTP/1.0 版本', () => {
      const result = decodeRequestStartLine('GET /index.html HTTP/1.0');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/index.html',
        raw: 'GET /index.html HTTP/1.0',
        version: 1.0,
      });
    });

    it('应该处理小写的 HTTP 方法', () => {
      const result = decodeRequestStartLine('get /api/test HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/test',
        raw: 'get /api/test HTTP/1.1',
        version: 1.1,
      });
    });

    it('应该处理混合大小写的 HTTP 版本', () => {
      const result = decodeRequestStartLine('GET /test http/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/test',
        raw: 'GET /test http/1.1',
        version: 1.1,
      });
    });

    it('应该处理多个空格分隔符', () => {
      const result = decodeRequestStartLine('GET  /api/users  HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/users',
        raw: 'GET  /api/users  HTTP/1.1',
        version: 1.1,
      });
    });

    it('应该处理首尾空格', () => {
      const result = decodeRequestStartLine('  GET /api/users HTTP/1.1  ');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/users',
        raw: '  GET /api/users HTTP/1.1  ',
        version: 1.1,
      });
    });

    it('应该正确解析各种 HTTP 方法', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];
      methods.forEach(method => {
        const result = decodeRequestStartLine(`${method} /test HTTP/1.1`);
        assert.strictEqual(result.method, method);
        assert.strictEqual(result.path, '/test');
        assert.strictEqual(result.version, 1.1);
        assert.strictEqual(result.raw, `${method} /test HTTP/1.1`);
      });
    });

    it('应该正确解析复杂的路径', () => {
      const result = decodeRequestStartLine('GET /api/v2/users/123/posts/456/comments HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/v2/users/123/posts/456/comments',
        raw: 'GET /api/v2/users/123/posts/456/comments HTTP/1.1',
        version: 1.1,
      });
    });

    it('应该正确解析带有特殊字符的路径', () => {
      const result = decodeRequestStartLine('GET /api/search?q=hello%20world&filter=name:test HTTP/1.1');
      assert.strictEqual(result.path, '/api/search?q=hello%20world&filter=name:test');
    });
  });

  describe('异常情况', () => {
    it('应该在输入为空字符串时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine(''),
        TypeError,
      );
    });

    it('应该在输入为 null 时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine(null as any), // eslint-disable-line
        TypeError,
      );
    });

    it('应该在输入为 undefined 时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine(undefined as any), // eslint-disable-line
        TypeError,
      );
    });

    it('应该在输入不是字符串时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine(123 as any), // eslint-disable-line
        TypeError,
      );
    });

    it('应该在缺少 HTTP 方法时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine('/api/users HTTP/1.1'),
        HttpDecodeError,
      );
    });

    it('应该在缺少路径时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine('GET HTTP/1.1'),
        HttpDecodeError,
      );
    });

    it('应该在缺少 HTTP 版本时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine('GET /api/users'),
        HttpDecodeError,
      );
    });

    it('应该在 HTTP 版本格式错误时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine('GET /api/users HTTP/2.0'),
        HttpDecodeError,
      );
    });

    it('路径不以 / 开头', () => {
      const result = decodeRequestStartLine('GET api/users HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: 'api/users',
        raw: 'GET api/users HTTP/1.1',
        version: 1.1,
      });
    });

    it('应该在路径包含空格时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine('GET /api/users test HTTP/1.1'),
        HttpDecodeError,
      );
    });

    it('应该在格式完全错误时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine('this is not a valid request line'),
        HttpDecodeError,
      );
    });

    it('应该在只有空格时抛出错误', () => {
      assert.throws(
        () => decodeRequestStartLine('   '),
        HttpDecodeError,
      );
    });
  });

  describe('边界情况', () => {
    it('应该处理只有一个字符的路径', () => {
      const result = decodeRequestStartLine('GET /a HTTP/1.1');
      assert.strictEqual(result.path, '/a');
    });

    it('应该处理非常长的路径', () => {
      const longPath = '/api/' + 'a'.repeat(1000);
      const result = decodeRequestStartLine(`GET ${longPath} HTTP/1.1`);
      assert.strictEqual(result.path, longPath);
    });

    it('应该处理自定义 HTTP 方法', () => {
      const result = decodeRequestStartLine('CUSTOMMETHOD /api/test HTTP/1.1');
      assert.strictEqual(result.method, 'CUSTOMMETHOD');
    });
  });

  describe('错误消息', () => {
    it('应该在错误消息中包含部分输入内容', () => {
      try {
        decodeRequestStartLine('invalid request line');
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error instanceof HttpDecodeError);
        assert.ok(error.message.includes('invalid request line'));
      }
    });

    it('应该截断过长的错误消息', () => {
      const longInput = 'a'.repeat(1000) + ' HTTP/1.1';
      try {
        decodeRequestStartLine(longInput);
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error instanceof HttpDecodeError);
        assert.ok(error.message.length < 200);
      }
    });
  });
});

describe('decodeResponseStartLine', () => {
  describe('Valid HTTP response lines', () => {
    it('should parse HTTP/1.1 200 OK', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 OK');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.statusText, 'OK');
    });

    it('should parse HTTP/1.0 404 Not Found', () => {
      const result = decodeResponseStartLine('HTTP/1.0 404 Not Found');
      assert.strictEqual(result.version, 1.0);
      assert.strictEqual(result.statusCode, 404);
      assert.strictEqual(result.statusText, 'Not Found');
    });

    it('should parse response line with extra whitespace', () => {
      const result = decodeResponseStartLine('  HTTP/1.1 200 OK  ');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.statusText, 'OK');
    });

    it('should parse response line without status message', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.statusText, 'OK'); // Default from http.STATUS_CODES
    });

    it('should parse response line with custom status message', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 Custom Message');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.statusText, 'Custom Message');
    });

    it('should handle case-insensitive HTTP version', () => {
      const result = decodeResponseStartLine('http/1.1 200 OK');
      assert.strictEqual(result.version, 1.1);
      assert.strictEqual(result.statusCode, 200);
    });
  });

  describe('Different status codes', () => {
    it('should parse 1xx informational status code', () => {
      const result = decodeResponseStartLine('HTTP/1.1 100 Continue');
      assert.strictEqual(result.statusCode, 100);
      assert.strictEqual(result.statusText, 'Continue');
    });

    it('should parse 3xx redirection status code', () => {
      const result = decodeResponseStartLine('HTTP/1.1 301 Moved Permanently');
      assert.strictEqual(result.statusCode, 301);
      assert.strictEqual(result.statusText, 'Moved Permanently');
    });

    it('should parse 5xx server error status code', () => {
      const result = decodeResponseStartLine('HTTP/1.1 500 Internal Server Error');
      assert.strictEqual(result.statusCode, 500);
      assert.strictEqual(result.statusText, 'Internal Server Error');
    });

    it('should parse maximum valid status code', () => {
      const result = decodeResponseStartLine('HTTP/1.1 599 Custom');
      assert.strictEqual(result.statusCode, 599);
    });

    it('should parse minimum valid status code', () => {
      const result = decodeResponseStartLine('HTTP/1.1 100 Continue');
      assert.strictEqual(result.statusCode, 100);
    });
  });

  describe('Status message handling', () => {
    it('should use default status message for unknown status code', () => {
      const result = decodeResponseStartLine('HTTP/1.1 599');
      assert.strictEqual(result.statusText, 'Unknown');
    });

    it('should trim status message whitespace', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200   OK   ');
      assert.strictEqual(result.statusText, 'OK');
    });

    it('should handle multi-word status messages', () => {
      const result = decodeResponseStartLine('HTTP/1.1 500 Internal Server Error');
      assert.strictEqual(result.statusText, 'Internal Server Error');
    });
  });

  describe('Invalid input - empty or null', () => {
    it('should throw error for empty string', () => {
      assert.throws(
        () => decodeResponseStartLine(''),
        {
          name: 'TypeError',
          message: 'Invalid input: response line must be a non-empty string',
        },
      );
    });

    it('should throw error for whitespace-only string', () => {
      assert.throws(
        () => decodeResponseStartLine('   '),
        {
          name: 'HttpDecodeError',
          message: /Failed to parse HTTP response line/,
        },
      );
    });

    it('should throw error for null', () => {
      assert.throws(
        () => decodeResponseStartLine(null),
        {
          name: 'TypeError',
          message: /Invalid input: response line must be a non-empty string/,
        },
      );
    });

    it('should throw error for undefined', () => {
      assert.throws(
        () => decodeResponseStartLine(undefined),
        {
          name: 'TypeError',
          message: /Invalid input: response line must be a non-empty string/,
        },
      );
    });
  });

  describe('Invalid HTTP response format', () => {
    it('should throw error for invalid format', () => {
      assert.throws(
        () => decodeResponseStartLine('Invalid Response Line'),
        {
          name: 'HttpDecodeError',
          message: /Failed to parse HTTP response line/,
        },
      );
    });

    it('should throw error for missing status code', () => {
      assert.throws(
        () => decodeResponseStartLine('HTTP/1.1'),
        {
          name: 'HttpDecodeError',
          message: /Failed to parse HTTP response line/,
        },
      );
    });

    it('should throw error for invalid HTTP version format', () => {
      assert.throws(
        () => decodeResponseStartLine('HTTP/2.0 200 OK'),
        {
          name: 'HttpDecodeError',
          message: /Failed to parse HTTP response line/,
        },
      );
    });

    it('should truncate long invalid input in error message', () => {
      const longString = 'x'.repeat(100);
      try {
        decodeResponseStartLine(longString);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.match(err.message, /\.\.\./);
      }
    });
  });

  describe('Invalid status codes', () => {
    it('should throw error for status code below minimum', () => {
      assert.throws(
        () => decodeResponseStartLine('HTTP/1.1 99 Below Min'),
        {
          name: 'HttpDecodeError',
        },
      );
    });

    it('should throw error for status code above maximum', () => {
      assert.throws(
        () => decodeResponseStartLine('HTTP/1.1 600 Above Max'),
        {
          name: 'HttpDecodeError',
          message: /Invalid HTTP status code.*must be 100-599/,
        },
      );
    });

    it('should throw error for non-numeric status code', () => {
      assert.throws(
        () => decodeResponseStartLine('HTTP/1.1 ABC Invalid'),
        {
          name: 'HttpDecodeError',
        },
      );
    });

    it('should throw error for floating point status code', () => {
      assert.throws(
        () => decodeResponseStartLine('HTTP/1.1 200.5 Invalid'),
        {
          name: 'HttpDecodeError',
        },
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle status code with leading zeros', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 OK');
      assert.strictEqual(result.statusCode, 200);
    });

    it('should handle mixed case in status message', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 Ok MiXeD CaSe');
      assert.strictEqual(result.statusText, 'Ok MiXeD CaSe');
    });

    it('should parse HTTP/1.0 correctly', () => {
      const result = decodeResponseStartLine('HTTP/1.0 200 OK');
      assert.strictEqual(result.version, 1.0);
    });

    it('should parse HTTP/1.1 correctly', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 OK');
      assert.strictEqual(result.version, 1.1);
    });
  });
});
