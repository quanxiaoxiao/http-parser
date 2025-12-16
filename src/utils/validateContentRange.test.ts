import * as assert from 'node:assert';
import { describe, test } from 'node:test';

import { validateContentRange } from './validateContentRange.js'; // 根据实际路径调整

describe('validateContentRange', () => {
  describe('输入验证', () => {
    test('应拒绝非字符串输入', () => {
      const result = validateContentRange(123 as any);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'not a string');
      }
    });

    test('应拒绝包含 CR 字符的输入', () => {
      const result = validateContentRange('bytes 0-99/1000\r');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'contains CR/LF characters');
      }
    });

    test('应拒绝包含 LF 字符的输入', () => {
      const result = validateContentRange('bytes 0-99/1000\n');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'contains CR/LF characters');
      }
    });

    test('应拒绝无效的语法格式', () => {
      const result = validateContentRange('invalid format');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'invalid Content-Range syntax');
      }
    });

    test('应拒绝空字符串', () => {
      const result = validateContentRange('');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'invalid Content-Range syntax');
      }
    });
  });

  describe('部分范围验证 (partial range)', () => {
    test('应接受有效的部分范围', () => {
      const result = validateContentRange('bytes 0-99/1000');
      assert.strictEqual(result.valid, true);
      if (result.valid && result.type === 'partial') {
        assert.strictEqual(result.unit, 'bytes');
        assert.strictEqual(result.start, 0);
        assert.strictEqual(result.end, 99);
        assert.strictEqual(result.size, 1000);
        assert.strictEqual(result.type, 'partial');
      }
    });

    test('应接受不区分大小写的 bytes', () => {
      const result = validateContentRange('BYTES 0-99/1000');
      assert.strictEqual(result.valid, true);
    });

    test('应接受包含空格的有效格式', () => {
      const result = validateContentRange('bytes  200-299/5000');
      assert.strictEqual(result.valid, true);
      if (result.valid && result.type === 'partial') {
        assert.strictEqual(result.start, 200);
        assert.strictEqual(result.end, 299);
        assert.strictEqual(result.size, 5000);
      }
    });

    test('应接受起始和结束相同的范围', () => {
      const result = validateContentRange('bytes 100-100/1000');
      assert.strictEqual(result.valid, true);
      if (result.valid && result.type === 'partial') {
        assert.strictEqual(result.start, 100);
        assert.strictEqual(result.end, 100);
      }
    });

    test('应拒绝 start 为负数', () => {
      const result = validateContentRange('bytes -1-99/1000');
      assert.strictEqual(result.valid, false);
    });

    test('应拒绝 end < start', () => {
      const result = validateContentRange('bytes 100-50/1000');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'end (50) must be >= start (100)');
      }
    });

    test('应拒绝 size <= 0', () => {
      const result = validateContentRange('bytes 0-99/0');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'size must be > 0');
      }
    });

    test('应拒绝负的 size', () => {
      const result = validateContentRange('bytes 0-99/-100');
      assert.strictEqual(result.valid, false);
    });

    test('应拒绝 end >= size', () => {
      const result = validateContentRange('bytes 0-1000/1000');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'end (1000) must be < size (1000)');
      }
    });

    test('应拒绝 end > size', () => {
      const result = validateContentRange('bytes 0-1001/1000');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'end (1001) must be < size (1000)');
      }
    });

    test('应拒绝非安全整数', () => {
      const result = validateContentRange(`bytes 0-99/${Number.MAX_SAFE_INTEGER + 1}`);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'range values must be safe integers');
      }
    });

    test('应拒绝浮点数', () => {
      const result = validateContentRange('bytes 0.5-99.5/1000.5');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('未满足范围验证 (unsatisfied range)', () => {
    test('应接受有效的未满足范围', () => {
      const result = validateContentRange('bytes */1000');
      assert.strictEqual(result.valid, true);
      if (result.valid && result.type === 'unsatisfied') {
        assert.strictEqual(result.unit, 'bytes');
        assert.strictEqual(result.size, 1000);
        assert.strictEqual(result.type, 'unsatisfied');
      }
    });

    test('应接受不区分大小写的未满足范围', () => {
      const result = validateContentRange('BYTES */5000');
      assert.strictEqual(result.valid, true);
      if (result.valid && result.type === 'unsatisfied') {
        assert.strictEqual(result.size, 5000);
      }
    });

    test('应接受 size 为 0 的未满足范围', () => {
      const result = validateContentRange('bytes */0');
      assert.strictEqual(result.valid, true);
      if (result.valid && result.type === 'unsatisfied') {
        assert.strictEqual(result.size, 0);
      }
    });

    test('应拒绝负的 size', () => {
      const result = validateContentRange('bytes */-100');
      assert.strictEqual(result.valid, false);
    });

    test('应拒绝非安全整数的 size', () => {
      const result = validateContentRange(`bytes */${Number.MAX_SAFE_INTEGER + 1}`);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'invalid size (must be non-negative integer)');
      }
    });

    test('应拒绝浮点数的 size', () => {
      const result = validateContentRange('bytes */1000.5');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('边界情况', () => {
    test('应接受最大安全整数', () => {
      const max = Number.MAX_SAFE_INTEGER;
      const result = validateContentRange(`bytes 0-${max - 1}/${max}`);
      assert.strictEqual(result.valid, true);
      if (result.valid && result.type === 'partial') {
        assert.strictEqual(result.end, max - 1);
        assert.strictEqual(result.size, max);
      }
    });

    test('应接受零字节范围', () => {
      const result = validateContentRange('bytes 0-0/1');
      assert.strictEqual(result.valid, true);
      if (result.valid && result.type === 'partial') {
        assert.strictEqual(result.start, 0);
        assert.strictEqual(result.end, 0);
        assert.strictEqual(result.size, 1);
      }
    });

    test('应接受大文件的范围', () => {
      const result = validateContentRange('bytes 1000000-1999999/10000000');
      assert.strictEqual(result.valid, true);
      if (result.valid && result.type === 'partial') {
        assert.strictEqual(result.start, 1000000);
        assert.strictEqual(result.end, 1999999);
        assert.strictEqual(result.size, 10000000);
      }
    });
  });
});
