import * as assert from 'node:assert';
import { describe, test } from 'node:test';

import createHeaderGetter from './createHeaderGetter.js';

describe('createHeaderGetter', () => {
  test('应该正确转换 header 名称为小写', () => {
    const getHeader = createHeaderGetter({
      'Content-Type': 'application/json',
      'X-Custom-Header': 'value',
    });

    assert.strictEqual(getHeader('content-type'), 'application/json');
    assert.strictEqual(getHeader('Content-Type'), 'application/json');
    assert.strictEqual(getHeader('CONTENT-TYPE'), 'application/json');
  });

  test('应该过滤掉 null 和 undefined 值', () => {
    const getHeader = createHeaderGetter({
      'Valid-Header': 'value',
      'Null-Header': null,
      'Undefined-Header': undefined,
    });

    assert.strictEqual(getHeader('valid-header'), 'value');
    assert.strictEqual(getHeader('null-header'), null);
    assert.strictEqual(getHeader('undefined-header'), null);
  });

  test('应该支持字符串类型的值', () => {
    const getHeader = createHeaderGetter({
      Authorization: 'Bearer token123',
    });

    assert.strictEqual(getHeader('authorization'), 'Bearer token123');
  });

  test('应该支持数字类型的值', () => {
    const getHeader = createHeaderGetter({
      'Content-Length': 1024,
    });

    assert.strictEqual(getHeader('content-length'), 1024);
  });

  test('应该支持字符串数组类型的值', () => {
    const getHeader = createHeaderGetter({
      Accept: ['application/json', 'text/html'],
    });

    const result = getHeader('accept');
    assert.ok(Array.isArray(result));
    assert.deepStrictEqual(result, ['application/json', 'text/html']);
  });

  test('查询不存在的 header 应该返回 null', () => {
    const getHeader = createHeaderGetter({
      'Content-Type': 'application/json',
    });

    assert.strictEqual(getHeader('non-existent'), null);
  });

  test('应该处理空对象', () => {
    const getHeader = createHeaderGetter({});

    assert.strictEqual(getHeader('any-header'), null);
  });

  test('应该保持数字 0 作为有效值', () => {
    const getHeader = createHeaderGetter({
      'Retry-After': 0,
    });

    assert.strictEqual(getHeader('retry-after'), 0);
  });

  test('应该保持空字符串作为有效值', () => {
    const getHeader = createHeaderGetter({
      'X-Empty': '',
    });

    assert.strictEqual(getHeader('x-empty'), '');
  });

  test('应该处理混合类型的 headers', () => {
    const getHeader = createHeaderGetter({
      'Content-Type': 'application/json',
      'Content-Length': 2048,
      'Accept-Encoding': ['gzip', 'deflate'],
      'X-Null': null,
    });

    assert.strictEqual(getHeader('content-type'), 'application/json');
    assert.strictEqual(getHeader('content-length'), 2048);
    assert.deepStrictEqual(getHeader('accept-encoding'), ['gzip', 'deflate']);
    assert.strictEqual(getHeader('x-null'), null);
  });

  test('原始对象的 key 大小写应该被规范化', () => {
    const getHeader = createHeaderGetter({
      'MiXeD-CaSe-HeAdEr': 'value',
    });

    assert.strictEqual(getHeader('mixed-case-header'), 'value');
    assert.strictEqual(getHeader('MIXED-CASE-HEADER'), 'value');
    assert.strictEqual(getHeader('MiXeD-CaSe-HeAdEr'), 'value');
  });
});
