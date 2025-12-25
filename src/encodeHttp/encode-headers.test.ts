import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { test, describe, it } from 'node:test';

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
    assert.ok(resultStr.includes('Content-Type: application/json\r\n'));
    assert.ok(resultStr.includes('Content-Type: text/plain\r\n'));
  });
});

describe('encodeHeaders', () => {
  test('should encode simple headers', () => {
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'test-agent'
    };
    
    const result = encodeHeaders(headers);
    const expected = 'Content-Type: application/json\r\nUser-Agent: test-agent\r\n';
    
    assert.strictEqual(result.toString('utf8'), expected);
  });

  test('should handle array of header values', () => {
    const headers = {
      'set-cookie': ['cookie1=value1', 'cookie2=value2']
    };
    
    const result = encodeHeaders(headers);
    const expected = 'Set-Cookie: cookie1=value1\r\nSet-Cookie: cookie2=value2\r\n';
    
    assert.strictEqual(result.toString('utf8'), expected);
  });

  test('should canonicalize header names correctly', () => {
    const headers = {
      'content-type': 'text/html',
      'x-custom-header': 'value',
      'accept-encoding': 'gzip'
    };
    
    const result = encodeHeaders(headers);
    
    assert.ok(result.toString('utf8').includes('Content-Type:'));
    assert.ok(result.toString('utf8').includes('X-Custom-Header:'));
    assert.ok(result.toString('utf8').includes('Accept-Encoding:'));
  });

  test('should handle special header token exceptions', () => {
    const headers = {
      'te': 'trailers',
      'dnt': '1',
      'etag': '"123456"',
      'content-md5': 'abc123'
    };
    
    const result = encodeHeaders(headers).toString('utf8');
    
    assert.ok(result.includes('TE:'));
    assert.ok(result.includes('DNT:'));
    assert.ok(result.includes('ETag:'));
    assert.ok(result.includes('Content-MD5:'));
  });

  test('should handle empty headers object', () => {
    const headers = {};
    
    const result = encodeHeaders(headers);
    
    assert.strictEqual(result.length, 0);
  });

  test('should handle single character header names', () => {
    const headers = {
      'x': 'value'
    };
    
    const result = encodeHeaders(headers);
    const expected = 'X: value\r\n';
    
    assert.strictEqual(result.toString('utf8'), expected);
  });

  test('should encode header values when encodeValue option is true', () => {
    const headers = {
      'location': 'https://example.com/path?query=value with spaces'
    };
    
    const result = encodeHeaders(headers, { encodeValue: true });
    
    assert.ok(result.toString('utf8').includes('https%3A%2F%2Fexample.com%2Fpath%3Fquery%3Dvalue%20with%20spaces'));
  });

  test('should not encode header values when encodeValue option is false', () => {
    const headers = {
      'location': 'https://example.com/path?query=value with spaces'
    };
    
    const result = encodeHeaders(headers, { encodeValue: false });
    
    assert.ok(result.toString('utf8').includes('https://example.com/path?query=value with spaces'));
  });

  test('should not encode header values by default', () => {
    const headers = {
      'custom-header': 'value with spaces & special=chars'
    };
    
    const result = encodeHeaders(headers);
    
    assert.ok(result.toString('utf8').includes('value with spaces & special=chars'));
  });

  test('should handle mixed array and string header values', () => {
    const headers = {
      'content-type': 'text/plain',
      'set-cookie': ['session=abc', 'token=xyz'],
      'cache-control': 'no-cache'
    };
    
    const result = encodeHeaders(headers).toString('utf8');
    
    assert.ok(result.includes('Content-Type: text/plain'));
    assert.ok(result.includes('Set-Cookie: session=abc'));
    assert.ok(result.includes('Set-Cookie: token=xyz'));
    assert.ok(result.includes('Cache-Control: no-cache'));
  });

  test('should preserve header value with special characters', () => {
    const headers = {
      'authorization': 'Bearer token123!@#$%'
    };
    
    const result = encodeHeaders(headers);
    
    assert.ok(result.toString('utf8').includes('Bearer token123!@#$%'));
  });

  test('should handle headers with empty string values', () => {
    const headers = {
      'x-empty': ''
    };
    
    const result = encodeHeaders(headers);
    const expected = 'X-Empty: \r\n';
    
    assert.strictEqual(result.toString('utf8'), expected);
  });

  test('should handle multiple word header names with hyphens', () => {
    const headers = {
      'x-forwarded-for': '192.168.1.1',
      'strict-transport-security': 'max-age=31536000'
    };
    
    const result = encodeHeaders(headers).toString('utf8');
    
    assert.ok(result.includes('X-Forwarded-For:'));
    assert.ok(result.includes('Strict-Transport-Security:'));
  });

  test('should return Buffer instance', () => {
    const headers = {
      'content-type': 'text/html'
    };
    
    const result = encodeHeaders(headers);
    
    assert.ok(Buffer.isBuffer(result));
  });

  test('should handle www exception in header name', () => {
    const headers = {
      'www-authenticate': 'Basic realm="test"'
    };
    
    const result = encodeHeaders(headers);
    
    assert.ok(result.toString('utf8').includes('WWW-Authenticate:'));
  });

  test('should handle csrf exception in header name', () => {
    const headers = {
      'x-csrf-token': 'token123'
    };
    
    const result = encodeHeaders(headers);
    
    assert.ok(result.toString('utf8').includes('X-CSRF-Token:'));
  });

  test('should handle array with single value same as string value', () => {
    const headersWithArray = {
      'content-type': ['application/json']
    };
    const headersWithString = {
      'content-type': 'application/json'
    };
    
    const resultArray = encodeHeaders(headersWithArray);
    const resultString = encodeHeaders(headersWithString);
    
    assert.strictEqual(resultArray.toString('utf8'), resultString.toString('utf8'));
  });

  test('should use CRLF line endings', () => {
    const headers = {
      'host': 'example.com'
    };
    
    const result = encodeHeaders(headers);
    
    assert.ok(result.toString('utf8').endsWith('\r\n'));
    assert.ok(result.includes(Buffer.from('\r\n')));
  });
});

