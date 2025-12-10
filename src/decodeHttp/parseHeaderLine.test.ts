import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { DecodeHttpError } from '../errors.js';
import parseHeaderLine from './parseHeaderLine.js';

describe('parseHeaderLine', () => {
  describe('正常情况', () => {
    it('应该正确解析标准的 HTTP header', () => {
      const [name, value] = parseHeaderLine('Content-Type: application/json');
      assert.strictEqual(name, 'Content-Type');
      assert.strictEqual(value, 'application/json');
    });

    it('应该正确处理带空格的 header', () => {
      const [name, value] = parseHeaderLine('Authorization:   Bearer token123  ');
      assert.strictEqual(name, 'Authorization');
      assert.strictEqual(value, 'Bearer token123');
    });

    it('应该正确处理没有额外空格的 header', () => {
      const [name, value] = parseHeaderLine('Host:example.com');
      assert.strictEqual(name, 'Host');
      assert.strictEqual(value, 'example.com');
    });

    it('应该正确处理包含多个冒号的 value', () => {
      const [name, value] = parseHeaderLine('X-Custom: value:with:colons');
      assert.strictEqual(name, 'X-Custom');
      assert.strictEqual(value, 'value:with:colons');
    });

    it('应该正确处理长 header 值', () => {
      const longValue = 'a'.repeat(1000);
      const [name, value] = parseHeaderLine(`Content-Length: ${longValue}`);
      assert.strictEqual(name, 'Content-Length');
      assert.strictEqual(value, longValue);
    });

    it('应该正确处理特殊字符', () => {
      const [name, value] = parseHeaderLine('Set-Cookie: session=abc123; Path=/; HttpOnly');
      assert.strictEqual(name, 'Set-Cookie');
      assert.strictEqual(value, 'session=abc123; Path=/; HttpOnly');
    });
  });

  describe('错误情况', () => {
    it('应该在缺少冒号时抛出错误', () => {
      assert.throws(
        () => parseHeaderLine('InvalidHeader'),
        (error: Error) => {
          return error instanceof DecodeHttpError &&
                 error.message.includes('missing') &&
                 error.message.includes('InvalidHeader');
        },
      );
    });

    it('应该在 name 为空时抛出错误', () => {
      assert.throws(
        () => parseHeaderLine(': value'),
        (error: Error) => {
          return error instanceof DecodeHttpError &&
                 error.message.includes('empty name');
        },
      );
    });

    it('应该在 name 只有空格时抛出错误', () => {
      assert.throws(
        () => parseHeaderLine('   : value'),
        (error: Error) => {
          return error instanceof DecodeHttpError &&
                 error.message.includes('empty name');
        },
      );
    });

    it('应该在 value 为空时抛出错误', () => {
      assert.throws(
        () => parseHeaderLine('Content-Type:'),
        (error: Error) => {
          return error instanceof DecodeHttpError &&
                 error.message.includes('empty value');
        },
      );
    });

    it('应该在 value 只有空格时抛出错误', () => {
      assert.throws(
        () => parseHeaderLine('Content-Type:   '),
        (error: Error) => {
          return error instanceof DecodeHttpError &&
                 error.message.includes('empty value');
        },
      );
    });

    it('应该在空字符串时抛出错误', () => {
      assert.throws(
        () => parseHeaderLine(''),
        (error: Error) => {
          return error instanceof DecodeHttpError;
        },
      );
    });

    it('应该在只有冒号时抛出错误', () => {
      assert.throws(
        () => parseHeaderLine(':'),
        (error: Error) => {
          return error instanceof DecodeHttpError &&
                 error.message.includes('empty');
        },
      );
    });
  });

  describe('边界情况', () => {
    it('应该正确处理单字符的 name 和 value', () => {
      const [name, value] = parseHeaderLine('A: B');
      assert.strictEqual(name, 'A');
      assert.strictEqual(value, 'B');
    });

    it('应该正确处理数字作为 value', () => {
      const [name, value] = parseHeaderLine('Content-Length: 12345');
      assert.strictEqual(name, 'Content-Length');
      assert.strictEqual(value, '12345');
    });

    it('应该正确处理 value 开头的冒号', () => {
      const [name, value] = parseHeaderLine('X-Custom: :startWithColon');
      assert.strictEqual(name, 'X-Custom');
      assert.strictEqual(value, ':startWithColon');
    });
  });
});
