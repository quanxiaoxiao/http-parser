import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import type { Headers } from '../types.js';
import { encodeHeaders } from './encode-headers.js';

describe('encodeHeaders', () => {
  describe('基本功能', () => {
    it('应该正确编码单个 header', () => {
      const headers: Headers = {
        'Content-Type': 'application/json',
      };

      const result = encodeHeaders(headers);
      assert.strictEqual(result.toString(), 'Content-Type: application/json\r\n');
    });

    it('应该正确编码多个 headers', () => {
      const headers: Headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
        'User-Agent': 'Mozilla/5.0',
      };

      const result = encodeHeaders(headers);
      const resultStr = result.toString();

      assert.ok(resultStr.includes('Content-Type: application/json\r\n'));
      assert.ok(resultStr.includes('Authorization: Bearer token123\r\n'));
      assert.ok(resultStr.includes('User-Agent: Mozilla/5.0\r\n'));
    });

    it('应该正确处理空 headers 对象', () => {
      const headers: Headers = {};
      const result = encodeHeaders(headers);

      assert.strictEqual(result.length, 0);
      assert.strictEqual(result.toString(), '');
    });

    it('应该返回 Buffer 类型', () => {
      const headers: Headers = {
        'Content-Type': 'text/plain',
      };

      const result = encodeHeaders(headers);
      assert.ok(Buffer.isBuffer(result));
    });

    it('应该使用 CRLF 行结束符', () => {
      const headers = {
        host: 'example.com',
      };

      const result = encodeHeaders(headers);
      assert.ok(result.toString().endsWith('\r\n'));
      assert.ok(result.includes(Buffer.from('\r\n')));
    });
  });

  describe('数组值处理', () => {
    it('应该正确处理数组值的 header（同名多个值）', () => {
      const headers: Headers = {
        'Set-Cookie': ['session=abc123', 'token=xyz789'],
      };

      const result = encodeHeaders(headers);
      assert.strictEqual(
        result.toString(),
        'Set-Cookie: session=abc123\r\nSet-Cookie: token=xyz789\r\n',
      );
    });

    it('应该正确处理混合的单值和数组值 headers', () => {
      const headers: Headers = {
        'Content-Type': 'text/html',
        'Set-Cookie': ['auth=token1', 'session=token2'],
        'Cache-Control': 'no-cache',
      };

      const result = encodeHeaders(headers);
      const resultStr = result.toString();

      assert.ok(resultStr.includes('Content-Type: text/html\r\n'));
      assert.ok(resultStr.includes('Set-Cookie: auth=token1\r\n'));
      assert.ok(resultStr.includes('Set-Cookie: session=token2\r\n'));
      assert.ok(resultStr.includes('Cache-Control: no-cache\r\n'));
    });

    it('应该处理单值数组与字符串值相同', () => {
      const headersWithArray: Headers = {
        'Content-Type': ['application/json'],
      };
      const headersWithString: Headers = {
        'Content-Type': 'application/json',
      };

      const resultArray = encodeHeaders(headersWithArray);
      const resultString = encodeHeaders(headersWithString);

      assert.strictEqual(resultArray.toString(), resultString.toString());
    });

    it('应该正确处理数组中的空字符串', () => {
      const headers: Headers = {
        'X-Values': ['', 'value', ''],
      };

      const result = encodeHeaders(headers);
      assert.strictEqual(
        result.toString(),
        'X-Values: \r\nX-Values: value\r\nX-Values: \r\n',
      );
    });
  });

  describe('Header 名称规范化', () => {
    it('应该将 header 名称规范化为首字母大写', () => {
      const headers: Headers = {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-custom-header': 'value',
        'accept-encoding': 'gzip',
      };

      const result = encodeHeaders(headers).toString();

      assert.ok(result.includes('Content-Type:'));
      assert.ok(result.includes('User-Agent:'));
      assert.ok(result.includes('X-Custom-Header:'));
      assert.ok(result.includes('Accept-Encoding:'));
    });

    it('应该处理单字符 header 名称', () => {
      const headers: Headers = {
        x: 'value',
      };

      const result = encodeHeaders(headers);
      assert.strictEqual(result.toString(), 'X: value\r\n');
    });

    it('应该正确处理多单词带连字符的 header 名称', () => {
      const headers: Headers = {
        'x-forwarded-for': '192.168.1.1',
        'strict-transport-security': 'max-age=31536000',
      };

      const result = encodeHeaders(headers).toString();

      assert.ok(result.includes('X-Forwarded-For:'));
      assert.ok(result.includes('Strict-Transport-Security:'));
    });

    it('应该处理特殊 token 例外情况', () => {
      const headers: Headers = {
        te: 'trailers',
        dnt: '1',
        etag: '"123456"',
        'content-md5': 'abc123',
        'www-authenticate': 'Basic realm="test"',
        'x-csrf-token': 'token123',
      };

      const result = encodeHeaders(headers).toString();

      assert.ok(result.includes('TE:'));
      assert.ok(result.includes('DNT:'));
      assert.ok(result.includes('ETag:'));
      assert.ok(result.includes('Content-MD5:'));
      assert.ok(result.includes('WWW-Authenticate:'));
      assert.ok(result.includes('X-CSRF-Token:'));
    });

    it('应该保持不同大小写的同名 header', () => {
      const headers: Headers = {
        'Content-Type': 'text/html',
        'content-type': 'application/json',
        'CONTENT-TYPE': 'text/plain',
      };

      const result = encodeHeaders(headers);
      const resultStr = result.toString();

      assert.ok(resultStr.includes('Content-Type: text/html\r\n'));
      assert.ok(resultStr.includes('Content-Type: application/json\r\n'));
      assert.ok(resultStr.includes('Content-Type: text/plain\r\n'));
    });
  });

  describe('值编码选项', () => {
    it('应该在未指定 options 时不对值进行编码（默认行为）', () => {
      const headers: Headers = {
        'X-Custom-Header': 'hello world',
        'Custom-Header': 'value with spaces & special=chars',
      };

      const result = encodeHeaders(headers).toString();

      assert.ok(result.includes('hello world'));
      assert.ok(result.includes('value with spaces & special=chars'));
    });

    it('应该在 encodeValue 为 false 时不对值进行编码', () => {
      const headers: Headers = {
        'X-Custom-Header': 'hello world',
        location: 'https://example.com/path?query=value with spaces',
      };

      const result = encodeHeaders(headers, { encodeValue: false }).toString();

      assert.ok(result.includes('hello world'));
      assert.ok(result.includes('https://example.com/path?query=value with spaces'));
    });

    it('应该在 encodeValue 为 true 时对值进行 URL 编码', () => {
      const headers: Headers = {
        'X-Custom-Header': 'hello world',
        'X-Special-Chars': 'foo=bar&baz=qux',
        location: 'https://example.com/path?query=value with spaces',
      };

      const result = encodeHeaders(headers, { encodeValue: true }).toString();

      assert.ok(result.includes('hello%20world'));
      assert.ok(result.includes('foo%3Dbar%26baz%3Dqux'));
      assert.ok(result.includes('https%3A%2F%2Fexample.com%2Fpath%3Fquery%3Dvalue%20with%20spaces'));
    });
  });

  describe('特殊字符和编码', () => {
    it('应该正确处理包含特殊字符的 header 值', () => {
      const headers: Headers = {
        'Content-Disposition': 'attachment; filename="test.txt"',
        'X-Custom': 'value with: colon',
        Authorization: 'Bearer token123!@#$%',
      };

      const result = encodeHeaders(headers).toString();

      assert.ok(result.includes('attachment; filename="test.txt"'));
      assert.ok(result.includes('value with: colon'));
      assert.ok(result.includes('Bearer token123!@#$%'));
    });

    it('应该正确处理空字符串值', () => {
      const headers: Headers = {
        'X-Empty': '',
      };

      const result = encodeHeaders(headers);
      assert.strictEqual(result.toString(), 'X-Empty: \r\n');
    });

    it('应该正确处理中文字符', () => {
      const headers: Headers = {
        'X-Message': '你好世界',
      };

      const result = encodeHeaders(headers);
      assert.strictEqual(result.toString('utf8'), 'X-Message: 你好世界\r\n');
    });

    it('应该在使用 encodeValue 时正确编码中文', () => {
      const headers: Headers = {
        'X-Message': '你好世界',
      };

      const result = encodeHeaders(headers, { encodeValue: true });
      assert.ok(result.toString().includes('%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C'));
    });
  });

  describe('性能和边界情况', () => {
    it('应该正确处理大量 headers', () => {
      const headers: Headers = {};
      for (let i = 0; i < 100; i++) {
        headers[`X-Header-${i}`] = `value-${i}`;
      }

      const result = encodeHeaders(headers);
      const resultStr = result.toString();

      for (let i = 0; i < 100; i++) {
        assert.ok(resultStr.includes(`X-Header-${i}: value-${i}\r\n`));
      }
    });
  });
});
