import * as assert from 'node:assert';
import { describe, it,test } from 'node:test';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { DEFAULT_START_LINE_LIMITS } from '../specs.js';
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

describe('decodeRequestStartLine', () => {
  describe('成功解析', () => {
    test('应该正确解析标准的 GET 请求', () => {
      const result = decodeRequestStartLine('GET /api/users HTTP/1.1');
      assert.equal(result.method, 'GET');
      assert.equal(result.path, '/api/users');
      assert.equal(result.version, 1.1);
      assert.equal(result.raw, 'GET /api/users HTTP/1.1');
    });

    test('应该正确解析 POST 请求', () => {
      const result = decodeRequestStartLine('POST /api/login HTTP/1.0');
      assert.equal(result.method, 'POST');
      assert.equal(result.path, '/api/login');
      assert.equal(result.version, 1.0);
    });

    test('应该正确解析带查询参数的 URI', () => {
      const result = decodeRequestStartLine('GET /search?q=test&page=1 HTTP/1.1');
      assert.equal(result.method, 'GET');
      assert.equal(result.path, '/search?q=test&page=1');
      assert.equal(result.version, 1.1);
    });

    test('应该正确解析带锚点的 URI', () => {
      const result = decodeRequestStartLine('GET /page#section HTTP/1.1');
      assert.equal(result.path, '/page#section');
    });

    test('应该处理不同的 HTTP 方法（不区分大小写）', () => {
      const methods = ['get', 'Post', 'PUT', 'delete', 'PATCH'];
      methods.forEach(method => {
        const result = decodeRequestStartLine(`${method} /path HTTP/1.1`);
        assert.equal(result.method, method.toUpperCase());
      });
    });

    test('应该处理带前后空格的请求行', () => {
      const result = decodeRequestStartLine('  GET /path HTTP/1.1  ');
      assert.equal(result.method, 'GET');
      assert.equal(result.path, '/path');
    });

    test('应该处理复杂的 URI 路径', () => {
      const result = decodeRequestStartLine('GET /api/v1/users/123/profile HTTP/1.1');
      assert.equal(result.path, '/api/v1/users/123/profile');
    });

    test('应该处理编码的 URI', () => {
      const result = decodeRequestStartLine('GET /search?q=%E4%B8%AD%E6%96%87 HTTP/1.1');
      assert.equal(result.path, '/search?q=%E4%B8%AD%E6%96%87');
    });
  });

  describe('错误处理', () => {
    test('应该拒绝空字符串', () => {
      assert.throws(
        () => decodeRequestStartLine(''),
        TypeError,
      );
    });

    test('应该拒绝非字符串输入', () => {
      assert.throws(
        () => decodeRequestStartLine(null as any),
        TypeError,
      );
      assert.throws(
        () => decodeRequestStartLine(undefined as any),
        TypeError,
      );
      assert.throws(
        () => decodeRequestStartLine(123 as any),
        TypeError,
      );
    });

    test('应该拒绝格式错误的请求行', () => {
      const invalidLines = [
        'GET/path HTTP/1.1', // 缺少空格
        'GET /path', // 缺少版本
        '/path HTTP/1.1', // 缺少方法
        'GET  HTTP/1.1', // 缺少路径
        'GET /path HTTP/2.0', // 不支持的版本
        'GET /path HTTP/1.2', // 无效版本
        'GET /path HTTPS/1.1', // 错误的协议
      ];

      invalidLines.forEach(line => {
        assert.throws(
          () => decodeRequestStartLine(line),
          HttpDecodeError,
          `应该拒绝: ${line}`,
        );
      });
    });

    test('应该拒绝不支持的 HTTP 版本', () => {
      assert.throws(
        () => decodeRequestStartLine('GET /path HTTP/2.0'),
        (err: any) => {
          return err instanceof HttpDecodeError;
        },
      );
    });

    test('应该拒绝超长的 URI', () => {
      const longPath = '/path' + 'a'.repeat(5000);
      assert.throws(
        () => decodeRequestStartLine(`GET ${longPath} HTTP/1.1`),
        (err: any) => {
          return err instanceof HttpDecodeError &&
                 err.code === HttpDecodeErrorCode.URI_TOO_LARGE;
        },
      );
    });

    test('应该使用自定义限制', () => {
      const customLimit = { ...DEFAULT_START_LINE_LIMITS, maxUriBytes: 10 };
      assert.throws(
        () => decodeRequestStartLine('GET /very-long-path HTTP/1.1', customLimit),
        (err: any) => {
          return err instanceof HttpDecodeError &&
                 err.code === HttpDecodeErrorCode.URI_TOO_LARGE;
        },
      );
    });
  });
});

