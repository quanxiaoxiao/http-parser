import * as assert from 'node:assert';
import {
  describe, it,
} from 'node:test';

import {
  appendHeader,
  deleteHeader,
  getHeaderValues,
  setHeader,
} from './headers.js';

describe('getHeaderValues', () => {
  it('应该返回存在的 header 值（字符串）', () => {
    const headers = { 'content-type': 'application/json' };
    const result = getHeaderValues(headers, 'content-type');
    assert.deepStrictEqual(result, ['application/json']);
  });

  it('应该返回存在的 header 值（数组）', () => {
    const headers = { 'set-cookie': ['cookie1=value1', 'cookie2=value2'] };
    const result = getHeaderValues(headers, 'set-cookie');
    assert.deepStrictEqual(result, ['cookie1=value1', 'cookie2=value2']);
  });

  it('应该对 key 进行大小写不敏感处理', () => {
    const headers = { 'content-type': 'text/html' };
    const result = getHeaderValues(headers, 'Content-Type');
    assert.deepStrictEqual(result, ['text/html']);
  });

  it('当 header 不存在时应该返回 undefined', () => {
    const headers = { 'content-type': 'application/json' };
    const result = getHeaderValues(headers, 'authorization');
    assert.strictEqual(result, undefined);
  });

  it('当 header 值为 null 时应该返回 undefined', () => {
    const headers = { 'x-custom': null };
    const result = getHeaderValues(headers, 'x-custom');
    assert.strictEqual(result, undefined);
  });

  it('当 header 值为空数组时应该返回 undefined', () => {
    const headers = { 'x-empty': [] };
    const result = getHeaderValues(headers, 'x-empty');
    assert.strictEqual(result, undefined);
  });
});

describe('setHeader', () => {
  it('应该设置单个字符串值', () => {
    const headers = {};
    setHeader(headers, 'Content-Type', 'application/json');
    assert.deepStrictEqual(headers, { 'content-type': ['application/json'] });
  });

  it('应该设置数组值', () => {
    const headers = {};
    setHeader(headers, 'Set-Cookie', ['cookie1=value1', 'cookie2=value2']);
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1=value1', 'cookie2=value2'],
    });
  });

  it('应该覆盖已存在的 header', () => {
    const headers = { 'content-type': ['text/html'] };
    setHeader(headers, 'Content-Type', 'application/json');
    assert.deepStrictEqual(headers, { 'content-type': ['application/json'] });
  });

  it('应该将 key 转换为小写', () => {
    const headers = {};
    setHeader(headers, 'X-Custom-Header', 'value');
    assert.deepStrictEqual(headers, { 'x-custom-header': ['value'] });
  });

  it('应该处理空字符串值', () => {
    const headers = {};
    setHeader(headers, 'X-Empty', '');
    assert.deepStrictEqual(headers, { 'x-empty': [''] });
  });
});

describe('appendHeader', () => {
  it('应该追加单个字符串值到不存在的 header', () => {
    const headers = {};
    appendHeader(headers, 'Set-Cookie', 'cookie1=value1');
    assert.deepStrictEqual(headers, { 'set-cookie': ['cookie1=value1'] });
  });

  it('应该追加单个字符串值到已存在的 header', () => {
    const headers = { 'set-cookie': ['cookie1=value1'] };
    appendHeader(headers, 'Set-Cookie', 'cookie2=value2');
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1=value1', 'cookie2=value2'],
    });
  });

  it('应该追加数组值到不存在的 header', () => {
    const headers = {};
    appendHeader(headers, 'X-Custom', ['value1', 'value2']);
    assert.deepStrictEqual(headers, { 'x-custom': ['value1', 'value2'] });
  });

  it('应该追加数组值到已存在的 header', () => {
    const headers = { 'x-custom': ['value1'] };
    appendHeader(headers, 'X-Custom', ['value2', 'value3']);
    assert.deepStrictEqual(headers, {
      'x-custom': ['value1', 'value2', 'value3'],
    });
  });

  it('应该对 key 进行大小写不敏感处理', () => {
    const headers = { 'content-type': ['text/html'] };
    appendHeader(headers, 'Content-Type', 'charset=utf-8');
    assert.deepStrictEqual(headers, {
      'content-type': ['text/html', 'charset=utf-8'],
    });
  });
});

describe('deleteHeader', () => {
  it('应该删除存在的 header 并返回 true', () => {
    const headers = { 'content-type': ['application/json'] };
    const result = deleteHeader(headers, 'Content-Type');
    assert.strictEqual(result, true);
    assert.deepStrictEqual(headers, {});
  });

  it('当 header 不存在时应该返回 false', () => {
    const headers = { 'content-type': ['application/json'] };
    const result = deleteHeader(headers, 'Authorization');
    assert.strictEqual(result, false);
    assert.deepStrictEqual(headers, { 'content-type': ['application/json'] });
  });

  it('应该对 key 进行大小写不敏感处理', () => {
    const headers = { 'content-type': ['text/html'] };
    const result = deleteHeader(headers, 'CONTENT-TYPE');
    assert.strictEqual(result, true);
    assert.deepStrictEqual(headers, {});
  });

  it('应该不影响其他 headers', () => {
    const headers = {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    };
    deleteHeader(headers, 'Content-Type');
    assert.deepStrictEqual(headers, { authorization: ['Bearer token'] });
  });
});

describe('集成测试', () => {
  it('应该支持完整的 header 操作流程', () => {
    const headers = {};

    // 设置初始 headers
    setHeader(headers, 'Content-Type', 'application/json');
    setHeader(headers, 'Authorization', 'Bearer token');

    // 追加值
    appendHeader(headers, 'Set-Cookie', 'session=abc');
    appendHeader(headers, 'Set-Cookie', 'user=john');

    // 获取值
    assert.deepStrictEqual(getHeaderValues(headers, 'content-type'), [
      'application/json',
    ]);
    assert.deepStrictEqual(getHeaderValues(headers, 'set-cookie'), [
      'session=abc',
      'user=john',
    ]);

    // 删除 header
    assert.strictEqual(deleteHeader(headers, 'Authorization'), true);
    assert.strictEqual(getHeaderValues(headers, 'authorization'), undefined);

    // 验证最终状态
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
      'set-cookie': ['session=abc', 'user=john'],
    });
  });
});
