import * as assert from 'node:assert';
import { describe, it } from 'node:test';

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
