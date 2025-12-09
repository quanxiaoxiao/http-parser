import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { DecodeHttpError } from '../errors.js';
import parseRequestLine from './parseRequestLine.js';

describe('parseRequestLine', () => {
  describe('正常情况', () => {
    it('应该正确解析标准的 GET 请求', () => {
      const result = parseRequestLine('GET /api/users HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/users',
        version: 1.1,
      });
    });

    it('应该正确解析 POST 请求', () => {
      const result = parseRequestLine('POST /api/users HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'POST',
        path: '/api/users',
        version: 1.1,
      });
    });

    it('应该正确解析根路径请求', () => {
      const result = parseRequestLine('GET / HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/',
        version: 1.1,
      });
    });

    it('应该正确解析带查询参数的路径', () => {
      const result = parseRequestLine('GET /api/users?id=123&name=test HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/users?id=123&name=test',
        version: 1.1,
      });
    });

    it('应该正确解析星号路径 (OPTIONS)', () => {
      const result = parseRequestLine('OPTIONS * HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'OPTIONS',
        path: '*',
        version: 1.1,
      });
    });

    it('应该正确解析 HTTP/1.0 版本', () => {
      const result = parseRequestLine('GET /index.html HTTP/1.0');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/index.html',
        version: 1.0,
      });
    });

    it('应该处理小写的 HTTP 方法', () => {
      const result = parseRequestLine('get /api/test HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/test',
        version: 1.1,
      });
    });

    it('应该处理混合大小写的 HTTP 版本', () => {
      const result = parseRequestLine('GET /test http/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/test',
        version: 1.1,
      });
    });

    it('应该处理多个空格分隔符', () => {
      const result = parseRequestLine('GET  /api/users  HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/users',
        version: 1.1,
      });
    });

    it('应该处理首尾空格', () => {
      const result = parseRequestLine('  GET /api/users HTTP/1.1  ');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/users',
        version: 1.1,
      });
    });

    it('应该正确解析各种 HTTP 方法', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];
      methods.forEach(method => {
        const result = parseRequestLine(`${method} /test HTTP/1.1`);
        assert.strictEqual(result.method, method);
        assert.strictEqual(result.path, '/test');
        assert.strictEqual(result.version, 1.1);
      });
    });

    it('应该正确解析复杂的路径', () => {
      const result = parseRequestLine('GET /api/v2/users/123/posts/456/comments HTTP/1.1');
      assert.deepStrictEqual(result, {
        method: 'GET',
        path: '/api/v2/users/123/posts/456/comments',
        version: 1.1,
      });
    });

    it('应该正确解析带有特殊字符的路径', () => {
      const result = parseRequestLine('GET /api/search?q=hello%20world&filter=name:test HTTP/1.1');
      assert.strictEqual(result.path, '/api/search?q=hello%20world&filter=name:test');
    });
  });

  describe('异常情况', () => {
    it('应该在输入为空字符串时抛出错误', () => {
      assert.throws(
        () => parseRequestLine(''),
        DecodeHttpError,
      );
    });

    it('应该在输入为 null 时抛出错误', () => {
      assert.throws(
        () => parseRequestLine(null as any), // eslint-disable-line
        DecodeHttpError,
      );
    });

    it('应该在输入为 undefined 时抛出错误', () => {
      assert.throws(
        () => parseRequestLine(undefined as any), // eslint-disable-line
        DecodeHttpError,
      );
    });

    it('应该在输入不是字符串时抛出错误', () => {
      assert.throws(
        () => parseRequestLine(123 as any), // eslint-disable-line
        DecodeHttpError,
      );
    });

    it('应该在缺少 HTTP 方法时抛出错误', () => {
      assert.throws(
        () => parseRequestLine('/api/users HTTP/1.1'),
        DecodeHttpError,
      );
    });

    it('应该在缺少路径时抛出错误', () => {
      assert.throws(
        () => parseRequestLine('GET HTTP/1.1'),
        DecodeHttpError,
      );
    });

    it('应该在缺少 HTTP 版本时抛出错误', () => {
      assert.throws(
        () => parseRequestLine('GET /api/users'),
        DecodeHttpError,
      );
    });

    it('应该在 HTTP 版本格式错误时抛出错误', () => {
      assert.throws(
        () => parseRequestLine('GET /api/users HTTP/2.0'),
        DecodeHttpError,
      );
    });

    it('应该在路径不以 / 开头且不是 * 时抛出错误', () => {
      assert.throws(
        () => parseRequestLine('GET api/users HTTP/1.1'),
        DecodeHttpError,
      );
    });

    it('应该在路径包含空格时抛出错误', () => {
      assert.throws(
        () => parseRequestLine('GET /api/users test HTTP/1.1'),
        DecodeHttpError,
      );
    });

    it('应该在格式完全错误时抛出错误', () => {
      assert.throws(
        () => parseRequestLine('this is not a valid request line'),
        DecodeHttpError,
      );
    });

    it('应该在只有空格时抛出错误', () => {
      assert.throws(
        () => parseRequestLine('   '),
        DecodeHttpError,
      );
    });
  });

  describe('边界情况', () => {
    it('应该处理只有一个字符的路径', () => {
      const result = parseRequestLine('GET /a HTTP/1.1');
      assert.strictEqual(result.path, '/a');
    });

    it('应该处理非常长的路径', () => {
      const longPath = '/api/' + 'a'.repeat(1000);
      const result = parseRequestLine(`GET ${longPath} HTTP/1.1`);
      assert.strictEqual(result.path, longPath);
    });

    it('应该处理自定义 HTTP 方法', () => {
      const result = parseRequestLine('CUSTOMMETHOD /api/test HTTP/1.1');
      assert.strictEqual(result.method, 'CUSTOMMETHOD');
    });
  });

  describe('错误消息', () => {
    it('应该在错误消息中包含部分输入内容', () => {
      try {
        parseRequestLine('invalid request line');
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error instanceof DecodeHttpError);
        assert.ok(error.message.includes('invalid request line'));
      }
    });

    it('应该截断过长的错误消息', () => {
      const longInput = 'GET ' + 'a'.repeat(100) + ' HTTP/1.1';
      try {
        parseRequestLine(longInput);
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error instanceof DecodeHttpError);
        assert.ok(error.message.length < 200);
      }
    });
  });
});
