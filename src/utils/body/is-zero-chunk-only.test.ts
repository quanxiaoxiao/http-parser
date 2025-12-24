import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { isZeroChunkOnly } from './is-zero-chunk-only.js';

describe('isZeroChunkOnly', () => {
  describe('null 和 undefined 情况', () => {
    it('应该对 null 返回 true', () => {
      assert.strictEqual(isZeroChunkOnly(null), true);
    });

    it('应该对 undefined 返回 true', () => {
      assert.strictEqual(isZeroChunkOnly(undefined), true);
    });
  });

  describe('Buffer 类型', () => {
    it('应该对空 Buffer 返回 true', () => {
      const emptyBuffer = Buffer.from('');
      assert.strictEqual(isZeroChunkOnly(emptyBuffer), true);
    });

    it('应该对长度为 0 的 Buffer 返回 true', () => {
      const buffer = Buffer.alloc(0);
      assert.strictEqual(isZeroChunkOnly(buffer), true);
    });

    it('应该对 "0\\r\\n\\r\\n" Buffer 返回 true', () => {
      const zeroChunk = Buffer.from('0\r\n\r\n');
      assert.strictEqual(isZeroChunkOnly(zeroChunk), true);
    });

    it('应该对长度为 5 但内容不是 "0\\r\\n\\r\\n" 的 Buffer 返回 false', () => {
      const buffer = Buffer.from('hello');
      assert.strictEqual(isZeroChunkOnly(buffer), false);
    });

    it('应该对长度不为 5 的非空 Buffer 返回 false', () => {
      const buffer = Buffer.from('some data');
      assert.strictEqual(isZeroChunkOnly(buffer), false);
    });

    it('应该对包含其他内容的 Buffer 返回 false', () => {
      const buffer = Buffer.from('1\r\n\r\n');
      assert.strictEqual(isZeroChunkOnly(buffer), false);
    });
  });

  describe('字符串类型', () => {
    it('应该对空字符串返回 true', () => {
      assert.strictEqual(isZeroChunkOnly(''), true);
    });

    it('应该对只包含空格的字符串返回 true', () => {
      assert.strictEqual(isZeroChunkOnly('   '), true);
    });

    it('应该对包含制表符和换行的空白字符串返回 true', () => {
      assert.strictEqual(isZeroChunkOnly('\t\n  \r\n'), true);
    });

    it('应该对 "0" 返回 true', () => {
      assert.strictEqual(isZeroChunkOnly('0'), true);
    });

    it('应该对带空格的 "0" 返回 true', () => {
      assert.strictEqual(isZeroChunkOnly('  0  '), true);
    });

    it('应该对 "0\\r\\n\\r\\n" 返回 true', () => {
      assert.strictEqual(isZeroChunkOnly('0\r\n\r\n'), true);
    });

    it('应该对带空格的 "0\\r\\n\\r\\n" 返回 true', () => {
      assert.strictEqual(isZeroChunkOnly('  0\r\n\r\n  '), true);
    });

    it('应该对非零数字字符串返回 false', () => {
      assert.strictEqual(isZeroChunkOnly('1'), false);
    });

    it('应该对包含其他内容的字符串返回 false', () => {
      assert.strictEqual(isZeroChunkOnly('some text'), false);
    });

    it('应该对 "00" 返回 false', () => {
      assert.strictEqual(isZeroChunkOnly('00'), false);
    });

    it('应该对 "1\\r\\n\\r\\n" 返回 false', () => {
      assert.strictEqual(isZeroChunkOnly('1\r\n\r\n'), false);
    });
  });

  describe('边界情况', () => {
    it('应该正确处理只有换行符的字符串', () => {
      assert.strictEqual(isZeroChunkOnly('\r\n'), true);
    });

    it('应该正确处理 Buffer 和 string 的 "0" 差异', () => {
      const bufferZero = Buffer.from('0');
      const stringZero = '0';

      // Buffer "0" 长度为 1，不等于 5，应该返回 false
      assert.strictEqual(isZeroChunkOnly(bufferZero), false);
      // String "0" 应该返回 true
      assert.strictEqual(isZeroChunkOnly(stringZero), true);
    });
  });
});
