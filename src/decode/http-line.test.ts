import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, it, test } from 'node:test';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import {
  decodeHttpLine,
  validateParameters,
} from './http-line.js';

const CR = 0x0d;
const LF = 0x0a;

describe('decodeHttpLine', () => {
  describe('参数验证', () => {
    const validBuffer = Buffer.from('test\r\n');

    describe('offset 参数', () => {
      it('应该拒绝非整数的 offset', () => {
        assert.throws(
          () => validateParameters(validBuffer, 1.5, { maxLineLength: 100 }),
          {
            name: 'TypeError',
            message: 'offset must be a non-negative integer',
          },
        );
      });

      it('应该拒绝负数的 offset', () => {
        assert.throws(
          () => validateParameters(validBuffer, -1, { maxLineLength: 100 }),
          {
            name: 'TypeError',
            message: 'offset must be a non-negative integer',
          },
        );
      });

      it('应该拒绝超出 buffer 范围的 offset', () => {
        assert.throws(
          () => validateParameters(validBuffer, 100, { maxLineLength: 100 }),
          {
            name: 'RangeError',
            message: /offset \(100\) exceeds buffer length/,
          },
        );
      });

      it('应该接受 offset 为 0', () => {
        const result = decodeHttpLine(validBuffer, 0, { maxLineLength: 100 });
        assert.strictEqual(result?.line.toString(), 'test');
      });

      it('应该接受有效的 offset 值', () => {
        const buf = Buffer.from('abc\r\ntest\r\n');
        const result = decodeHttpLine(buf, 5, { maxLineLength: 100 });
        assert.strictEqual(result?.line.toString(), 'test');
      });

      it('应该拒绝 offset 等于 buffer.length', () => {
        const buf = Buffer.from('test\r\n');
        assert.throws(
          () => validateParameters(buf, buf.length, { maxLineLength: 100 }),
          {
            name: 'RangeError',
          },
        );
      });
    });

    describe('limit 参数', () => {
      it('应该拒绝 maxLineLength 为 0', () => {
        assert.throws(
          () => validateParameters(validBuffer, 0, { maxLineLength: 0 }),
          {
            name: 'TypeError',
            message: 'maxLineLength must be a positive integer',
          },
        );
      });

      it('应该拒绝负数的 maxLineLength', () => {
        assert.throws(
          () => validateParameters(validBuffer, 0, { maxLineLength: -10 }),
          {
            name: 'TypeError',
            message: 'maxLineLength must be a positive integer',
          },
        );
      });

      it('应该拒绝非整数的 maxLineLength', () => {
        assert.throws(
          () => validateParameters(validBuffer, 0, { maxLineLength: 10.5 }),
          {
            name: 'TypeError',
            message: 'maxLineLength must be a positive integer',
          },
        );
      });

      it('应该接受有效的 maxLineLength 值', () => {
        const buf = Buffer.from('test\r\n');
        const result = decodeHttpLine(buf, 0, { maxLineLength: 100 });
        assert.strictEqual(result?.line.toString(), 'test');
      });
    });
  });

  describe('边界情况', () => {
    it('应该对空 buffer 返回 null', () => {
      const result = decodeHttpLine(Buffer.alloc(0), 0, { maxLineLength: 100 });
      assert.strictEqual(result, null);
    });

    it('应该在空 buffer 但 offset 不为 0 时抛出 RangeError', () => {
      assert.throws(
        () => validateParameters(Buffer.alloc(0), 1, { maxLineLength: 100 }),
        { name: 'RangeError' },
      );
    });

    it('应该对单字节 buffer 返回 null', () => {
      const result = decodeHttpLine(Buffer.from('a'), 0, { maxLineLength: 100 });
      assert.strictEqual(result, null);
    });

    it('应该对不完整的行返回 null', () => {
      const result = decodeHttpLine(Buffer.from('incomplete line'), 0, { maxLineLength: 100 });
      assert.strictEqual(result, null);
    });

    it('应该对只有 CR 的 buffer 返回 null', () => {
      const result = decodeHttpLine(Buffer.from('test\r'), 0, { maxLineLength: 100 });
      assert.strictEqual(result, null);
    });

    it('应该处理最小的有效行', () => {
      const buf = Buffer.from('a\r\n');
      const result = decodeHttpLine(buf, 0, { maxLineLength: 100 });
      assert.ok(result);
      assert.strictEqual(result.line.toString(), 'a');
    });
  });

  describe('CRLF 正常解析', () => {
    it('应该解码简单的 CRLF 结尾的行', () => {
      const result = decodeHttpLine(Buffer.from('Hello World\r\n'), 0, { maxLineLength: 100 });
      assert.ok(result);
      assert.strictEqual(result.line.toString(), 'Hello World');
    });

    it('应该解码空行（仅 CRLF）', () => {
      const result = decodeHttpLine(Buffer.from('\r\n'), 0, { maxLineLength: 100 });
      assert.ok(result);
      assert.strictEqual(result.line.length, 0);
      assert.strictEqual(result.line.toString(), '');
    });

    it('应该解码包含特殊字符的行', () => {
      const result = decodeHttpLine(Buffer.from('Content-Type: application/json; charset=utf-8\r\n'), 0, { maxLineLength: 200 });
      assert.strictEqual(result?.line.toString(), 'Content-Type: application/json; charset=utf-8');
    });

    it('应该解码包含中文的行', () => {
      const result = decodeHttpLine(Buffer.from('你好世界\r\n'), 0, { maxLineLength: 100 });
      assert.strictEqual(result?.line.toString(), '你好世界');
    });

    it('应该解码包含二进制数据的行', () => {
      const buf = Buffer.from([0x01, 0x02, 0x03, CR, LF]);
      const result = decodeHttpLine(buf, 0, { maxLineLength: 100 });
      assert.ok(result);
      assert.strictEqual(result.line.length, 3);
      assert.deepStrictEqual([...result.line], [0x01, 0x02, 0x03]);
    });

    it('应该处理多行数据，仅返回第一行', () => {
      const result = decodeHttpLine(Buffer.from('Line1\r\nLine2\r\nLine3\r\n'), 0, { maxLineLength: 100 });
      assert.strictEqual(result?.line.toString(), 'Line1');
    });
  });

  describe('从指定位置开始解析', () => {
    it('应该从指定的 offset 位置开始解析', () => {
      const buf = Buffer.from('skip\r\nHello\r\n');
      const result = decodeHttpLine(buf, 6, { maxLineLength: 100 });
      assert.strictEqual(result?.line.toString(), 'Hello');
    });

    it('应该正确处理不同的 offset 偏移量', () => {
      const buf = Buffer.from('abc\r\n');
      assert.strictEqual(decodeHttpLine(buf, 1, { maxLineLength: 100 })?.line.toString(), 'bc');
      assert.strictEqual(decodeHttpLine(buf, 2, { maxLineLength: 100 })?.line.toString(), 'c');
      assert.strictEqual(decodeHttpLine(buf, 3, { maxLineLength: 100 })?.line.toString(), '');
    });

    it('应该能够连续读取多行', () => {
      const buf = Buffer.from('Line1\r\nLine2\r\nLine3\r\n');

      const line1 = decodeHttpLine(buf, 0, { maxLineLength: 100 });
      assert.ok(line1);
      assert.strictEqual(line1.line.toString(), 'Line1');

      const line2 = decodeHttpLine(buf, line1.bytesConsumed, { maxLineLength: 100 });
      assert.ok(line2);
      assert.strictEqual(line2.line.toString(), 'Line2');

      const line3 = decodeHttpLine(buf, line1.bytesConsumed + line2.bytesConsumed, { maxLineLength: 100 });
      assert.ok(line3);
      assert.strictEqual(line3.line.toString(), 'Line3');
    });
  });

  describe('协议错误检测 - Bare LF', () => {
    it('应该拒绝以 LF 开头的 buffer', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('\ntest'), 0, { maxLineLength: 100 }),
        (err) => {
          return err.code === HttpDecodeErrorCode.INVALID_LINE_ENDING;
        },
      );
    });

    it('应该拒绝包含 bare LF 的行', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('test\nmore'), 0, { maxLineLength: 100 }),
        (err) => {
          return err.code === HttpDecodeErrorCode.INVALID_LINE_ENDING;
        },
      );
    });

    it('应该拒绝 LF 前没有 CR 的情况', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('Hello\nWorld\r\n'), 0, { maxLineLength: 100 }),
        (err) => {
          return err.code === HttpDecodeErrorCode.INVALID_LINE_ENDING;
        },
      );
    });
  });

  describe('协议错误检测 - Bare CR', () => {
    it('应该拒绝 CR 后没有 LF 的情况', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('test\rmore'), 0, { maxLineLength: 100 }),
        (err) => {
          return err.code === HttpDecodeErrorCode.INVALID_LINE_ENDING;
        },
      );
    });

    it('应该拒绝 CR 后跟其他字符的情况', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('Hello\rWorld'), 0, { maxLineLength: 100 }),
        (err) => {
          return err.code === HttpDecodeErrorCode.INVALID_LINE_ENDING;
        },
      );
    });

    it('应该拒绝行尾只有 CR 的情况', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('test\rmore\r\n'), 0, { maxLineLength: 100 }),
        (err) => {
          return err.code === HttpDecodeErrorCode.INVALID_LINE_ENDING;
        },
      );
    });
  });

  describe('行长度限制', () => {
    it('应该接受在限制内的行', () => {
      const content = 'A'.repeat(100);
      const buf = Buffer.from(`${content}\r\n`);
      const result = decodeHttpLine(buf, 0, { maxLineLength: 200 });
      assert.ok(result);
      assert.strictEqual(result.line.length, 100);
      assert.strictEqual(result.line.toString(), content);
    });

    it('应该在行长度超过限制时抛出错误', () => {
      const buf = Buffer.from('A'.repeat(1000) + '\r\n');
      assert.throws(
        () => decodeHttpLine(buf, 0, { maxLineLength: 100 }),
        (err) => {
          return (
            err.code === HttpDecodeErrorCode.LINE_TOO_LARGE &&
            err.message.includes('HTTP line exceeds maximum length')
          );
        },
      );
    });

    it('应该在不完整但超限的行抛出错误', () => {
      const buf = Buffer.from('A'.repeat(200));
      assert.throws(
        () => decodeHttpLine(buf, 0, { maxLineLength: 100 }),
        (err) => {
          return err.code === HttpDecodeErrorCode.LINE_TOO_LARGE;
        },
      );
    });

    it('应该在行长度等于限制-1时正常解析', () => {
      const buf = Buffer.from('A'.repeat(50) + '\r\n');
      const result = decodeHttpLine(buf, 0, { maxLineLength: 51 });
      assert.ok(result);
      assert.strictEqual(result.line.length, 50);
    });

    it('应该能够处理大行（在默认限制内）', () => {
      const largeContent = 'A'.repeat(15 * 1024);
      const buf = Buffer.from(`${largeContent}\r\n`);
      const result = decodeHttpLine(buf, 0, { maxLineLength: 16 * 1024 });
      assert.ok(result);
      assert.strictEqual(result.line.length, 15 * 1024);
    });
  });

  describe('HTTP 实际场景', () => {
    it('应该解析 HTTP 请求行', () => {
      const result = decodeHttpLine(Buffer.from('GET /api/users?id=123 HTTP/1.1\r\n'), 0, { maxLineLength: 1024 });
      assert.ok(result);
      assert.strictEqual(result.line.toString(), 'GET /api/users?id=123 HTTP/1.1');
    });

    it('应该解析 HTTP 响应状态行', () => {
      const result = decodeHttpLine(Buffer.from('HTTP/1.1 200 OK\r\n'), 0, { maxLineLength: 1024 });
      assert.ok(result);
      assert.strictEqual(result.line.toString(), 'HTTP/1.1 200 OK');
    });

    it('应该解析 HTTP 头部', () => {
      const result = decodeHttpLine(Buffer.from('Content-Type: application/json\r\n'), 0, { maxLineLength: 1024 });
      assert.ok(result);
      assert.strictEqual(result.line.toString(), 'Content-Type: application/json');
    });

    it('应该解析包含多个空格的头部', () => {
      const result = decodeHttpLine(Buffer.from('User-Agent:   Mozilla/5.0   \r\n'), 0, { maxLineLength: 1024 });
      assert.ok(result);
      assert.strictEqual(result.line.toString(), 'User-Agent:   Mozilla/5.0   ');
    });

    it('应该识别空行作为头部结束标志', () => {
      const buf = Buffer.from('Header: value\r\n\r\nBody');

      const firstLine = decodeHttpLine(buf, 0, { maxLineLength: 1024 });
      assert.ok(firstLine);
      assert.strictEqual(firstLine.line.toString(), 'Header: value');

      const emptyLine = decodeHttpLine(buf, firstLine.bytesConsumed, { maxLineLength: 1024 });
      assert.ok(emptyLine);
      assert.strictEqual(emptyLine.line.length, 0);
    });

    it('应该处理完整的 HTTP 头部解析流程', () => {
      const headers = [
        'GET / HTTP/1.1',
        'Host: example.com',
        'User-Agent: Test/1.0',
        'Accept: */*',
        '',
      ].join('\r\n') + '\r\n';

      const buf = Buffer.from(headers);
      const lines: string[] = [];
      let offset = 0;

      while (offset < buf.length) {
        const line = decodeHttpLine(buf, offset, { maxLineLength: 1024 });
        if (line === null) break;

        lines.push(line.line.toString());
        offset += line.bytesConsumed;

        if (line.line.length === 0) break;
      }

      assert.strictEqual(lines.length, 5);
      assert.strictEqual(lines[0], 'GET / HTTP/1.1');
      assert.strictEqual(lines[1], 'Host: example.com');
      assert.strictEqual(lines[2], 'User-Agent: Test/1.0');
      assert.strictEqual(lines[3], 'Accept: */*');
      assert.strictEqual(lines[4], '');
    });

    it('应该处理包含大量行的 buffer', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Header-${i}: value-${i}`);
      const content = lines.join('\r\n') + '\r\n';
      const buf = Buffer.from(content);

      let offset = 0;
      let count = 0;

      while (offset < buf.length) {
        const line = decodeHttpLine(buf, offset, { maxLineLength: 1024 });
        if (line === null) break;

        count++;
        offset += line.bytesConsumed;
      }

      assert.strictEqual(count, 100);
    });
  });

  describe('性能和特殊数据', () => {
    it('应该处理纯二进制数据', () => {
      const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, CR, LF]);
      const result = decodeHttpLine(buf, 0, { maxLineLength: 100 });
      assert.ok(result);
      assert.strictEqual(result.line.toString(), 'Hello');
    });

    it('应该处理包含 NULL 字节的数据', () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, CR, LF]);
      const result = decodeHttpLine(buf, 0, { maxLineLength: 100 });
      assert.ok(result);
      assert.strictEqual(result.line.length, 3);
    });

    it('应该处理高位字节数据', () => {
      const buf = Buffer.from([0xFF, 0xFE, 0xFD, CR, LF]);
      const result = decodeHttpLine(buf, 0, { maxLineLength: 100 });
      assert.ok(result);
      assert.strictEqual(result.line.length, 3);
    });
  });
});

const buf = (s: string) => Buffer.from(s, 'ascii');

test('decodeHttpLine - basic CRLF line', () => {
  const buffer = buf('GET / HTTP/1.1\r\n');

  const result = decodeHttpLine(buffer, 0, { maxLineLength: 1024 });

  assert.ok(result);
  assert.strictEqual(result.bytesConsumed, buffer.length);
  assert.strictEqual(
    result.line.toString(),
    'GET / HTTP/1.1',
  );
});

test('decodeHttpLine - offset works correctly', () => {
  const buffer = buf('XXXGET / HTTP/1.1\r\n');

  const result = decodeHttpLine(buffer, 3, { maxLineLength: 1024 });

  assert.ok(result);
  assert.strictEqual(
    result.line.toString(),
    'GET / HTTP/1.1',
  );
});

test('decodeHttpLine - incomplete line returns null', () => {
  const buffer = buf('GET / HTTP/1.1\r');

  const result = decodeHttpLine(buffer, 0, { maxLineLength: 1024 });

  assert.strictEqual(result, null);
});

test('decodeHttpLine - LF without CR throws', () => {
  const buffer = buf('GET / HTTP/1.1\n');

  assert.throws(
    () => decodeHttpLine(buffer, 0, { maxLineLength: 1024 }),
    (err: unknown) => {
      assert.ok(err instanceof HttpDecodeError);
      assert.strictEqual(
        err.code,
        HttpDecodeErrorCode.INVALID_LINE_ENDING,
      );
      return true;
    },
  );
});

test('decodeHttpLine - CR not followed by LF throws', () => {
  const buffer = buf('GET / HTTP/1.1\rX');

  assert.throws(
    () => decodeHttpLine(buffer, 0, { maxLineLength: 1024 }),
    (err: unknown) => {
      assert.ok(err instanceof HttpDecodeError);
      assert.strictEqual(
        err.code,
        HttpDecodeErrorCode.INVALID_LINE_ENDING,
      );
      return true;
    },
  );
});

test('decodeHttpLine - line too long throws', () => {
  const buffer = buf('A'.repeat(5) + '\r\n');

  assert.throws(
    () => decodeHttpLine(buffer, 0, { maxLineLength: 4 }),
    (err: unknown) => {
      assert.ok(err instanceof HttpDecodeError);
      assert.strictEqual(
        err.code,
        HttpDecodeErrorCode.LINE_TOO_LARGE,
      );
      return true;
    },
  );
});

test('decodeHttpLine - empty buffer with offset 0 returns null', () => {
  const buffer = Buffer.alloc(0);

  const result = decodeHttpLine(buffer, 0, { maxLineLength: 1024 });

  assert.strictEqual(result, null);
});

test('decodeHttpLine - offset out of range throws', () => {
  const buffer = buf('GET / HTTP/1.1\r\n');

  assert.throws(
    () => decodeHttpLine(buffer, buffer.length, { maxLineLength: 1024 }),
    RangeError,
  );
});

test('decodeHttpLine - invalid maxLineLength throws', () => {
  const buffer = buf('GET / HTTP/1.1\r\n');

  assert.throws(
    () => decodeHttpLine(buffer, 0, { maxLineLength: 0 }),
    TypeError,
  );
});
