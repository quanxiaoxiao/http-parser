import * as assert from 'node:assert';
import { test, describe } from 'node:test';

import {
  validateConnectionHeader,
  stripHopByHopHeaders,
  sanitizeHeaders,
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

describe('stripHopByHopHeaders', () => {
  test('应该移除标准逐跳首部', () => {
    const headers = {
      'Host': 'example.com',
      'Connection': 'keep-alive',
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
      'Upgrade': 'websocket',
      'Proxy-Authorization': 'Basic xxx',
    };

    const validation = validateConnectionHeader('keep-alive');
    const result = stripHopByHopHeaders(headers, validation);

    assert.strictEqual(result['Host'], 'example.com');
    assert.strictEqual(result['Content-Type'], 'application/json');
    assert.strictEqual(result['Connection'], undefined);
    assert.strictEqual(result['Transfer-Encoding'], undefined);
    assert.strictEqual(result['Upgrade'], undefined);
    assert.strictEqual(result['Proxy-Authorization'], undefined);
  });

  test('应该移除自定义逐跳首部', () => {
    const headers = {
      'Host': 'example.com',
      'X-Custom-Header': 'value',
      'Content-Type': 'application/json',
      'X-Another-Header': 'value2',
    };

    const validation = validateConnectionHeader('x-custom-header, x-another-header');
    const result = stripHopByHopHeaders(headers, validation);

    assert.strictEqual(result['Host'], 'example.com');
    assert.strictEqual(result['Content-Type'], 'application/json');
    assert.strictEqual(result['X-Custom-Header'], undefined);
    assert.strictEqual(result['X-Another-Header'], undefined);
  });

  test('应该处理大小写不敏感的首部名称', () => {
    const headers = {
      'Host': 'example.com',
      'CONNECTION': 'close',
      'X-Custom': 'value',
    };

    const validation = validateConnectionHeader('X-CUSTOM');
    const result = stripHopByHopHeaders(headers, validation);

    assert.strictEqual(result['Host'], 'example.com');
    assert.strictEqual(result['CONNECTION'], undefined);
    assert.strictEqual(result['X-Custom'], undefined);
  });

  test('应该保留所有非逐跳首部', () => {
    const headers = {
      'Host': 'example.com',
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Authorization': 'Bearer token',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    };

    const validation = validateConnectionHeader('close');
    const result = stripHopByHopHeaders(headers, validation);

    assert.deepStrictEqual(result, headers);
  });

  test('应该处理空首部对象', () => {
    const headers = {};
    const validation = validateConnectionHeader(undefined);
    const result = stripHopByHopHeaders(headers, validation);

    assert.deepStrictEqual(result, {});
  });

  test('应该处理没有逐跳首部的情况', () => {
    const headers = {
      'Host': 'example.com',
      'Content-Type': 'application/json',
    };

    const validation = validateConnectionHeader(undefined);
    const result = stripHopByHopHeaders(headers, validation);

    assert.strictEqual(result['Host'], 'example.com');
    assert.strictEqual(result['Content-Type'], 'application/json');
  });
});

describe('sanitizeHeaders', () => {
  test('应该一步完成验证和清理', () => {
    const headers = {
      'host': 'example.com',
      'connection': 'close, x-custom',
      'x-custom': 'value',
      'content-type': 'application/json',
      'transfer-encoding': 'chunked',
    };

    const result = sanitizeHeaders(headers);

    assert.strictEqual(result['host'], 'example.com');
    assert.strictEqual(result['content-type'], 'application/json');
    assert.strictEqual(result['connection'], undefined);
    assert.strictEqual(result['x-custom'], undefined);
    assert.strictEqual(result['transfer-encoding'], undefined);
  });

  test('应该处理没有 Connection 首部的情况', () => {
    const headers = {
      'Host': 'example.com',
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
    };

    const result = sanitizeHeaders(headers);

    assert.strictEqual(result['Host'], 'example.com');
    assert.strictEqual(result['Content-Type'], 'application/json');
    assert.strictEqual(result['Transfer-Encoding'], undefined);
  });

  test('应该处理大写的 Connection 首部', () => {
    const headers = {
      'Host': 'example.com',
      'CONNECTION': 'keep-alive',
      'Content-Type': 'application/json',
    };

    const result = sanitizeHeaders(headers);

    assert.strictEqual(result['Host'], 'example.com');
    assert.strictEqual(result['Content-Type'], 'application/json');
    assert.strictEqual(result['CONNECTION'], undefined);
  });
});

describe('边缘情况和集成测试', () => {
  test('应该处理复杂的真实场景', () => {
    const headers = {
      'host': 'api.example.com',
      'connection': 'upgrade, x-internal-proxy',
      'upgrade': 'websocket',
      'x-internal-proxy': 'node1',
      'user-agent': 'Mozilla/5.0',
      'authorization': 'Bearer token123',
      'content-type': 'application/json',
      'cache-control': 'no-cache',
      'keep-alive': 'timeout=5',
      'proxy-authenticate': 'Basic',
    };

    const result = sanitizeHeaders(headers);

    // 应该保留的首部
    assert.strictEqual(result['host'], 'api.example.com');
    assert.strictEqual(result['user-agent'], 'Mozilla/5.0');
    assert.strictEqual(result['authorization'], 'Bearer token123');
    assert.strictEqual(result['content-type'], 'application/json');
    assert.strictEqual(result['cache-control'], 'no-cache');

    // 应该移除的首部
    assert.strictEqual(result['connection'], undefined);
    assert.strictEqual(result['upgrade'], undefined);
    assert.strictEqual(result['x-internal-proxy'], undefined);
    assert.strictEqual(result['keep-alive'], undefined);
    assert.strictEqual(result['proxy-authenticate'], undefined);
  });

  test('应该处理极长的 Connection 值', () => {
    const tokens = Array.from({ length: 50 }, (_, i) => `x-header-${i}`);
    const connectionValue = tokens.join(', ');
    
    const result = validateConnectionHeader(connectionValue);
    
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.tokens.length, 50);
    assert.strictEqual(result.hopByHopHeaders.length, 50);
  });

  test('应该正确处理所有标准连接令牌的组合', () => {
    const result = validateConnectionHeader('close, keep-alive, upgrade');
    
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.hasClose, true);
    assert.strictEqual(result.hasKeepAlive, true);
    assert.strictEqual(result.hasUpgrade, true);
    assert.strictEqual(result.hopByHopHeaders.length, 0);
  });
});
