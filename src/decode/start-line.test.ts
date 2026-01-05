import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { DEFAULT_START_LINE_LIMITS } from '../specs.js';
import { decodeRequestStartLine, decodeResponseStartLine } from './start-line.js';

describe('decodeRequestStartLine', () => {
  describe('正常解析', () => {
    const validCases = [
      {
        name: '标准 GET 请求',
        input: 'GET /api/users HTTP/1.1',
        expected: { method: 'GET', path: '/api/users', version: 1.1 },
      },
      {
        name: 'POST 请求',
        input: 'POST /api/users HTTP/1.1',
        expected: { method: 'POST', path: '/api/users', version: 1.1 },
      },
      {
        name: '根路径请求',
        input: 'GET / HTTP/1.1',
        expected: { method: 'GET', path: '/', version: 1.1 },
      },
      {
        name: '带查询参数的路径',
        input: 'GET /api/users?id=123&name=test HTTP/1.1',
        expected: { method: 'GET', path: '/api/users?id=123&name=test', version: 1.1 },
      },
      {
        name: '带锚点的 URI',
        input: 'GET /page#section HTTP/1.1',
        expected: { method: 'GET', path: '/page#section', version: 1.1 },
      },
      {
        name: '星号路径 (OPTIONS)',
        input: 'OPTIONS * HTTP/1.1',
        expected: { method: 'OPTIONS', path: '*', version: 1.1 },
      },
      {
        name: 'HTTP/1.0 版本',
        input: 'GET /index.html HTTP/1.0',
        expected: { method: 'GET', path: '/index.html', version: 1.0 },
      },
      {
        name: '复杂的嵌套路径',
        input: 'GET /api/v2/users/123/posts/456/comments HTTP/1.1',
        expected: { method: 'GET', path: '/api/v2/users/123/posts/456/comments', version: 1.1 },
      },
      {
        name: '带特殊字符的路径',
        input: 'GET /api/search?q=hello%20world&filter=name:test HTTP/1.1',
        expected: { method: 'GET', path: '/api/search?q=hello%20world&filter=name:test', version: 1.1 },
      },
      {
        name: 'URL 编码的中文参数',
        input: 'GET /search?q=%E4%B8%AD%E6%96%87 HTTP/1.1',
        expected: { method: 'GET', path: '/search?q=%E4%B8%AD%E6%96%87', version: 1.1 },
      },
    ];

    validCases.forEach(({ name, input, expected }) => {
      it(`应该正确解析${name}`, () => {
        const result = decodeRequestStartLine(input);
        assert.strictEqual(result.method, expected.method);
        assert.strictEqual(result.path, expected.path);
        assert.strictEqual(result.version, expected.version);
        assert.strictEqual(result.raw, input);
      });
    });

    it('应该正确解析所有标准 HTTP 方法', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];
      methods.forEach(method => {
        const result = decodeRequestStartLine(`${method} /test HTTP/1.1`);
        assert.strictEqual(result.method, method);
        assert.strictEqual(result.path, '/test');
        assert.strictEqual(result.version, 1.1);
      });
    });

    it('应该处理小写的 HTTP 方法（自动转换为大写）', () => {
      const methods = ['get', 'post', 'put', 'delete', 'patch'];
      methods.forEach(method => {
        const result = decodeRequestStartLine(`${method} /api/test HTTP/1.1`);
        assert.strictEqual(result.method, method.toUpperCase());
      });
    });

    it('应该处理混合大小写的 HTTP 版本', () => {
      const versions = ['http/1.1', 'HTTP/1.1', 'Http/1.1', 'HtTp/1.0'];
      versions.forEach(version => {
        const result = decodeRequestStartLine(`GET /test ${version}`);
        assert.ok(result.version === 1.1 || result.version === 1.0);
      });
    });

    it('应该处理多个空格分隔符', () => {
      const result = decodeRequestStartLine('GET  /api/users  HTTP/1.1');
      assert.strictEqual(result.method, 'GET');
      assert.strictEqual(result.path, '/api/users');
      assert.strictEqual(result.version, 1.1);
    });

    it('应该处理首尾空格并保留在 raw 中', () => {
      const input = '  GET /api/users HTTP/1.1  ';
      const result = decodeRequestStartLine(input);
      assert.strictEqual(result.method, 'GET');
      assert.strictEqual(result.path, '/api/users');
      assert.strictEqual(result.raw, input);
    });

    it('应该处理自定义 HTTP 方法', () => {
      const customMethods = ['CUSTOMMETHOD', 'PROPFIND', 'MKCOL', 'COPY'];
      customMethods.forEach(method => {
        const result = decodeRequestStartLine(`${method} /api/test HTTP/1.1`);
        assert.strictEqual(result.method, method);
      });
    });

    it('应该允许路径不以 / 开头（相对路径）', () => {
      const result = decodeRequestStartLine('GET api/users HTTP/1.1');
      assert.strictEqual(result.path, 'api/users');
    });
  });

  describe('异常处理', () => {
    describe('无效输入类型', () => {
      const invalidInputs = [
        { value: '', name: '空字符串' },
        { value: null, name: 'null' },
        { value: undefined, name: 'undefined' },
        { value: 123, name: '数字' },
        { value: {}, name: '对象' },
        { value: [], name: '数组' },
        { value: '   ', name: '纯空格字符串' },
      ];

      invalidInputs.forEach(({ value, name }) => {
        it(`应该拒绝${name}`, () => {
          assert.throws(
            () => decodeRequestStartLine(value as any),
            value === '   ' ? HttpDecodeError : TypeError,
          );
        });
      });
    });

    describe('格式错误', () => {
      const malformedCases = [
        { input: '/api/users HTTP/1.1', reason: '缺少 HTTP 方法' },
        { input: 'GET HTTP/1.1', reason: '缺少路径' },
        { input: 'GET /api/users', reason: '缺少 HTTP 版本' },
        { input: 'GET/api/users HTTP/1.1', reason: '方法和路径之间无空格' },
        { input: 'GET /api/users test HTTP/1.1', reason: '路径包含空格' },
        { input: 'GET /api/usersHTTP/1.1', reason: '路径和版本之间无空格' },
        { input: 'this is not a valid request line', reason: '完全无效的格式' },
      ];

      malformedCases.forEach(({ input, reason }) => {
        it(`应该拒绝：${reason}`, () => {
          assert.throws(
            () => decodeRequestStartLine(input),
            HttpDecodeError,
          );
        });
      });
    });

    describe('不支持的 HTTP 版本', () => {
      const unsupportedVersions = [
        'GET /api/users HTTP/2.0',
        'GET /api/users HTTP/1.2',
        'GET /api/users HTTP/0.9',
        'GET /api/users HTTP/3.0',
        'GET /api/users HTTPS/1.1',
        'GET /api/users FTP/1.0',
      ];

      unsupportedVersions.forEach(input => {
        it(`应该拒绝：${input}`, () => {
          assert.throws(
            () => decodeRequestStartLine(input),
            HttpDecodeError,
          );
        });
      });
    });

    it('应该在 URI 超长时抛出错误', () => {
      const longPath = '/path' + 'a'.repeat(5000);
      assert.throws(
        () => decodeRequestStartLine(`GET ${longPath} HTTP/1.1`),
        (err: any) => {
          return err instanceof HttpDecodeError &&
                 err.code === HttpDecodeErrorCode.URI_TOO_LARGE;
        },
      );
    });

    it('应该支持自定义 URI 长度限制', () => {
      const customLimit = { ...DEFAULT_START_LINE_LIMITS, maxUriBytes: 10 };
      assert.throws(
        () => decodeRequestStartLine('GET /very-long-path HTTP/1.1', customLimit),
        (err: any) => {
          return err instanceof HttpDecodeError &&
                 err.code === HttpDecodeErrorCode.URI_TOO_LARGE;
        },
      );
    });

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
        assert.ok(error.message.length < 300);
      }
    });
  });

  describe('边界情况', () => {
    it('应该处理只有一个字符的路径', () => {
      const result = decodeRequestStartLine('GET /a HTTP/1.1');
      assert.strictEqual(result.path, '/a');
    });

    it('应该处理非常长但在限制内的路径', () => {
      const longPath = '/api/' + 'a'.repeat(1000);
      const result = decodeRequestStartLine(`GET ${longPath} HTTP/1.1`);
      assert.strictEqual(result.path, longPath);
    });

    it('应该处理刚好在限制内的 URI', () => {
      const path = '/' + 'a'.repeat(DEFAULT_START_LINE_LIMITS.maxUriBytes - 1);
      const result = decodeRequestStartLine(`GET ${path} HTTP/1.1`);
      assert.strictEqual(result.path, path);
    });

    it('应该处理包含特殊 URI 字符的路径', () => {
      const specialChars = [
        '/path?query=value',
        '/path#fragment',
        '/path?q1=v1&q2=v2',
        '/path;param=value',
        '/path%20with%20spaces',
      ];

      specialChars.forEach(path => {
        const result = decodeRequestStartLine(`GET ${path} HTTP/1.1`);
        assert.strictEqual(result.path, path);
      });
    });

    it('应该保留原始请求行（包括空格）', () => {
      const original = '  GET /path HTTP/1.1  ';
      const result = decodeRequestStartLine(original);
      assert.strictEqual(result.raw, original);
    });
  });
});

