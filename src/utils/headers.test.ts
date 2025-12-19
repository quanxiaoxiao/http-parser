import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { type Headers, type NormalizedHeaders } from '../types.js';
import {
  appendHeader,
  deleteHeader,
  getHeaderValue,
  normalizeHeaders,
  setHeader,
} from './headers.js';

describe('normalizeHeaders', () => {
  it('应该返回空对象当输入为 undefined', () => {
    const result = normalizeHeaders(undefined);
    assert.deepStrictEqual(result, {});
  });

  it('应该返回空对象当输入为空对象', () => {
    const result = normalizeHeaders({});
    assert.deepStrictEqual(result, {});
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

  it('应该处理字符串值', () => {
    const result = normalizeHeaders({
      'content-type': 'application/json',
    });

    assert.deepStrictEqual(result['content-type'], ['application/json']);
  });

  it('应该处理数组值', () => {
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

  it('应该跳过 null 和 undefined 值', () => {
    const result = normalizeHeaders({
      'content-type': 'application/json',
      'x-null': null,
      'x-undefined': undefined,
      accept: 'text/html',
    });

    assert.strictEqual(result['x-null'], undefined);
    assert.strictEqual(result['x-undefined'], undefined);
    assert.strictEqual(Object.keys(result).length, 2);
  });

  it('应该过滤数组中的 null 和 undefined', () => {
    const result = normalizeHeaders({
      accept: ['text/html', null, 'text/plain', undefined] as any,
    });

    assert.deepStrictEqual(result['accept'], ['text/html', 'text/plain']);
  });

  it('应该过滤空字符串', () => {
    const result = normalizeHeaders({
      accept: ['text/html', '  ', '', 'text/plain'],
    });

    assert.deepStrictEqual(result['accept'], ['text/html', 'text/plain']);
  });

  it('应该合并相同键名的 headers', () => {
    const headers: any = {
      'set-cookie': 'cookie1=value1',
    };

    const result = normalizeHeaders(headers);
    result['set-cookie']?.push('cookie2=value2');

    assert.deepStrictEqual(result['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
  });

  it('应该处理复杂场景', () => {
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

describe('getHeaderValue', () => {
  it('应该获取第一个值', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json', 'text/html'],
    };

    const value = getHeaderValue(headers, 'content-type');
    assert.strictEqual(value, 'application/json');
  });

  it('应该不区分大小写', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
    };

    assert.strictEqual(getHeaderValue(headers, 'Content-Type'), 'application/json');
    assert.strictEqual(getHeaderValue(headers, 'CONTENT-TYPE'), 'application/json');
  });

  it('应该返回 undefined 当 header 不存在', () => {
    const headers: NormalizedHeaders = {};

    const value = getHeaderValue(headers, 'content-type');
    assert.strictEqual(value, undefined);
  });

  it('应该返回 undefined 当值数组为空', () => {
    const headers: NormalizedHeaders = {
      'content-type': [],
    };

    const value = getHeaderValue(headers, 'content-type');
    assert.strictEqual(value, undefined);
  });
});

describe('setHeader', () => {
  it('应该设置字符串值', () => {
    const headers: NormalizedHeaders = {};

    setHeader(headers, 'content-type', 'application/json');

    assert.deepStrictEqual(headers['content-type'], ['application/json']);
  });

  it('应该设置数组值', () => {
    const headers: NormalizedHeaders = {};

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

  it('应该将键名转为小写', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['text/html'],
    };

    appendHeader(headers, 'Content-Type', 'application/json');

    assert.deepStrictEqual(headers['content-type'], ['text/html', 'application/json']);
  });
});

describe('deleteHeader', () => {
  it('应该删除存在的 header', () => {
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
