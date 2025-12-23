import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import type { Headers } from '../types.js';
import { encodeHeaders } from './encode-headers.js';

describe('encodeHeaders', () => {
  it('应该正确编码单个 header', () => {
    const headers: Headers = {
      'Content-Type': 'application/json',
    };

    const result = encodeHeaders(headers);
    const expected = 'Content-Type: application/json\r\n';

    assert.strictEqual(result.toString(), expected);
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

  it('应该正确处理数组值的 header（同名多个值）', () => {
    const headers: Headers = {
      'Set-Cookie': ['session=abc123', 'token=xyz789'],
    };

    const result = encodeHeaders(headers);
    const resultStr = result.toString();

    assert.strictEqual(
      resultStr,
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

  it('应该正确处理空 headers 对象', () => {
    const headers: Headers = {};

    const result = encodeHeaders(headers);

    assert.strictEqual(result.length, 0);
    assert.strictEqual(result.toString(), '');
  });

  it('应该在 encodeValue 为 true 时对值进行 URL 编码', () => {
    const headers: Headers = {
      'X-Custom-Header': 'hello world',
      'X-Special-Chars': 'foo=bar&baz=qux',
    };

    const result = encodeHeaders(headers, { encodeValue: true });
    const resultStr = result.toString();

    assert.ok(resultStr.includes('X-Custom-Header: hello%20world\r\n'));
    assert.ok(resultStr.includes('X-Special-Chars: foo%3Dbar%26baz%3Dqux\r\n'));
  });

  it('应该在 encodeValue 为 false 时不对值进行编码', () => {
    const headers: Headers = {
      'X-Custom-Header': 'hello world',
    };

    const result = encodeHeaders(headers, { encodeValue: false });

    assert.strictEqual(result.toString(), 'X-Custom-Header: hello world\r\n');
  });

  it('应该在未指定 options 时不对值进行编码（默认行为）', () => {
    const headers: Headers = {
      'X-Custom-Header': 'hello world',
    };

    const result = encodeHeaders(headers);

    assert.strictEqual(result.toString(), 'X-Custom-Header: hello world\r\n');
  });

  it('应该正确处理包含特殊字符的 header 值', () => {
    const headers: Headers = {
      'Content-Disposition': 'attachment; filename="test.txt"',
      'X-Custom': 'value with: colon',
    };

    const result = encodeHeaders(headers);
    const resultStr = result.toString();

    assert.ok(resultStr.includes('Content-Disposition: attachment; filename="test.txt"\r\n'));
    assert.ok(resultStr.includes('X-Custom: value with: colon\r\n'));
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
    const resultStr = result.toString();

    assert.ok(resultStr.includes('X-Message: %E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C\r\n'));
  });

  it('应该返回 Buffer 类型', () => {
    const headers: Headers = {
      'Content-Type': 'text/plain',
    };

    const result = encodeHeaders(headers);

    assert.ok(Buffer.isBuffer(result));
  });

  it('应该正确处理空字符串值', () => {
    const headers: Headers = {
      'X-Empty': '',
    };

    const result = encodeHeaders(headers);

    assert.strictEqual(result.toString(), 'X-Empty: \r\n');
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

  it('应该正确处理大量 headers', () => {
    const headers: Headers = {};
    for (let i = 0; i < 100; i++) {
      headers[`X-Header-${i}`] = `value-${i}`;
    }

    const result = encodeHeaders(headers);
    const resultStr = result.toString();

    // 验证每个 header 都存在
    for (let i = 0; i < 100; i++) {
      assert.ok(resultStr.includes(`X-Header-${i}: value-${i}\r\n`));
    }
  });

  it('应该保持 header 名称的大小写', () => {
    const headers: Headers = {
      'Content-Type': 'text/html',
      'content-type': 'application/json',
      'CONTENT-TYPE': 'text/plain',
    };

    const result = encodeHeaders(headers);
    const resultStr = result.toString();

    assert.ok(resultStr.includes('Content-Type: text/html\r\n'));
    assert.ok(resultStr.includes('content-type: application/json\r\n'));
    assert.ok(resultStr.includes('CONTENT-TYPE: text/plain\r\n'));
  });
});
