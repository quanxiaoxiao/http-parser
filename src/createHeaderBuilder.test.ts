import * as assert from 'node:assert';
import { describe, it,test } from 'node:test';

import createHeaderBuilder from './createHeaderBuilder.js';

describe('Header Builder Function', () => {

  it('should initialize with an empty header if no initial value is provided', () => {
    const builder = createHeaderBuilder();
    const [data, raw] = builder();
    assert.deepStrictEqual(data, {}, 'Data should be an empty object');
    assert.deepStrictEqual(raw, [], 'Raw array should be empty');
  });

  it('should initialize and normalize keys for initial headers', () => {
    const initialHeader = {
      'Content-Type': 'application/json',
      'X-Request-ID': '12345',
      ACCEPT: 'text/html',
    };
    const builder = createHeaderBuilder(initialHeader);
    const [data] = builder();

    assert.deepStrictEqual(data, {
      'content-type': 'application/json',
      'x-request-id': '12345',
      accept: 'text/html',
    }, 'Data should have normalized keys');
  });

  it('should store all initial header values in the raw array', () => {
    const initialHeader = {
      'Content-Type': 'application/json',
      'X-Request-ID': '12345',
    };
    const builder = createHeaderBuilder(initialHeader);
    const [, raw] = builder();

    assert.deepStrictEqual(raw, [
      'Content-Type', 'application/json',
      'X-Request-ID', '12345',
    ], 'Raw array should contain initial key-value pairs');
  });

  it('should handle array values during initialization and merge them into data object', () => {
    const initialHeader = {
      'Set-Cookie': ['a=1', 'b=2'],
      Connection: 'keep-alive',
    };
    const builder = createHeaderBuilder(initialHeader);
    const [data, raw] = builder();

    assert.deepStrictEqual(data, {
      'set-cookie': ['a=1', 'b=2'],
      connection: 'keep-alive',
    }, 'Data should store array values directly');

    assert.deepStrictEqual(raw, [
      'Set-Cookie', 'a=1',
      'Set-Cookie', 'b=2',
      'Connection', 'keep-alive',
    ], 'Raw array should flatten initial array values');
  });

  it('should add a new header entry', () => {
    const builder = createHeaderBuilder();
    const [data, raw] = builder('Authorization', 'Bearer token');

    assert.deepStrictEqual(data, {
      authorization: 'Bearer token',
    }, 'Data should contain the new entry');
    assert.deepStrictEqual(raw, [
      'Authorization', 'Bearer token',
    ], 'Raw array should contain the new entry');
  });

  it('should normalize key when adding a new header', () => {
    const builder = createHeaderBuilder();
    const [data] = builder('Accept-Encoding', 'gzip');

    assert.deepStrictEqual(data, {
      'accept-encoding': 'gzip',
    }, 'Data key should be normalized');
  });

  it('should merge duplicate header keys (string + string)', () => {
    const builder = createHeaderBuilder({
      'Cache-Control': 'no-cache',
    });
    const [data, raw] = builder('CACHE-CONTROL', 'no-store');

    assert.deepStrictEqual(data, {
      'cache-control': ['no-cache', 'no-store'],
    }, 'Duplicate string values should be merged into an array');
    assert.deepStrictEqual(raw, [
      'Cache-Control', 'no-cache',
      'CACHE-CONTROL', 'no-store', // 原始 key 被保留在 raw 中
    ], 'Raw array should contain all entries, preserving case');
  });

  it('should merge duplicate header keys (array + string)', () => {
    const builder = createHeaderBuilder({
      Accept: ['application/json', 'text/xml'],
    });
    const [data] = builder('accept', 'image/jpeg');

    assert.deepStrictEqual(data, {
      accept: ['application/json', 'text/xml', 'image/jpeg'],
    }, 'String should be added to existing array');
  });

  it('should merge duplicate header keys (string + array)', () => {
    const builder = createHeaderBuilder({
      'Content-Language': 'en',
    });
    const [data] = builder('content-language', ['zh-CN', 'ja-JP']);

    assert.deepStrictEqual(data, {
      'content-language': ['en', 'zh-CN', 'ja-JP'],
    }, 'Array should be added to existing string (now array)');
  });

  it('should merge duplicate header keys (array + array)', () => {
    const builder = createHeaderBuilder({
      Foo: ['bar1', 'bar2'],
    });
    const [data] = builder('foo', ['bar3', 'bar4']);

    assert.deepStrictEqual(data, {
      foo: ['bar1', 'bar2', 'bar3', 'bar4'],
    }, 'Two arrays should be concatenated');
  });

  it('should correctly append to raw array when adding an array of values', () => {
    const builder = createHeaderBuilder({
      'Content-Length': '100',
    });
    const [, raw] = builder('Set-Cookie', ['session=abc', 'user=xyz']);

    assert.deepStrictEqual(raw, [
      'Content-Length', '100',
      'Set-Cookie', 'session=abc',
      'Set-Cookie', 'user=xyz',
    ], 'Raw array should append key for each value in the array');
  });

  it('should return current state when called without arguments', () => {
    const initialHeader = { Initial: 'value' };
    const builder = createHeaderBuilder(initialHeader);
    builder('Added', 'value');

    const [data, raw] = builder();
    const [data2] = builder();

    assert.deepStrictEqual(data, {
      initial: 'value',
      added: 'value',
    }, 'Data should reflect all changes');

    assert.deepStrictEqual(raw, [
      'Initial', 'value',
      'Added', 'value',
    ], 'Raw should reflect all changes');

    assert.deepStrictEqual(data, data2, 'Subsequent calls without args should return the same state');
  });
});

