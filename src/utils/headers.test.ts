import * as assert from 'node:assert';
import { describe, it,test } from 'node:test';

import { type NormalizedHeaders } from '../types.js';
import {
  appendHeader,
  applyFramingHeaders,
  applyHostHeader,
  deleteHeader,
  getHeaderValue,
  hasBody,
  normalizeHeaders,
  sanitizeHeaders,
  setHeader,
  stripHopByHopHeaders,
} from './headers.js';

describe('normalizeHeaders', () => {
  describe('基本功能', () => {
    it('应该返回空对象当输入为 undefined 或空对象', () => {
      assert.deepStrictEqual(normalizeHeaders(undefined), {});
      assert.deepStrictEqual(normalizeHeaders(), {});
      assert.deepStrictEqual(normalizeHeaders({}), {});
    });

    it('应该将 header 键名转为小写', () => {
      const result = normalizeHeaders({
        'Content-Type': 'application/json',
        ACCEPT: 'text/html',
        'X-Custom-Header': 'value',
      });

      assert.strictEqual(result['content-type']?.[0], 'application/json');
      assert.strictEqual(result['accept']?.[0], 'text/html');
      assert.strictEqual(result['x-custom-header']?.[0], 'value');
    });

    it('应该合并相同键名的 headers', () => {
      const result = normalizeHeaders({
        'x-custom': 'value1',
        'X-Custom': 'value2',
      });
      assert.deepStrictEqual(result['x-custom'], ['value1', 'value2']);
    });
  });

  describe('值处理', () => {
    it('应该将字符串值转为数组', () => {
      const result = normalizeHeaders({
        'content-type': 'application/json',
      });
      assert.deepStrictEqual(result['content-type'], ['application/json']);
    });

    it('应该保持数组值不变', () => {
      const result = normalizeHeaders({
        'set-cookie': ['cookie1=value1', 'cookie2=value2'],
      });
      assert.deepStrictEqual(result['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
    });

    it('应该去除值前后的空格', () => {
      const result = normalizeHeaders({
        'content-type': '  application/json  ',
        accept: ['  text/html  ', '  text/plain  '],
      });

      assert.strictEqual(result['content-type']?.[0], 'application/json');
      assert.deepStrictEqual(result['accept'], ['text/html', 'text/plain']);
    });

    it('应该过滤 null、undefined 和空字符串', () => {
      const result = normalizeHeaders({
        'content-type': 'application/json',
        'x-null': null,
        'x-undefined': undefined,
        'x-empty': '',
        'x-whitespace': '   ',
        accept: 'text/html',
      });

      assert.strictEqual(result['x-null'], undefined);
      assert.strictEqual(result['x-undefined'], undefined);
      assert.strictEqual(result['x-empty'], undefined);
      assert.strictEqual(result['x-whitespace'], undefined);
      assert.strictEqual(Object.keys(result).length, 2);
    });

    it('应该过滤数组中的无效值', () => {
      const result = normalizeHeaders({
        accept: ['text/html', null, '  ', '', 'text/plain', undefined] as any,
        'set-cookie': ['cookie1', null, 'cookie2', undefined, ''],
      });

      assert.deepStrictEqual(result['accept'], ['text/html', 'text/plain']);
      assert.deepStrictEqual(result['set-cookie'], ['cookie1', 'cookie2']);
    });
  });

  describe('复杂场景', () => {
    it('应该处理混合类型的 headers', () => {
      const result = normalizeHeaders({
        'Content-Type': 'application/json',
        ACCEPT: ['text/html', '  application/xml  '],
        'X-Custom': null,
        Authorization: '  Bearer token  ',
        'Set-Cookie': ['cookie1=value1', '', 'cookie2=value2'],
      });

      assert.strictEqual(result['content-type']?.[0], 'application/json');
      assert.deepStrictEqual(result['accept'], ['text/html', 'application/xml']);
      assert.strictEqual(result['x-custom'], undefined);
      assert.strictEqual(result['authorization']?.[0], 'Bearer token');
      assert.deepStrictEqual(result['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
    });
  });
});

describe('getHeaderValue', () => {
  it('应该返回第一个值', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json', 'text/html'],
    };
    assert.deepStrictEqual(getHeaderValue(headers, 'content-type'), ['application/json', 'text/html']);
  });

  it('应该不区分大小写', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
    };

    assert.deepStrictEqual(getHeaderValue(headers, 'Content-Type'), ['application/json']);
    assert.deepStrictEqual(getHeaderValue(headers, 'CONTENT-TYPE'), ['application/json']);
  });

  it('应该返回 undefined 当 header 不存在或为空数组', () => {
    const emptyHeaders: NormalizedHeaders = {};
    const emptyArrayHeaders: NormalizedHeaders = { 'content-type': [] };

    assert.strictEqual(getHeaderValue(emptyHeaders, 'content-type'), undefined);
    assert.strictEqual(getHeaderValue(emptyArrayHeaders, 'content-type'), undefined);
  });
});

