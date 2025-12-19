import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { type NormalizedHeaders } from '../types.js';
import {
  normalizeHeaders,
  getHeaderValue,
  setHeader,
  appendHeader,
  deleteHeader,
  stripHopByHopHeaders,
  sanitizeHeaders,
  applyFramingHeaders,
  applyHostHeader,
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
  });

  describe('值过滤', () => {
    it('应该跳过 null、undefined 和空字符串', () => {
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
    assert.strictEqual(getHeaderValue(headers, 'content-type'), 'application/json');
  });

  it('应该不区分大小写', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
    };

    assert.strictEqual(getHeaderValue(headers, 'Content-Type'), 'application/json');
    assert.strictEqual(getHeaderValue(headers, 'CONTENT-TYPE'), 'application/json');
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

  it('应该不影响其他 headers', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    };

    deleteHeader(headers, 'content-type');

    assert.deepStrictEqual(headers, {
      authorization: ['Bearer token'],
    });
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

describe('集成测试', () => {
  it('应该正确处理完整的 headers 操作流程', () => {
    // 规范化输入
    const headers = normalizeHeaders({
      'Content-Type': 'text/html',
      Accept: ['application/json', 'text/plain'],
    });

    // 获取值
    assert.strictEqual(getHeaderValue(headers, 'content-type'), 'text/html');

    // 设置值
    setHeader(headers, 'content-type', 'application/json');
    assert.strictEqual(getHeaderValue(headers, 'content-type'), 'application/json');

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
});

describe('normalizeHeaders', () => {
  it('应该返回空对象当输入为 undefined', () => {
    const result = normalizeHeaders();
    assert.deepStrictEqual(result, {});
  });

  it('应该返回空对象当输入为空对象', () => {
    const result = normalizeHeaders({});
    assert.deepStrictEqual(result, {});
  });

  it('应该将键转换为小写', () => {
    const result = normalizeHeaders({
      'Content-Type': 'application/json',
      'X-Custom-Header': 'value',
    });
    assert.deepStrictEqual(result, {
      'content-type': ['application/json'],
      'x-custom-header': ['value'],
    });
  });

  it('应该过滤 null 和 undefined 值', () => {
    const result = normalizeHeaders({
      'valid': 'value',
      'null-value': null,
      'undefined-value': undefined,
    });
    assert.deepStrictEqual(result, {
      'valid': ['value'],
    });
  });

  it('应该修剪空白字符并过滤空字符串', () => {
    const result = normalizeHeaders({
      'header1': '  value  ',
      'header2': ['  ', '', 'valid'],
    });
    assert.deepStrictEqual(result, {
      'header1': ['value'],
      'header2': ['valid'],
    });
  });

  it('应该处理数组值', () => {
    const result = normalizeHeaders({
      'set-cookie': ['cookie1=value1', 'cookie2=value2'],
    });
    assert.deepStrictEqual(result, {
      'set-cookie': ['cookie1=value1', 'cookie2=value2'],
    });
  });

  it('应该合并重复的键', () => {
    const result = normalizeHeaders({
      'x-custom': 'value1',
    });
    result['x-custom'].push('value2');
    assert.deepStrictEqual(result['x-custom'], ['value1', 'value2']);
  });
});

describe('getHeaderValue', () => {
  it('应该返回第一个 header 值', () => {
    const headers = {
      'content-type': ['application/json', 'charset=utf-8'],
    };
    const result = getHeaderValue(headers, 'content-type');
    assert.strictEqual(result, 'application/json');
  });

  it('应该不区分大小写', () => {
    const headers = {
      'content-type': ['application/json'],
    };
    const result = getHeaderValue(headers, 'Content-Type');
    assert.strictEqual(result, 'application/json');
  });

  it('应该返回 undefined 当 header 不存在', () => {
    const headers = {};
    const result = getHeaderValue(headers, 'content-type');
    assert.strictEqual(result, undefined);
  });

  it('应该返回 undefined 当 header 值为空数组', () => {
    const headers = {
      'content-type': [],
    };
    const result = getHeaderValue(headers, 'content-type');
    assert.strictEqual(result, undefined);
  });
});

describe('setHeader', () => {
  it('应该设置单个 header 值', () => {
    const headers = {};
    setHeader(headers, 'content-type', 'application/json');
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });

  it('应该设置多个 header 值', () => {
    const headers = {};
    setHeader(headers, 'set-cookie', ['cookie1=value1', 'cookie2=value2']);
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1=value1', 'cookie2=value2'],
    });
  });

  it('应该替换已存在的 header', () => {
    const headers = {
      'content-type': ['text/html'],
    };
    setHeader(headers, 'content-type', 'application/json');
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });

  it('应该不区分大小写', () => {
    const headers = {};
    setHeader(headers, 'Content-Type', 'application/json');
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });
});

describe('appendHeader', () => {
  it('应该追加到不存在的 header', () => {
    const headers = {};
    appendHeader(headers, 'set-cookie', 'cookie1=value1');
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1=value1'],
    });
  });

  it('应该追加到已存在的 header', () => {
    const headers = {
      'set-cookie': ['cookie1=value1'],
    };
    appendHeader(headers, 'set-cookie', 'cookie2=value2');
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1=value1', 'cookie2=value2'],
    });
  });

  it('应该追加多个值', () => {
    const headers = {
      'set-cookie': ['cookie1=value1'],
    };
    appendHeader(headers, 'set-cookie', ['cookie2=value2', 'cookie3=value3']);
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1=value1', 'cookie2=value2', 'cookie3=value3'],
    });
  });

  it('应该不区分大小写', () => {
    const headers = {
      'set-cookie': ['cookie1=value1'],
    };
    appendHeader(headers, 'Set-Cookie', 'cookie2=value2');
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1=value1', 'cookie2=value2'],
    });
  });
});

