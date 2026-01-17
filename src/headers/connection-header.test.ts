import * as assert from 'node:assert';
import {
  describe,test,
} from 'node:test';

import {
  validateConnectionHeader,
} from './connection-header.js';

describe('validateConnectionHeader', () => {
  test('应该处理空值或未定义值', () => {
    const result1 = validateConnectionHeader(undefined);
    assert.strictEqual(result1.valid, true);
    assert.deepStrictEqual(result1.tokens, []);
    assert.strictEqual(result1.hasClose, false);
    assert.strictEqual(result1.hasKeepAlive, false);
    assert.strictEqual(result1.hasUpgrade, false);
    assert.deepStrictEqual(result1.hopByHopHeaders, []);

    const result2 = validateConnectionHeader('');
    assert.strictEqual(result2.valid, true);
    assert.deepStrictEqual(result2.tokens, []);

    const result3 = validateConnectionHeader('   ');
    assert.strictEqual(result3.valid, true);
    assert.deepStrictEqual(result3.tokens, []);
  });

  test('应该解析单个连接令牌', () => {
    const result = validateConnectionHeader('close');
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.tokens, ['close']);
    assert.strictEqual(result.hasClose, true);
    assert.strictEqual(result.hasKeepAlive, false);
    assert.strictEqual(result.hasUpgrade, false);
  });

  test('应该解析多个连接令牌', () => {
    const result = validateConnectionHeader('keep-alive, upgrade');
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.tokens, ['keep-alive', 'upgrade']);
    assert.strictEqual(result.hasKeepAlive, true);
    assert.strictEqual(result.hasUpgrade, true);
    assert.strictEqual(result.hasClose, false);
  });

  test('应该处理大小写不敏感', () => {
    const result = validateConnectionHeader('Close, Keep-Alive, UPGRADE');
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.tokens, ['close', 'keep-alive', 'upgrade']);
    assert.strictEqual(result.hasClose, true);
    assert.strictEqual(result.hasKeepAlive, true);
    assert.strictEqual(result.hasUpgrade, true);
  });

  test('应该处理空白符', () => {
    const result = validateConnectionHeader('  close  ,  keep-alive  ');
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.tokens, ['close', 'keep-alive']);
    assert.strictEqual(result.hasClose, true);
    assert.strictEqual(result.hasKeepAlive, true);
  });

  test('应该识别自定义逐跳首部', () => {
    const result = validateConnectionHeader('close, x-custom-header');
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.tokens, ['close', 'x-custom-header']);
    assert.strictEqual(result.hasClose, true);
    assert.deepStrictEqual(result.hopByHopHeaders, ['x-custom-header']);
  });

  test('应该处理多个自定义逐跳首部', () => {
    const result = validateConnectionHeader('x-foo, x-bar, close');
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.tokens, ['x-foo', 'x-bar', 'close']);
    assert.deepStrictEqual(result.hopByHopHeaders, ['x-foo', 'x-bar']);
  });

  test('应该拒绝无效的令牌字符', () => {
    const result1 = validateConnectionHeader('close, invalid token');
    assert.strictEqual(result1.valid, false);
    assert.ok(result1.errors);
    assert.strictEqual(result1.errors.length, 1);
    assert.match(result1.errors[0], /Invalid connection token/);

    const result2 = validateConnectionHeader('close, "quoted"');
    assert.strictEqual(result2.valid, false);
    assert.ok(result2.errors);
    assert.strictEqual(result2.errors.length, 1);
  });

  test('应该跳过空令牌', () => {
    const result = validateConnectionHeader('close,,keep-alive');
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.tokens, ['close', 'keep-alive']);
  });

  test('应该处理有效的特殊字符令牌', () => {
    const result = validateConnectionHeader('x-custom_header.v1');
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.tokens, ['x-custom_header.v1']);
  });

  test('应该处理混合有效和无效令牌', () => {
    const result = validateConnectionHeader('close, invalid@token, keep-alive');
    assert.strictEqual(result.valid, false);
    assert.deepStrictEqual(result.tokens, ['close', 'keep-alive']);
    assert.ok(result.errors);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.hasClose, true);
    assert.strictEqual(result.hasKeepAlive, true);
  });
});