describe('setHeader', () => {
  it('应该设置字符串值或数组值', () => {
    const headers: NormalizedHeaders = {};

    setHeader(headers, 'content-type', 'application/json');
    assert.deepStrictEqual(headers['content-type'], ['application/json']);

    setHeader(headers, 'set-cookie', ['cookie1=value1', 'cookie2=value2']);
    assert.deepStrictEqual(headers['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
  });

  it('应该覆盖已存在的值', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['text/html'],
    };

    setHeader(headers, 'content-type', 'application/json');
    assert.deepStrictEqual(headers['content-type'], ['application/json']);
  });

  it('应该将键名转为小写', () => {
    const headers: NormalizedHeaders = {};

    setHeader(headers, 'Content-Type', 'application/json');

    assert.strictEqual(headers['Content-Type'], undefined);
    assert.deepStrictEqual(headers['content-type'], ['application/json']);
  });
});

describe('appendHeader', () => {
  it('应该添加新的 header', () => {
    const headers: NormalizedHeaders = {};

    appendHeader(headers, 'content-type', 'application/json');
    assert.deepStrictEqual(headers['content-type'], ['application/json']);
  });

  it('应该追加到已存在的 header', () => {
    const headers: NormalizedHeaders = {
      'set-cookie': ['cookie1=value1'],
    };

    appendHeader(headers, 'set-cookie', 'cookie2=value2');
    assert.deepStrictEqual(headers['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
  });

  it('应该追加数组值', () => {
    const headers: NormalizedHeaders = {
      accept: ['text/html'],
    };

    appendHeader(headers, 'accept', ['application/json', 'text/plain']);
    assert.deepStrictEqual(headers['accept'], ['text/html', 'application/json', 'text/plain']);
  });

  it('应该不区分大小写', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['text/html'],
    };

    appendHeader(headers, 'Content-Type', 'application/json');
    appendHeader(headers, 'SET-COOKIE', 'cookie1');

    assert.deepStrictEqual(headers['content-type'], ['text/html', 'application/json']);
    assert.deepStrictEqual(headers['set-cookie'], ['cookie1']);
  });
});

describe('deleteHeader', () => {
  it('应该删除存在的 header 并返回 true', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      accept: ['text/html'],
    };

    const result = deleteHeader(headers, 'content-type');

    assert.strictEqual(result, true);
    assert.strictEqual(headers['content-type'], undefined);
    assert.deepStrictEqual(headers['accept'], ['text/html']);
  });

  it('应该返回 false 当 header 不存在', () => {
    const headers: NormalizedHeaders = {
      accept: ['text/html'],
    };

    const result = deleteHeader(headers, 'content-type');
    assert.strictEqual(result, false);
  });

  it('应该不区分大小写', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
    };

    const result = deleteHeader(headers, 'Content-Type');

    assert.strictEqual(result, true);
    assert.strictEqual(headers['content-type'], undefined);
  });
});

