import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { decodeHttpLine } from './http-line.js';

const CR = 0x0d;
const LF = 0x0a;

describe('decodeHttpLine', () => {
  describe('参数验证', () => {
    const validBuffer = Buffer.from('test\r\n');

    describe('start 参数', () => {
      it('应该拒绝非整数的 start', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 1.5),
          {
            name: 'TypeError',
            message: 'start must be a non-negative integer',
          },
        );
      });

      it('应该拒绝负数的 start', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, -1),
          {
            name: 'TypeError',
            message: 'start must be a non-negative integer',
          },
        );
      });

      it('应该拒绝超出 buffer 范围的 start', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 100),
          {
            name: 'RangeError',
            message: /start \(100\) exceeds buffer length/,
          },
        );
      });

      it('应该接受 start 为 0', () => {
        const result = decodeHttpLine(validBuffer, 0);
        assert.strictEqual(result?.toString(), 'test');
      });

      it('应该接受有效的 start 值', () => {
        const buf = Buffer.from('abc\r\ntest\r\n');
        const result = decodeHttpLine(buf, 5);
        assert.strictEqual(result?.toString(), 'test');
      });

      it('应该拒绝 start 等于 buffer.length', () => {
        const buf = Buffer.from('test\r\n');
        assert.throws(
          () => decodeHttpLine(buf, buf.length),
          {
            name: 'RangeError',
          },
        );
      });
    });

    describe('limit 参数', () => {
      it('应该拒绝 limit 为 0', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 0, 0),
          {
            name: 'TypeError',
            message: 'limit must be a positive integer',
          },
        );
      });

      it('应该拒绝负数的 limit', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 0, -10),
          {
            name: 'TypeError',
            message: 'limit must be a positive integer',
          },
        );
      });

      it('应该拒绝非整数的 limit', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 0, 10.5),
          {
            name: 'TypeError',
            message: 'limit must be a positive integer',
          },
        );
      });

      it('应该接受有效的 limit 值', () => {
        const buf = Buffer.from('test\r\n');
        const result = decodeHttpLine(buf, 0, 100);
        assert.strictEqual(result?.toString(), 'test');
      });
    });
  });

  describe('边界情况', () => {
    it('应该对空 buffer 返回 null', () => {
      const result = decodeHttpLine(Buffer.alloc(0));
      assert.strictEqual(result, null);
    });

    it('应该在空 buffer 但 start 不为 0 时抛出 RangeError', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.alloc(0), 1),
        { name: 'RangeError' },
      );
    });

    it('应该对单字节 buffer 返回 null', () => {
      assert.strictEqual(decodeHttpLine(Buffer.from('a')), null);
    });

    it('应该对不完整的行返回 null', () => {
      assert.strictEqual(decodeHttpLine(Buffer.from('incomplete line')), null);
    });

    it('应该对只有 CR 的 buffer 返回 null', () => {
      assert.strictEqual(decodeHttpLine(Buffer.from('test\r')), null);
    });

    it('应该处理最小的有效行', () => {
      const buf = Buffer.from('a\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'a');
    });
  });

  describe('CRLF 正常解析', () => {
    it('应该解码简单的 CRLF 结尾的行', () => {
      const result = decodeHttpLine(Buffer.from('Hello World\r\n'));
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Hello World');
    });

    it('应该解码空行（仅 CRLF）', () => {
      const result = decodeHttpLine(Buffer.from('\r\n'));
      assert.ok(result);
      assert.strictEqual(result.length, 0);
      assert.strictEqual(result.toString(), '');
    });

    it('应该解码包含特殊字符的行', () => {
      const result = decodeHttpLine(Buffer.from('Content-Type: application/json; charset=utf-8\r\n'));
      assert.strictEqual(result?.toString(), 'Content-Type: application/json; charset=utf-8');
    });

    it('应该解码包含中文的行', () => {
      const result = decodeHttpLine(Buffer.from('你好世界\r\n'));
      assert.strictEqual(result?.toString(), '你好世界');
    });

    it('应该解码包含二进制数据的行', () => {
      const buf = Buffer.from([0x01, 0x02, 0x03, CR, LF]);
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual([...result], [0x01, 0x02, 0x03]);
    });

    it('应该处理多行数据，仅返回第一行', () => {
      const result = decodeHttpLine(Buffer.from('Line1\r\nLine2\r\nLine3\r\n'));
      assert.strictEqual(result?.toString(), 'Line1');
    });
  });

  describe('从指定位置开始解析', () => {
    it('应该从指定的 start 位置开始解析', () => {
      const buf = Buffer.from('skip\r\nHello\r\n');
      const result = decodeHttpLine(buf, 6);
      assert.strictEqual(result?.toString(), 'Hello');
    });

    it('应该正确处理不同的 start 偏移量', () => {
      const buf = Buffer.from('abc\r\n');
      assert.strictEqual(decodeHttpLine(buf, 1)?.toString(), 'bc');
      assert.strictEqual(decodeHttpLine(buf, 2)?.toString(), 'c');
      assert.strictEqual(decodeHttpLine(buf, 3)?.toString(), '');
    });

    it('应该能够连续读取多行', () => {
      const buf = Buffer.from('Line1\r\nLine2\r\nLine3\r\n');

      const line1 = decodeHttpLine(buf, 0);
      assert.ok(line1);
      assert.strictEqual(line1.toString(), 'Line1');

      const line2 = decodeHttpLine(buf, 7);
      assert.ok(line2);
      assert.strictEqual(line2.toString(), 'Line2');

      const line3 = decodeHttpLine(buf, 14);
      assert.ok(line3);
      assert.strictEqual(line3.toString(), 'Line3');
    });
  });

  describe('协议错误检测 - Bare LF', () => {
    it('应该拒绝以 LF 开头的 buffer', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('\ntest')),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_LF;
        },
      );
    });

    it('应该拒绝包含 bare LF 的行', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('test\nmore')),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_LF;
        },
      );
    });

    it('应该拒绝 LF 前没有 CR 的情况', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('Hello\nWorld\r\n')),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_LF;
        },
      );
    });
  });

  describe('协议错误检测 - Bare CR', () => {
    it('应该拒绝 CR 后没有 LF 的情况', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('test\rmore')),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_CR;
        },
      );
    });

    it('应该拒绝 CR 后跟其他字符的情况', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('Hello\rWorld')),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_CR;
        },
      );
    });

    it('应该拒绝行尾只有 CR 的情况', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('test\rmore\r\n')),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_CR;
        },
      );
    });
  });

  describe('行长度限制', () => {
    it('应该接受在限制内的行', () => {
      const content = 'A'.repeat(100);
      const buf = Buffer.from(`${content}\r\n`);
      const result = decodeHttpLine(buf, 0, 200);
      assert.ok(result);
      assert.strictEqual(result.length, 100);
      assert.strictEqual(result.toString(), content);
    });

    it('应该在行长度超过限制时抛出错误', () => {
      const buf = Buffer.from('A'.repeat(1000) + '\r\n');
      assert.throws(
        () => decodeHttpLine(buf, 0, 100),
        (err: HttpDecodeError) => {
          return (
            err.code === HttpDecodeErrorCode.MESSAGE_TOO_LARGE &&
            err.message.includes('exceeds limit of 100 bytes')
          );
        },
      );
    });

    it('应该在不完整但超限的行抛出错误', () => {
      const buf = Buffer.from('A'.repeat(200));
      assert.throws(
        () => decodeHttpLine(buf, 0, 100),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.MESSAGE_TOO_LARGE;
        },
      );
    });

    it('应该使用默认的 16KB 限制', () => {
      const buf = Buffer.from('A'.repeat(20000) + '\r\n');
      assert.throws(
        () => decodeHttpLine(buf),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.MESSAGE_TOO_LARGE;
        },
      );
    });

    it('应该在行长度等于限制-1时正常解析', () => {
      const buf = Buffer.from('A'.repeat(50) + '\r\n');
      const result = decodeHttpLine(buf, 0, 51);
      assert.ok(result);
      assert.strictEqual(result.length, 50);
    });

    it('应该能够处理大行（在默认限制内）', () => {
      const largeContent = 'A'.repeat(15 * 1024);
      const buf = Buffer.from(`${largeContent}\r\n`);
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.length, 15 * 1024);
    });
  });

  describe('HTTP 实际场景', () => {
    it('应该解析 HTTP 请求行', () => {
      const result = decodeHttpLine(Buffer.from('GET /api/users?id=123 HTTP/1.1\r\n'));
      assert.ok(result);
      assert.strictEqual(result.toString(), 'GET /api/users?id=123 HTTP/1.1');
    });

    it('应该解析 HTTP 响应状态行', () => {
      const result = decodeHttpLine(Buffer.from('HTTP/1.1 200 OK\r\n'));
      assert.ok(result);
      assert.strictEqual(result.toString(), 'HTTP/1.1 200 OK');
    });

    it('应该解析 HTTP 头部', () => {
      const result = decodeHttpLine(Buffer.from('Content-Type: application/json\r\n'));
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Content-Type: application/json');
    });

    it('应该解析包含多个空格的头部', () => {
      const result = decodeHttpLine(Buffer.from('User-Agent:   Mozilla/5.0   \r\n'));
      assert.ok(result);
      assert.strictEqual(result.toString(), 'User-Agent:   Mozilla/5.0   ');
    });

    it('应该识别空行作为头部结束标志', () => {
      const buf = Buffer.from('Header: value\r\n\r\nBody');

      const firstLine = decodeHttpLine(buf);
      assert.ok(firstLine);
      assert.strictEqual(firstLine.toString(), 'Header: value');

      const emptyLine = decodeHttpLine(buf, firstLine.length + 2);
      assert.ok(emptyLine);
      assert.strictEqual(emptyLine.length, 0);
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
        const line = decodeHttpLine(buf, offset);
        if (line === null) break;

        lines.push(line.toString());
        offset += line.length + 2;

        if (line.length === 0) break;
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
        const line = decodeHttpLine(buf, offset);
        if (line === null) break;

        count++;
        offset += line.length + 2;
      }

      assert.strictEqual(count, 100);
    });
  });

  describe('性能和特殊数据', () => {
    it('应该处理纯二进制数据', () => {
      const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, CR, LF]);
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Hello');
    });

    it('应该处理包含 NULL 字节的数据', () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, CR, LF]);
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.length, 3);
    });

    it('应该处理高位字节数据', () => {
      const buf = Buffer.from([0xFF, 0xFE, 0xFD, CR, LF]);
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.length, 3);
    });
  });
});
