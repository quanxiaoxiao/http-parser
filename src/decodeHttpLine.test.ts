import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import decodeHttpLine from './decodeHttpLine.js';
import { DecodeHttpError } from './errors.js';

describe('decodeHttpLine', () => {
  describe('参数验证', () => {
    it('应该在 start 不是整数时抛出 TypeError', () => {
      const buf = Buffer.from('test\r\n');
      assert.throws(
        () => decodeHttpLine(buf, 1.5),
        TypeError,
        'start must be a non-negative integer',
      );
    });

    it('应该在 start 为负数时抛出 TypeError', () => {
      const buf = Buffer.from('test\r\n');
      assert.throws(
        () => decodeHttpLine(buf, -1),
        TypeError,
        'start must be a non-negative integer',
      );
    });

    it('应该在 limit 不是正整数时抛出 TypeError', () => {
      const buf = Buffer.from('test\r\n');
      assert.throws(
        () => decodeHttpLine(buf, 0, 0),
        TypeError,
        'limit must be a positive integer',
      );
    });

    it('应该在 start 超出 buffer 范围时抛出 RangeError', () => {
      const buf = Buffer.from('test');
      assert.throws(
        () => decodeHttpLine(buf, 10),
        RangeError,
        'start must be within buffer bounds',
      );
    });
  });

  describe('空 buffer 处理', () => {
    it('应该对空 buffer 返回 null', () => {
      const buf = Buffer.alloc(0);
      const result = decodeHttpLine(buf);
      assert.strictEqual(result, null);
    });

    it('应该在空 buffer 但 start 不为 0 时抛出错误', () => {
      const buf = Buffer.alloc(0);
      assert.throws(
        () => decodeHttpLine(buf, 1),
        RangeError,
        'start must be 0 for empty buffer',
      );
    });
  });

  describe('CRLF 解析', () => {
    it('应该正确解析以 CRLF 结尾的行', () => {
      const buf = Buffer.from('Hello World\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Hello World');
    });

    it('应该从指定的 start 位置开始解析', () => {
      const buf = Buffer.from('skip\r\nHello\r\n');
      const result = decodeHttpLine(buf, 6);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Hello');
      assert.equal(
        decodeHttpLine(Buffer.from('abc\r\n'), 1).toString(),
        'bc',
      );
      assert.equal(
        decodeHttpLine(Buffer.from('abc\r\n'), 2).toString(),
        'c',
      );
      assert.equal(
        decodeHttpLine(Buffer.from('abc\r\n'), 3).toString(),
        '',
      );
    });

    it('应该解析空行（仅 CRLF）', () => {
      const buf = Buffer.from('\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.length, 0);
      assert.equal(result, '');
    });

    it('应该处理多行数据，只返回第一行', () => {
      const buf = Buffer.from('Line1\r\nLine2\r\nLine3\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Line1');
    });

    it('应该在找不到完整 CRLF 时返回 null', () => {
      const buf = Buffer.from('incomplete line');
      const result = decodeHttpLine(buf);
      assert.strictEqual(result, null);
      assert.equal(
        decodeHttpLine(Buffer.from('abcde')),
        null,
      );
      assert.equal(
        decodeHttpLine(Buffer.from([])),
        null,
      );
    });

    it('应该在只有 CR 没有 LF 时返回 null', () => {
      const buf = Buffer.from('line\rno LF');
      const result = decodeHttpLine(buf);
      assert.strictEqual(result, null);
    });
  });

  describe('错误格式检测', () => {
    it('应该在起始位置是 LF 时抛出 DecodeHttpError', () => {
      const buf = Buffer.from('\nHello');
      assert.throws(
        () => decodeHttpLine(buf),
        DecodeHttpError,
      );
    });

    it('应该在 LF 前没有 CR 时抛出 DecodeHttpError', () => {
      const buf = Buffer.from('Hello\nWorld');
      assert.throws(
        () => decodeHttpLine(buf),
        DecodeHttpError,
      );
    });

    it('应该在自定义错误消息时包含该消息', () => {
      const buf = Buffer.from('\nHello');
      assert.throws(
        () => decodeHttpLine(buf, 0, 65535, 'Custom error'),
        {
          name: 'DecodeHttpError',
          message: /Custom error/,
        },
      );
    });
  });

  describe('行长度限制', () => {
    it('应该在行长度超过限制时抛出 DecodeHttpError', () => {
      const buf = Buffer.from('a'.repeat(100));
      assert.throws(
        () => decodeHttpLine(buf, 0, 50),
        DecodeHttpError,
      );
    });

    it('应该在限制内正确解析行', () => {
      const buf = Buffer.from('short\r\n');
      const result = decodeHttpLine(buf, 0, 10);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'short');
    });

    it('应该在行长度等于限制时返回 null（等待更多数据）', () => {
      const buf = Buffer.from('a'.repeat(50));
      const result = decodeHttpLine(buf, 0, 51);
      assert.strictEqual(result, null);
    });
  });

  describe('边界情况', () => {
    it('应该处理单字节 buffer', () => {
      const buf = Buffer.from('a');
      const result = decodeHttpLine(buf);
      assert.strictEqual(result, null);
    });

    it('应该处理只有 CR 的 buffer', () => {
      const buf = Buffer.from('\r');
      const result = decodeHttpLine(buf);
      assert.strictEqual(result, null);
    });

    it('应该处理 CRLF 在 buffer 末尾的情况', () => {
      const buf = Buffer.from('data\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'data');
    });

    it('应该处理包含二进制数据的行', () => {
      const buf = Buffer.from([0x01, 0x02, 0x03, 0x0d, 0x0a]);
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.length, 3);
    });

    it('应该从 start 位置开始搜索，即使之前有 CRLF', () => {
      const buf = Buffer.from('first\r\nsecond\r\n');
      const result = decodeHttpLine(buf, 7);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'second');
    });
  });

  describe('实际 HTTP 场景', () => {
    it('应该解析 HTTP 请求行', () => {
      const buf = Buffer.from('GET /path HTTP/1.1\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'GET /path HTTP/1.1');
    });

    it('应该解析 HTTP 头部', () => {
      const buf = Buffer.from('Content-Type: application/json\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Content-Type: application/json');
    });

    it('应该解析空行（HTTP 头部结束标志）', () => {
      const buf = Buffer.from('Header: value\r\n\r\nBody');
      const firstLine = decodeHttpLine(buf);
      assert.ok(firstLine);
      const emptyLine = decodeHttpLine(buf, firstLine.length + 2);
      assert.ok(emptyLine);
      assert.strictEqual(emptyLine.length, 0);
    });
  });
});