describe('stripHopByHopHeaders', () => {
  it('应该移除所有标准 hop-by-hop headers', () => {
    const headers: NormalizedHeaders = {
      connection: ['close'],
      'transfer-encoding': ['chunked'],
      'content-length': ['200'],
      trailer: ['Expires'],
      upgrade: ['h2c'],
      expect: ['100-continue'],
      'keep-alive': ['timeout=5'],
      'proxy-connection': ['keep-alive'],
      'proxy-authenticate': ['Basic'],
      'proxy-authorization': ['Bearer token'],
      te: ['trailers'],
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    };

    stripHopByHopHeaders(headers);

    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    });
  });

  it('应该处理空对象', () => {
    const headers: NormalizedHeaders = {};
    stripHopByHopHeaders(headers);
    assert.deepStrictEqual(headers, {});
  });
});

describe('sanitizeHeaders', () => {
  it('应该移除标准 hop-by-hop headers', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      connection: ['keep-alive'],
      'transfer-encoding': ['chunked'],
    };

    sanitizeHeaders(headers);

    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });

  it('应该移除 Connection 头指定的自定义 headers', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      connection: ['close, x-custom-header'],
      'x-custom-header': ['value'],
    };

    sanitizeHeaders(headers);

    assert.strictEqual(headers['connection'], undefined);
    assert.strictEqual(headers['x-custom-header'], undefined);
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });

  it('应该处理没有 Connection 头的情况', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    };

    sanitizeHeaders(headers);

    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    });
  });
});

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

describe('集成测试', () => {
  it('应该正确处理完整的 headers 操作流程', () => {
    // 规范化输入
    const headers = normalizeHeaders({
      'Content-Type': 'text/html',
      Accept: ['application/json', 'text/plain'],
    });

    // 获取值
    assert.deepStrictEqual(getHeaderValue(headers, 'content-type'), ['text/html']);

    // 设置值
    setHeader(headers, 'content-type', 'application/json');
    assert.deepStrictEqual(getHeaderValue(headers, 'content-type'), ['application/json']);

    // 追加值
    appendHeader(headers, 'set-cookie', 'cookie1=value1');
    appendHeader(headers, 'set-cookie', 'cookie2=value2');
    assert.deepStrictEqual(headers['set-cookie'], ['cookie1=value1', 'cookie2=value2']);

    // 删除值
    deleteHeader(headers, 'accept');
    assert.strictEqual(headers['accept'], undefined);

    // 验证最终状态
    assert.deepStrictEqual(Object.keys(headers).sort(), ['content-type', 'set-cookie']);
  });

  it('应该正确处理完整的 header 处理流程', () => {
    // 规范化原始 headers
    const headers = normalizeHeaders({
      'Content-Type': 'application/json',
      Connection: 'keep-alive',
      'Transfer-Encoding': 'chunked',
      'X-Custom': 'value',
    });

    // 清理 headers
    sanitizeHeaders(headers);

    // 设置 Host
    applyHostHeader(headers, 'api.example.com');

    // 应用 framing headers
    applyFramingHeaders(headers, JSON.stringify({ key: 'value' }));

    // 验证最终结果
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
      'x-custom': ['value'],
      host: ['api.example.com'],
      'content-length': ['15'],
    });
  });
});

test('hasBody - Content-Length 头部处理', async (t) => {
  await t.test('正数值应返回 true', () => {
    assert.strictEqual(hasBody({ 'content-length': '100' }), true);
    assert.strictEqual(hasBody({ 'content-length': '1' }), true);
    assert.strictEqual(hasBody({ 'content-length': '1024' }), true);
  });

  await t.test('零值应返回 false', () => {
    assert.strictEqual(hasBody({ 'content-length': '0' }), false);
  });

  await t.test('负数应返回 false', () => {
    assert.strictEqual(hasBody({ 'content-length': '-1' }), false);
    assert.strictEqual(hasBody({ 'content-length': '-100' }), false);
  });

  await t.test('数组格式 - 取第一个元素', () => {
    assert.strictEqual(hasBody({ 'content-length': ['50'] }), true);
    assert.strictEqual(hasBody({ 'content-length': ['0'] }), false);
    assert.strictEqual(hasBody({ 'content-length': ['1024', '2048'] }), true);
  });

  await t.test('无效值应返回 false', () => {
    assert.strictEqual(hasBody({ 'content-length': 'invalid' }), false);
    assert.strictEqual(hasBody({ 'content-length': '' }), false);
    assert.strictEqual(hasBody({ 'content-length': 'not-a-number' }), false);
  });
});

