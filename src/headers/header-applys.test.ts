import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  applyFramingHeaders,
  applyHostHeader,
} from './header-applys.js';

describe('applyFramingHeaders', () => {
  it('应该移除 framing headers 当 body 为 null 或 undefined', () => {
    const headers1 = {
      'content-length': ['1234'],
      'transfer-encoding': ['chunked'],
      'content-type': ['application/json'],
    };
    applyFramingHeaders(headers1, null);
    assert.deepStrictEqual(headers1, {
      'content-type': ['application/json'],
    });

    const headers2 = {
      'content-length': ['1234'],
      'transfer-encoding': ['chunked'],
    };
    applyFramingHeaders(headers2, undefined);
    assert.deepStrictEqual(headers2, {});
  });

  it('应该设置 Content-Length 当 body 为字符串或 Buffer', () => {
    const headers1 = {};
    applyFramingHeaders(headers1, 'hello world');
    assert.strictEqual(headers1['content-length']?.[0], '11');

    const headers2 = {};
    const buffer = Buffer.from('hello world');
    applyFramingHeaders(headers2, buffer);
    assert.strictEqual(headers2['content-length']?.[0], '11');
  });

  it('应该正确计算 UTF-8 字符串的字节长度', () => {
    const headers = {};
    applyFramingHeaders(headers, '你好世界'); // 12 bytes in UTF-8
    assert.strictEqual(headers['content-length']?.[0], '12');
  });

  it('应该设置 Transfer-Encoding 当 body 为 AsyncIterable', () => {
    const headers = {};
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('chunk1');
        yield Buffer.from('chunk2');
      },
    };
    applyFramingHeaders(headers, asyncIterable);
    assert.strictEqual(headers['transfer-encoding']?.[0], 'chunked');
  });

  it('应该替换已存在的 framing headers', () => {
    const headers = {
      'content-length': ['999'],
      'transfer-encoding': ['gzip'],
    };
    applyFramingHeaders(headers, 'new body');
    assert.strictEqual(headers['content-length']?.[0], '8');
    assert.strictEqual(headers['transfer-encoding'], undefined);
  });

  it('应该抛出错误当 body 类型不支持', () => {
    const headers = {};
    assert.throws(
      () => applyFramingHeaders(headers, 123 as any),
      { message: 'Unsupported body type' },
    );
  });
});

describe('applyHostHeader', () => {
  it('应该设置 Host header', () => {
    const headers = {};
    applyHostHeader(headers, 'example.com');
    assert.deepStrictEqual(headers, {
      host: ['example.com'],
    });
  });

  it('应该替换已存在的 Host header', () => {
    const headers = {
      host: ['old.example.com'],
    };
    applyHostHeader(headers, 'new.example.com');
    assert.deepStrictEqual(headers, {
      host: ['new.example.com'],
    });
  });

  it('应该处理带端口的 host', () => {
    const headers = {};
    applyHostHeader(headers, 'example.com:8080');
    assert.deepStrictEqual(headers, {
      host: ['example.com:8080'],
    });
  });

  it('应该抛出错误当 host 为空字符串', () => {
    const headers = {};
    assert.throws(
      () => applyHostHeader(headers, ''),
      { message: 'Client request requires host' },
    );
  });
});
