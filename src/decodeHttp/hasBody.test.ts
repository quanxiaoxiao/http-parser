import * as assert from 'node:assert';
import { test } from 'node:test';

import hasBody from './hasBody.js';

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