test('hasBody - Transfer-Encoding 头部处理', async (t) => {
  await t.test('chunked 编码应返回 true', () => {
    assert.strictEqual(hasBody({ 'transfer-encoding': 'chunked' }), true);
    assert.strictEqual(hasBody({ 'transfer-encoding': 'CHUNKED' }), true);
    assert.strictEqual(hasBody({ 'transfer-encoding': 'gzip, chunked' }), true);
  });

  await t.test('数组格式包含 chunked 应返回 true', () => {
    assert.strictEqual(hasBody({ 'transfer-encoding': ['chunked', 'gzip'] }), true);
    assert.strictEqual(hasBody({ 'transfer-encoding': ['chunked'] }), true);
  });

  await t.test('非 chunked 编码应返回 false', () => {
    assert.strictEqual(hasBody({ 'transfer-encoding': 'identity' }), false);
    assert.strictEqual(hasBody({ 'transfer-encoding': 'gzip' }), false);
    assert.strictEqual(hasBody({ 'transfer-encoding': '' }), false);
  });
});

test('hasBody - 组合场景', async (t) => {
  await t.test('Content-Length + Transfer-Encoding 同时存在', () => {
    assert.strictEqual(
      hasBody({
        'content-length': '100',
        'transfer-encoding': 'chunked',
      }),
      true,
    );
  });

  await t.test('Content-Type 需配合 Content-Length 或 Transfer-Encoding', () => {
    // 有 Content-Length
    assert.strictEqual(
      hasBody({
        'content-type': 'application/json',
        'content-length': '50',
      }),
      true,
    );

    // 有 Transfer-Encoding
    assert.strictEqual(
      hasBody({
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
      }),
      true,
    );

    // 只有 Content-Type
    assert.strictEqual(
      hasBody({
        'content-type': 'application/json',
      }),
      false,
    );
  });

  await t.test('所有头部均为数组格式', () => {
    assert.strictEqual(
      hasBody({
        'content-length': ['123'],
        'transfer-encoding': ['chunked'],
        'content-type': ['application/json'],
      }),
      true,
    );
  });
});

test('hasBody - 边界情况', async (t) => {
  await t.test('空对象应返回 false', () => {
    assert.strictEqual(hasBody({}), false);
  });

  await t.test('只有无关头部应返回 false', () => {
    assert.strictEqual(
      hasBody({
        'user-agent': 'Mozilla/5.0',
        accept: 'application/json',
        host: 'example.com',
      }),
      false,
    );
  });

  await t.test('undefined 和 null 值', () => {
    assert.strictEqual(hasBody({ 'content-length': undefined }), false);
    assert.strictEqual(hasBody({ 'content-length': null }), false);
  });
});

test('hasBody - 真实 HTTP 场景', async (t) => {
  await t.test('GET 请求（无 body）', () => {
    assert.strictEqual(
      hasBody({
        host: 'example.com',
        'user-agent': 'Mozilla/5.0',
        accept: '*/*',
      }),
      false,
    );
  });

  await t.test('POST 请求（JSON body）', () => {
    assert.strictEqual(
      hasBody({
        'content-type': 'application/json',
        'content-length': '123',
      }),
      true,
    );
  });

  await t.test('流式响应（Server-Sent Events）', () => {
    assert.strictEqual(
      hasBody({
        'content-type': 'text/event-stream',
        'transfer-encoding': 'chunked',
      }),
      true,
    );
  });

  await t.test('204 No Content 响应', () => {
    assert.strictEqual(
      hasBody({
        'content-length': '0',
      }),
      false,
    );
  });

  await t.test('304 Not Modified 响应', () => {
    assert.strictEqual(
      hasBody({
        etag: '"abc123"',
        'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
      }),
      false,
    );
  });

  await t.test('文件上传（multipart/form-data）', () => {
    assert.strictEqual(
      hasBody({
        'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary',
        'content-length': '2048',
      }),
      true,
    );
  });
});