describe('deleteHeader', () => {
  it('应该删除存在的 header 并返回 true', () => {
    const headers = {
      'content-type': ['application/json'],
      'x-custom': ['value'],
    };
    const result = deleteHeader(headers, 'content-type');
    assert.strictEqual(result, true);
    assert.deepStrictEqual(headers, {
      'x-custom': ['value'],
    });
  });

  it('应该返回 false 当 header 不存在', () => {
    const headers = {
      'content-type': ['application/json'],
    };
    const result = deleteHeader(headers, 'x-custom');
    assert.strictEqual(result, false);
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });

  it('应该不区分大小写', () => {
    const headers = {
      'content-type': ['application/json'],
    };
    const result = deleteHeader(headers, 'Content-Type');
    assert.strictEqual(result, true);
    assert.deepStrictEqual(headers, {});
  });
});

describe('stripHopByHopHeaders', () => {
  it('应该移除所有跳跃式 headers', () => {
    const headers = {
      'connection': ['keep-alive'],
      'transfer-encoding': ['chunked'],
      'content-length': ['1234'],
      'content-type': ['application/json'],
      'x-custom': ['value'],
    };
    stripHopByHopHeaders(headers);
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
      'x-custom': ['value'],
    });
  });

  it('应该处理空 headers 对象', () => {
    const headers = {};
    stripHopByHopHeaders(headers);
    assert.deepStrictEqual(headers, {});
  });

  it('应该移除所有标准跳跃式 headers', () => {
    const headers = {
      'connection': ['close'],
      'keep-alive': ['timeout=5'],
      'proxy-authenticate': ['Basic'],
      'proxy-authorization': ['Bearer token'],
      'te': ['trailers'],
      'trailer': ['Expires'],
      'transfer-encoding': ['chunked'],
      'upgrade': ['websocket'],
    };
    stripHopByHopHeaders(headers);
    assert.deepStrictEqual(headers, {});
  });
});

describe('sanitizeHeaders', () => {
  it('应该移除跳跃式 headers 和 Connection 中指定的 headers', () => {
    const headers = {
      'connection': ['close'],
      'transfer-encoding': ['chunked'],
      'x-custom-hop': ['value'],
      'content-type': ['application/json'],
    };
    sanitizeHeaders(headers);
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
      'x-custom-hop': ['value'],
    });
  });

  it('应该处理空的 Connection header', () => {
    const headers = {
      'connection': ['keep-alive'],
      'content-type': ['application/json'],
    };
    sanitizeHeaders(headers);
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });
});

describe('applyFramingHeaders', () => {
  it('应该移除 framing headers 当 body 为 null', () => {
    const headers = {
      'content-length': ['1234'],
      'transfer-encoding': ['chunked'],
      'content-type': ['application/json'],
    };
    applyFramingHeaders(headers, null);
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });

  it('应该移除 framing headers 当 body 为 undefined', () => {
    const headers = {
      'content-length': ['1234'],
      'transfer-encoding': ['chunked'],
    };
    applyFramingHeaders(headers, undefined);
    assert.deepStrictEqual(headers, {});
  });

  it('应该设置 Content-Length 当 body 为字符串', () => {
    const headers = {};
    applyFramingHeaders(headers, 'hello world');
    assert.strictEqual(headers['content-length']?.[0], '11');
  });

  it('应该正确计算 UTF-8 字符串的字节长度', () => {
    const headers = {};
    applyFramingHeaders(headers, '你好世界'); // 12 bytes in UTF-8
    assert.strictEqual(headers['content-length']?.[0], '12');
  });

  it('应该设置 Content-Length 当 body 为 Buffer', () => {
    const headers = {};
    const buffer = Buffer.from('hello world');
    applyFramingHeaders(headers, buffer);
    assert.strictEqual(headers['content-length']?.[0], '11');
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

  it('应该抛出错误当 body 类型不支持', () => {
    const headers = {};
    assert.throws(
      () => applyFramingHeaders(headers, 123 as any),
      { message: 'Unsupported body type' }
    );
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
});

describe('applyHostHeader', () => {
  it('应该设置 Host header', () => {
    const headers = {};
    applyHostHeader(headers, 'example.com');
    assert.deepStrictEqual(headers, {
      'host': ['example.com'],
    });
  });

  it('应该替换已存在的 Host header', () => {
    const headers = {
      'host': ['old.example.com'],
    };
    applyHostHeader(headers, 'new.example.com');
    assert.deepStrictEqual(headers, {
      'host': ['new.example.com'],
    });
  });

  it('应该抛出错误当 host 为空字符串', () => {
    const headers = {};
    assert.throws(
      () => applyHostHeader(headers, ''),
      { message: 'Client request requires host' }
    );
  });

  it('应该处理带端口的 host', () => {
    const headers = {};
    applyHostHeader(headers, 'example.com:8080');
    assert.deepStrictEqual(headers, {
      'host': ['example.com:8080'],
    });
  });
});

describe('集成测试', () => {
  it('应该正确处理完整的 header 处理流程', () => {
    // 规范化原始 headers
    const headers = normalizeHeaders({
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
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
      'host': ['api.example.com'],
      'content-length': ['15'],
    });
  });
});