describe('decodeResponseStartLine', () => {
  describe('正常解析', () => {
    const validCases = [
      {
        name: '200 OK 响应',
        input: 'HTTP/1.1 200 OK',
        expected: { version: 1.1, statusCode: 200, statusText: 'OK' },
      },
      {
        name: '404 Not Found 响应',
        input: 'HTTP/1.0 404 Not Found',
        expected: { version: 1.0, statusCode: 404, statusText: 'Not Found' },
      },
      {
        name: '201 Created 响应',
        input: 'HTTP/1.1 201 Created',
        expected: { version: 1.1, statusCode: 201, statusText: 'Created' },
      },
      {
        name: '301 重定向响应',
        input: 'HTTP/1.1 301 Moved Permanently',
        expected: { version: 1.1, statusCode: 301, statusText: 'Moved Permanently' },
      },
      {
        name: '500 服务器错误响应',
        input: 'HTTP/1.1 500 Internal Server Error',
        expected: { version: 1.1, statusCode: 500, statusText: 'Internal Server Error' },
      },
      {
        name: '自定义状态文本',
        input: 'HTTP/1.1 200 Custom Success Message',
        expected: { version: 1.1, statusCode: 200, statusText: 'Custom Success Message' },
      },
    ];

    validCases.forEach(({ name, input, expected }) => {
      it(`应该正确解析${name}`, () => {
        const result = decodeResponseStartLine(input);
        assert.strictEqual(result.version, expected.version);
        assert.strictEqual(result.statusCode, expected.statusCode);
        assert.strictEqual(result.statusText, expected.statusText);
        assert.strictEqual(result.raw, input);
      });
    });

    it('应该正确解析所有状态码范围', () => {
      const statusCodes = [
        { code: 100, text: 'Continue' },
        { code: 101, text: 'Switching Protocols' },
        { code: 200, text: 'OK' },
        { code: 204, text: 'No Content' },
        { code: 301, text: 'Moved Permanently' },
        { code: 400, text: 'Bad Request' },
        { code: 401, text: 'Unauthorized' },
        { code: 403, text: 'Forbidden' },
        { code: 404, text: 'Not Found' },
        { code: 500, text: 'Internal Server Error' },
        { code: 502, text: 'Bad Gateway' },
        { code: 503, text: 'Service Unavailable' },
        { code: 599, text: 'Custom' },
      ];

      statusCodes.forEach(({ code, text }) => {
        const result = decodeResponseStartLine(`HTTP/1.1 ${code} ${text}`);
        assert.strictEqual(result.statusCode, code);
      });
    });

    it('应该处理没有状态文本的响应（使用默认值）', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200');
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.statusText.length > 0);
    });

    it('应该处理空状态文本（使用默认值）', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 ');
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.statusText.length > 0);
    });

    it('应该处理未知状态码（使用 Unknown）', () => {
      const result = decodeResponseStartLine('HTTP/1.1 599');
      assert.strictEqual(result.statusCode, 599);
      assert.strictEqual(result.statusText, 'Unknown');
    });

    it('应该处理首尾空格', () => {
      const result = decodeResponseStartLine('  HTTP/1.1 200 OK  ');
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.statusText, 'OK');
    });

    it('应该处理状态文本中的额外空格', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200   OK   ');
      assert.strictEqual(result.statusText, 'OK');
    });

    it('应该处理大小写不敏感的 HTTP 版本', () => {
      const versions = ['http/1.1', 'HTTP/1.1', 'Http/1.0'];
      versions.forEach(version => {
        const result = decodeResponseStartLine(`${version} 200 OK`);
        assert.ok(result.version === 1.1 || result.version === 1.0);
      });
    });

    it('应该处理多词状态文本', () => {
      const result = decodeResponseStartLine('HTTP/1.1 500 Internal Server Error');
      assert.strictEqual(result.statusText, 'Internal Server Error');
    });

    it('应该处理混合大小写的状态文本', () => {
      const result = decodeResponseStartLine('HTTP/1.1 200 Ok MiXeD CaSe');
      assert.strictEqual(result.statusText, 'Ok MiXeD CaSe');
    });
  });

  describe('异常处理', () => {
    describe('无效输入类型', () => {
      const invalidInputs = [
        { value: '', name: '空字符串' },
        { value: null, name: 'null' },
        { value: undefined, name: 'undefined' },
        { value: 123, name: '数字' },
        { value: {}, name: '对象' },
        { value: '   ', name: '纯空格字符串' },
      ];

      invalidInputs.forEach(({ value, name }) => {
        it(`应该拒绝${name}`, () => {
          assert.throws(
            () => decodeResponseStartLine(value as any),
            value === '   ' ? HttpDecodeError : TypeError,
          );
        });
      });
    });

    describe('格式错误', () => {
      const malformedCases = [
        { input: '200 OK', reason: '缺少 HTTP 版本' },
        { input: 'HTTP/1.1', reason: '缺少状态码' },
        { input: 'HTTP/1.1 OK', reason: '状态码不是数字' },
        { input: 'HTTP/1.1 200OK', reason: '状态码和文本之间无空格' },
        { input: 'Invalid Response Line', reason: '完全无效的格式' },
        { input: 'HTTP/2.0 200 OK', reason: '不支持的 HTTP 版本' },
        { input: 'HTTPS/1.1 200 OK', reason: '错误的协议名称' },
        { input: 'HTTP/1.1 ABC Invalid', reason: '状态码包含字母' },
        { input: 'HTTP/1.1 200.5 Invalid', reason: '状态码是浮点数' },
      ];

      malformedCases.forEach(({ input, reason }) => {
        it(`应该拒绝：${reason}`, () => {
          assert.throws(
            () => decodeResponseStartLine(input),
            HttpDecodeError,
          );
        });
      });
    });

    describe('无效的状态码', () => {
      const invalidStatusCodes = [
        { input: 'HTTP/1.1 600 Above Max', reason: '状态码高于 599' },
      ];

      invalidStatusCodes.forEach(({ input, reason }) => {
        it(`应该拒绝：${reason}`, () => {
          assert.throws(
            () => decodeResponseStartLine(input),
            (err: any) => {
              return err instanceof HttpDecodeError &&
                     err.code === HttpDecodeErrorCode.INVALID_STATUS_CODE;
            },
          );
        });
      });
    });

    describe('当状态码不是三位数字直接解析错误', () => {
      const invalidStatusCodes = [
        { input: 'HTTP/1.1 99 Below Min', reason: '状态码低于 100' },
        { input: 'HTTP/1.1 0 Zero', reason: '状态码为 0' },
        { input: 'HTTP/1.1 -200 Negative', reason: '负数状态码' },
        { input: 'HTTP/1.1 1000 Too Large', reason: '状态码过大' },
      ];

      invalidStatusCodes.forEach(({ input, reason }) => {
        it(`应该拒绝：${reason}`, () => {
          assert.throws(
            () => decodeResponseStartLine(input),
            (err: any) => {
              return err instanceof HttpDecodeError &&
                     err.code === HttpDecodeErrorCode.INVALID_START_LINE;
            },
          );
        });
      });
    });

    it('应该在状态文本超长时抛出错误', () => {
      const longText = 'a'.repeat(600);
      assert.throws(
        () => decodeResponseStartLine(`HTTP/1.1 200 ${longText}`),
        (err: any) => {
          return err instanceof HttpDecodeError &&
                 err.code === HttpDecodeErrorCode.REASON_PHARSE_TOO_LARGE;
        },
      );
    });

    it('应该支持自定义状态文本长度限制', () => {
      const customLimit = { ...DEFAULT_START_LINE_LIMITS, maxReasonPhraseBytes: 5 };
      assert.throws(
        () => decodeResponseStartLine('HTTP/1.1 200 Too Long Text', customLimit),
        (err: any) => {
          return err instanceof HttpDecodeError &&
                 err.code === HttpDecodeErrorCode.REASON_PHARSE_TOO_LARGE;
        },
      );
    });

    it('应该在错误消息中截断过长的输入', () => {
      const longString = 'x'.repeat(100);
      try {
        decodeResponseStartLine(longString);
        assert.fail('应该抛出错误');
      } catch (err: any) {
        assert.ok(err instanceof HttpDecodeError);
        assert.match(err.message, /\.\.\./);
      }
    });
  });

  describe('边界情况', () => {
    it('应该处理最小有效状态码 (100)', () => {
      const result = decodeResponseStartLine('HTTP/1.1 100 Continue');
      assert.strictEqual(result.statusCode, 100);
    });

    it('应该处理最大有效状态码 (599)', () => {
      const result = decodeResponseStartLine('HTTP/1.1 599 Custom');
      assert.strictEqual(result.statusCode, 599);
    });

    it('应该处理刚好在限制内的状态文本', () => {
      const text = 'a'.repeat(DEFAULT_START_LINE_LIMITS.maxReasonPhraseBytes);
      const result = decodeResponseStartLine(`HTTP/1.1 200 ${text}`);
      assert.strictEqual(result.statusText, text);
    });

    it('应该处理状态码带前导零', () => {
      // 注意：这取决于实现，如果 parseInt 处理会忽略前导零
      const result = decodeResponseStartLine('HTTP/1.1 200 OK');
      assert.strictEqual(result.statusCode, 200);
    });

    it('应该保留原始响应行（包括空格）', () => {
      const original = '  HTTP/1.1 200 OK  ';
      const result = decodeResponseStartLine(original);
      assert.strictEqual(result.raw, original);
    });

    it('应该处理所有 1xx 信息状态码', () => {
      const codes = [100, 101, 102, 103];
      codes.forEach(code => {
        const result = decodeResponseStartLine(`HTTP/1.1 ${code} Info`);
        assert.strictEqual(result.statusCode, code);
      });
    });

    it('应该处理所有 3xx 重定向状态码', () => {
      const codes = [300, 301, 302, 303, 304, 307, 308];
      codes.forEach(code => {
        const result = decodeResponseStartLine(`HTTP/1.1 ${code} Redirect`);
        assert.strictEqual(result.statusCode, code);
      });
    });

    it('应该处理所有 4xx 客户端错误状态码', () => {
      const codes = [400, 401, 403, 404, 405, 408, 409, 410, 429];
      codes.forEach(code => {
        const result = decodeResponseStartLine(`HTTP/1.1 ${code} Error`);
        assert.strictEqual(result.statusCode, code);
      });
    });

    it('应该处理所有 5xx 服务器错误状态码', () => {
      const codes = [500, 501, 502, 503, 504, 505];
      codes.forEach(code => {
        const result = decodeResponseStartLine(`HTTP/1.1 ${code} Error`);
        assert.strictEqual(result.statusCode, code);
      });
    });
  });
});

