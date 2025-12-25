import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { normalizeHeaders } from './header-normalize.js';

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