describe('Header 模块测试', () => {
  describe('初始化测试', () => {
    test('应该能够创建空 header', () => {
      const header = createHeaderBuilder();
      const [data, raw] = header();

      assert.deepStrictEqual(data, {});
      assert.deepStrictEqual(raw, []);
    });

    test('应该能够使用初始 header 创建', () => {
      const header = createHeaderBuilder({ 'Content-Type': 'application/json' });
      const [data, raw] = header();

      assert.strictEqual(data['content-type'], 'application/json');
      assert.deepStrictEqual(raw, ['Content-Type', 'application/json']);
    });

    test('应该将初始 header 的键名标准化为小写', () => {
      const header = createHeaderBuilder({ 'Content-Type': 'text/html', 'X-Custom-Header': 'value' });
      const [data] = header();

      assert.strictEqual(data['content-type'], 'text/html');
      assert.strictEqual(data['x-custom-header'], 'value');
      assert.strictEqual(data['Content-Type'], undefined);
    });

    test('应该正确处理初始 header 中的数组值', () => {
      const header = createHeaderBuilder({ 'Set-Cookie': ['cookie1=value1', 'cookie2=value2'] });
      const [data, raw] = header();

      assert.deepStrictEqual(data['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
      assert.deepStrictEqual(raw, ['Set-Cookie', 'cookie1=value1', 'Set-Cookie', 'cookie2=value2']);
    });
  });

  describe('添加 header 测试', () => {
    test('应该能够添加新的 header', () => {
      const header = createHeaderBuilder();
      const [data, raw] = header('Content-Type', 'application/json');

      assert.strictEqual(data['content-type'], 'application/json');
      assert.deepStrictEqual(raw, ['Content-Type', 'application/json']);
    });

    test('应该将添加的 header 键名标准化为小写', () => {
      const header = createHeaderBuilder();
      header('Content-Type', 'application/json');
      const [data] = header('X-Custom-HEADER', 'value');

      assert.strictEqual(data['content-type'], 'application/json');
      assert.strictEqual(data['x-custom-header'], 'value');
    });

    test('应该能够添加数组形式的 header 值', () => {
      const header = createHeaderBuilder();
      const [data, raw] = header('Set-Cookie', ['cookie1=value1', 'cookie2=value2']);

      assert.deepStrictEqual(data['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
      assert.deepStrictEqual(raw, ['Set-Cookie', 'cookie1=value1', 'Set-Cookie', 'cookie2=value2']);
    });

    test('应该保留原始 header 键名的大小写在 raw 数组中', () => {
      const header = createHeaderBuilder();
      header('Content-Type', 'text/html');
      const [, raw] = header('X-Custom-Header', 'value');

      assert.deepStrictEqual(raw, ['Content-Type', 'text/html', 'X-Custom-Header', 'value']);
    });
  });

  describe('合并 header 测试', () => {
    test('应该合并相同键名的单个值', () => {
      const header = createHeaderBuilder({ 'X-Custom': 'value1' });
      const [data] = header('X-Custom', 'value2');

      assert.deepStrictEqual(data['x-custom'], ['value1', 'value2']);
    });

    test('应该合并已存在的数组值与新的单个值', () => {
      const header = createHeaderBuilder({ 'Set-Cookie': ['cookie1=value1', 'cookie2=value2'] });
      const [data] = header('Set-Cookie', 'cookie3=value3');

      assert.deepStrictEqual(data['set-cookie'], ['cookie1=value1', 'cookie2=value2', 'cookie3=value3']);
    });

    test('应该合并已存在的单个值与新的数组值', () => {
      const header = createHeaderBuilder({ 'X-Custom': 'value1' });
      const [data] = header('X-Custom', ['value2', 'value3']);

      assert.deepStrictEqual(data['x-custom'], ['value1', 'value2', 'value3']);
    });

    test('应该合并两个数组值', () => {
      const header = createHeaderBuilder({ 'Set-Cookie': ['cookie1=value1', 'cookie2=value2'] });
      const [data] = header('Set-Cookie', ['cookie3=value3', 'cookie4=value4']);

      assert.deepStrictEqual(data['set-cookie'], [
        'cookie1=value1',
        'cookie2=value2',
        'cookie3=value3',
        'cookie4=value4',
      ]);
    });

    test('合并时应在 raw 数组中追加新值', () => {
      const header = createHeaderBuilder({ 'X-Custom': 'value1' });
      const [, raw] = header('X-Custom', 'value2');

      assert.deepStrictEqual(raw, ['X-Custom', 'value1', 'X-Custom', 'value2']);
    });
  });

  describe('链式调用测试', () => {
    test('应该支持多次调用添加 header', () => {
      const header = createHeaderBuilder();
      header('Content-Type', 'application/json');
      header('Authorization', 'Bearer token');
      const [data, raw] = header('X-Custom', 'value');

      assert.strictEqual(data['content-type'], 'application/json');
      assert.strictEqual(data['authorization'], 'Bearer token');
      assert.strictEqual(data['x-custom'], 'value');
      assert.strictEqual(raw.length, 6);
    });

    test('应该在每次调用时返回完整的当前状态', () => {
      const header = createHeaderBuilder({ Initial: 'value' });

      const [data1] = header('First', 'value1');
      assert.strictEqual(Object.keys(data1).length, 2);

      const [data2] = header('Second', 'value2');
      assert.strictEqual(Object.keys(data2).length, 3);

      const [data3] = header();
      assert.strictEqual(Object.keys(data3).length, 3);
    });
  });

  describe('边界情况测试', () => {
    test('应该处理空字符串值', () => {
      const header = createHeaderBuilder();
      const [data, raw] = header('X-Empty', '');

      assert.strictEqual(data['x-empty'], '');
      assert.deepStrictEqual(raw, ['X-Empty', '']);
    });

    test('应该处理包含特殊字符的键名', () => {
      const header = createHeaderBuilder();
      const [data] = header('X-Special-@#$', 'value');

      assert.strictEqual(data['x-special-@#$'], 'value');
    });

    test('应该处理包含空格的值', () => {
      const header = createHeaderBuilder();
      const [data] = header('X-Spaces', 'value with spaces');

      assert.strictEqual(data['x-spaces'], 'value with spaces');
    });

    test('应该处理空数组', () => {
      const header = createHeaderBuilder();
      const [data, raw] = header('X-Empty-Array', []);

      assert.deepStrictEqual(data['x-empty-array'], []);
      assert.deepStrictEqual(raw, []);
    });

    test('应该处理包含空字符串的数组', () => {
      const header = createHeaderBuilder();
      const [data, raw] = header('X-Array', ['', 'value', '']);

      assert.deepStrictEqual(data['x-array'], ['', 'value', '']);
      assert.deepStrictEqual(raw, ['X-Array', '', 'X-Array', 'value', 'X-Array', '']);
    });
  });
});