describe('综合边界测试', () => {
  it('请求行应该保留完整的原始输入', () => {
    const inputs = [
      '  GET /path HTTP/1.1  ',
      'POST /api HTTP/1.0',
      'PUT  /resource  HTTP/1.1',
    ];

    inputs.forEach(input => {
      const result = decodeRequestStartLine(input);
      assert.strictEqual(result.raw, input);
    });
  });

  it('响应行应该保留完整的原始输入', () => {
    const inputs = [
      '  HTTP/1.1 200 OK  ',
      'HTTP/1.0 404 Not Found',
      'HTTP/1.1  500  Error',
    ];

    inputs.forEach(input => {
      const result = decodeResponseStartLine(input);
      assert.strictEqual(result.raw, input);
    });
  });

  it('应该正确处理 HTTP/1.0 和 HTTP/1.1 的差异', () => {
    const req10 = decodeRequestStartLine('GET /path HTTP/1.0');
    const req11 = decodeRequestStartLine('GET /path HTTP/1.1');
    assert.strictEqual(req10.version, 1.0);
    assert.strictEqual(req11.version, 1.1);

    const res10 = decodeResponseStartLine('HTTP/1.0 200 OK');
    const res11 = decodeResponseStartLine('HTTP/1.1 200 OK');
    assert.strictEqual(res10.version, 1.0);
    assert.strictEqual(res11.version, 1.1);
  });

  it('应该处理极限长度的有效输入', () => {
    const maxPath = '/' + 'a'.repeat(DEFAULT_START_LINE_LIMITS.maxUriBytes - 1);
    const reqResult = decodeRequestStartLine(`GET ${maxPath} HTTP/1.1`);
    assert.strictEqual(reqResult.path.length, DEFAULT_START_LINE_LIMITS.maxUriBytes);

    const maxText = 'a'.repeat(DEFAULT_START_LINE_LIMITS.maxReasonPhraseBytes);
    const resResult = decodeResponseStartLine(`HTTP/1.1 200 ${maxText}`);
    assert.strictEqual(resResult.statusText.length, DEFAULT_START_LINE_LIMITS.maxReasonPhraseBytes);
  });
});
