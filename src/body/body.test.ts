import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import { readBodyLength } from './body.js';

describe('readBodyLength', () => {
  describe('当传入 Buffer 类型时', () => {
    it('应该返回 Buffer 的字节长度', () => {
      const body = Buffer.from('hello');
      assert.strictEqual(readBodyLength(body), 5);
    });

    it('应该正确处理空 Buffer', () => {
      const body = Buffer.from('');
      assert.strictEqual(readBodyLength(body), 0);
    });

    it('应该正确处理包含多字节字符的 Buffer', () => {
      const body = Buffer.from('你好世界');
      assert.strictEqual(readBodyLength(body), 12); // UTF-8 中文每个字符3字节
    });

    it('应该正确处理包含 emoji 的 Buffer', () => {
      const body = Buffer.from('Hello 👋');
      assert.strictEqual(readBodyLength(body), 10); // emoji 占4字节
    });
  });

  describe('当传入字符串类型时', () => {
    it('应该返回字符串的 UTF-8 字节长度', () => {
      const body = 'hello';
      assert.strictEqual(readBodyLength(body), 5);
    });

    it('应该正确处理空字符串', () => {
      const body = '';
      assert.strictEqual(readBodyLength(body), 0);
    });

    it('应该正确计算中文字符的字节长度', () => {
      const body = '你好世界';
      assert.strictEqual(readBodyLength(body), 12);
    });

    it('应该正确计算包含 emoji 的字符串字节长度', () => {
      const body = 'Hello 👋';
      assert.strictEqual(readBodyLength(body), 10);
    });

    it('应该正确处理混合字符（ASCII + 中文 + emoji）', () => {
      const body = 'Hello 世界 👋';
      assert.strictEqual(readBodyLength(body), 17);
    });

    it('应该正确处理长字符串', () => {
      const body = 'a'.repeat(1000);
      assert.strictEqual(readBodyLength(body), 1000);
    });
  });

  describe('边界情况测试', () => {
    it('Buffer 和字符串应该返回相同的长度', () => {
      const text = 'Hello 世界 👋';
      const bufferLength = readBodyLength(Buffer.from(text));
      const stringLength = readBodyLength(text);
      assert.strictEqual(bufferLength, stringLength);
    });

    it('应该正确处理包含换行符的字符串', () => {
      const body = 'line1\nline2\r\nline3';
      assert.strictEqual(readBodyLength(body), 18);
    });

    it('应该正确处理包含特殊字符的字符串', () => {
      const body = '{"key": "value"}';
      assert.strictEqual(readBodyLength(body), 16);
    });
  });
});
