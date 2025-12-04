import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import hasBody from './hasBody.js';

describe('hasBody', () => {
  describe('当存在 transfer-encoding 头时', () => {
    it('应该返回 true (chunked)', () => {
      const headers = { 'transfer-encoding': 'chunked' };
      assert.strictEqual(hasBody(headers), true);
    });

    it('应该返回 true (gzip, chunked)', () => {
      const headers = { 'transfer-encoding': 'gzip, chunked' };
      assert.strictEqual(hasBody(headers), true);
    });

    it('即使 content-length 为 0 也应该返回 true', () => {
      const headers = {
        'transfer-encoding': 'chunked',
        'content-length': '0',
      };
      assert.strictEqual(hasBody(headers), true);
    });
  });

  describe('当存在 content-length 头时', () => {
    it('应该返回 true (正常长度)', () => {
      const headers = { 'content-length': '1234' };
      assert.strictEqual(hasBody(headers), true);
    });

    it('应该返回 true (content-length 为数字类型)', () => {
      const headers = { 'content-length': 1234 };
      assert.strictEqual(hasBody(headers), true);
    });

    it('应该返回 false (content-length 为 0)', () => {
      const headers = { 'content-length': '0' };
      assert.strictEqual(hasBody(headers), false);
    });

    it('应该返回 false (content-length 为数字 0)', () => {
      const headers = { 'content-length': 0 };
      assert.strictEqual(hasBody(headers), false);
    });
  });

  describe('当两个头都不存在时', () => {
    it('应该返回 false (空 headers)', () => {
      const headers = {};
      assert.strictEqual(hasBody(headers), false);
    });

    it('应该返回 false (只有其他 headers)', () => {
      const headers = {
        'content-type': 'application/json',
        'cache-control': 'no-cache',
      };
      assert.strictEqual(hasBody(headers), false);
    });
  });

  describe('边界情况', () => {
    it('应该处理大小写不敏感的 header 名称', () => {
      const headers = { 'Content-Length': '100' };
      assert.strictEqual(hasBody(headers), true);
    });

    it('应该处理 header 值为数组的情况', () => {
      const headers = { 'content-length': ['100'] };
      assert.strictEqual(hasBody(headers), true);
    });

    it('应该返回 false 当 content-length 为空字符串', () => {
      const headers = { 'content-length': '' };
      assert.strictEqual(hasBody(headers), false);
    });
  });

  describe('优先级测试', () => {
    it('transfer-encoding 应该优先于 content-length', () => {
      const headers = {
        'transfer-encoding': 'chunked',
        'content-length': '0',
      };
      assert.strictEqual(hasBody(headers), true);
    });
  });
});
