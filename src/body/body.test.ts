import * as assert from 'node:assert';
import {
  Buffer,
} from 'node:buffer';
import {
  describe, it,
} from 'node:test';

import {
  readBodyLength,
} from './body.js';

describe('readBodyLength', () => {
  describe('When passed Buffer type', () => {
    it('should return byte length of Buffer', () => {
      const body = Buffer.from('hello');
      assert.strictEqual(readBodyLength(body), 5);
    });

    it('should correctly handle empty Buffer', () => {
      const body = Buffer.from('');
      assert.strictEqual(readBodyLength(body), 0);
    });

    it('should correctly handle Buffer with multi-byte characters', () => {
      const body = Buffer.from('你好世界');
      assert.strictEqual(readBodyLength(body), 12); // UTF-8 中文每个字符3字节
    });

    it('should correctly handle Buffer with emoji', () => {
      const body = Buffer.from('Hello 👋');
      assert.strictEqual(readBodyLength(body), 10); // emoji 占4字节
    });
  });

  describe('When passed string type', () => {
    it('should return UTF-8 byte length of string', () => {
      const body = 'hello';
      assert.strictEqual(readBodyLength(body), 5);
    });

    it('should correctly handle empty string', () => {
      const body = '';
      assert.strictEqual(readBodyLength(body), 0);
    });

    it('should correctly calculate byte length of Chinese characters', () => {
      const body = '你好世界';
      assert.strictEqual(readBodyLength(body), 12);
    });

    it('should correctly calculate byte length of string with emoji', () => {
      const body = 'Hello 👋';
      assert.strictEqual(readBodyLength(body), 10);
    });

    it('should correctly handle mixed characters (ASCII + Chinese + emoji)', () => {
      const body = 'Hello 世界 👋';
      assert.strictEqual(readBodyLength(body), 17);
    });

    it('should correctly handle long string', () => {
      const body = 'a'.repeat(1000);
      assert.strictEqual(readBodyLength(body), 1000);
    });
  });

  describe('Edge Cases Tests', () => {
    it('Buffer and string should return same length', () => {
      const text = 'Hello 世界 👋';
      const bufferLength = readBodyLength(Buffer.from(text));
      const stringLength = readBodyLength(text);
      assert.strictEqual(bufferLength, stringLength);
    });

    it('should correctly handle string with newlines', () => {
      const body = 'line1\nline2\r\nline3';
      assert.strictEqual(readBodyLength(body), 18);
    });

    it('should correctly handle string with special characters', () => {
      const body = '{"key": "value"}';
      assert.strictEqual(readBodyLength(body), 16);
    });
  });
});