describe('decodeResponseStartLine', () => {
  describe('成功解析', () => {
    test('应该正确解析标准的 200 响应', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 OK');
      assert.equal(result.version, 1.1);
      assert.equal(result.statusCode, 200);
      assert.equal(result.statusText, 'OK');
      assert.equal(result.raw, 'HTTP/1.1 200 OK');
    });

    test('应该正确解析不同的状态码', () => {
      const testCases = [
        { line: 'HTTP/1.1 201 Created', code: 201, text: 'Created' },
        { line: 'HTTP/1.1 404 Not Found', code: 404, text: 'Not Found' },
        { line: 'HTTP/1.1 500 Internal Server Error', code: 500, text: 'Internal Server Error' },
        { line: 'HTTP/1.0 301 Moved Permanently', code: 301, text: 'Moved Permanently' },
      ];

      testCases.forEach(({ line, code, text }) => {
        const result = decodeResponseStartLine(line);
        assert.equal(result.statusCode, code);
        assert.equal(result.statusText, text);
      });
    });

    test('应该处理没有状态文本的响应', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200');
      assert.equal(result.statusCode, 200);
      assert.ok(result.statusText.length > 0); // 应该使用默认文本
    });

    test('应该处理空状态文本并使用默认值', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 ');
      assert.equal(result.statusCode, 200);
      assert.ok(result.statusText.length > 0);
    });

    test('应该处理带前后空格的响应行', () => {
      const result = decodeResponseStartLine('  HTTP/1.1 200 OK  ');
      assert.equal(result.statusCode, 200);
      assert.equal(result.statusText, 'OK');
    });

    test('应该处理 HTTP/1.0 版本', () => {
      const result = decodeResponseStartLine('HTTP/1.0 200 OK');
      assert.equal(result.version, 1.0);
    });

    test('应该处理自定义状态文本', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 Custom Success Message');
      assert.equal(result.statusText, 'Custom Success Message');
    });

    test('应该处理各种有效状态码范围', () => {
      const codes = [100, 101, 200, 204, 301, 400, 404, 500, 503, 599];
      codes.forEach(code => {
        const result = decodeResponseStartLine(`HTTP/1.1 ${code} Test`);
        assert.equal(result.statusCode, code);
      });
    });
  });

  describe('错误处理', () => {
    test('应该拒绝空字符串', () => {
      assert.throws(
        () => decodeResponseStartLine(''),
        TypeError,
      );
    });

    test('应该拒绝非字符串输入', () => {
      assert.throws(
        () => decodeResponseStartLine(null as any),
        TypeError,
      );
    });

    test('应该拒绝格式错误的响应行', () => {
      const invalidLines = [
        '200 OK', // 缺少版本
        'HTTP/1.1 OK', // 缺少状态码
        'HTTP/1.1 200OK', // 缺少空格
        'HTTP/2.0 200 OK', // 不支持的版本
        'HTTPS/1.1 200 OK', // 错误的协议
      ];

      invalidLines.forEach(line => {
        assert.throws(
          () => decodeResponseStartLine(line),
          HttpDecodeError,
          `应该拒绝: ${line}`,
        );
      });
    });

    test('应该拒绝无效的状态码', () => {
      const invalidCodes = [
        'HTTP/1.1 600 Too High', // > 599
      ];

      invalidCodes.forEach(line => {
        assert.throws(
          () => decodeResponseStartLine(line),
          (err: any) => {
            return err instanceof HttpDecodeError &&
                   err.code === HttpDecodeErrorCode.INVALID_STATUS_CODE;
          },
        );
      });
    });

    test('应该拒绝超长的状态文本', () => {
      const longText = 'a'.repeat(600);
      assert.throws(
        () => decodeResponseStartLine(`HTTP/1.1 200 ${longText}`),
        (err: any) => {
          return err instanceof HttpDecodeError &&
                 err.code === HttpDecodeErrorCode.INVALID_REASON_PHRASE;
        },
      );
    });

    test('应该使用自定义限制', () => {
      const customLimit = { ...DEFAULT_START_LINE_LIMITS, maxReasonPhraseBytes: 5 };
      assert.throws(
        () => decodeResponseStartLine('HTTP/1.1 200 Too Long Text', customLimit),
        (err: any) => {
          return err instanceof HttpDecodeError &&
                 err.code === HttpDecodeErrorCode.INVALID_REASON_PHRASE;
        },
      );
    });
  });
});

describe('边界情况测试', () => {
  test('应该处理最小和最大有效状态码', () => {
    const min = decodeResponseStartLine('HTTP/1.1 100 Continue');
    assert.equal(min.statusCode, 100);

    const max = decodeResponseStartLine('HTTP/1.1 599 Custom');
    assert.equal(max.statusCode, 599);
  });

  test('应该处理刚好在限制内的 URI', () => {
    const path = '/path' + 'a'.repeat(DEFAULT_START_LINE_LIMITS.maxUriBytes - 6);
    const result = decodeRequestStartLine(`GET ${path} HTTP/1.1`);
    assert.equal(result.path, path);
  });

  test('应该处理刚好在限制内的状态文本', () => {
    const text = 'a'.repeat(DEFAULT_START_LINE_LIMITS.maxReasonPhraseBytes);
    const result = decodeResponseStartLine(`HTTP/1.1 200 ${text}`);
    assert.equal(result.statusText, text);
  });

  test('应该保留原始请求行', () => {
    const original = '  GET /path HTTP/1.1  ';
    const result = decodeRequestStartLine(original);
    assert.equal(result.raw, original);
  });

  test('应该保留原始响应行', () => {
    const original = '  HTTP/1.1 200 OK  ';
    const result = decodeResponseStartLine(original);
    assert.equal(result.raw, original);
  });
});
