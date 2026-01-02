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
      it('应该在 start 不是整数时抛出 TypeError', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 1.5),
          {
            name: 'TypeError',
            message: /start must be a non-negative integer/,
          },
        );
      });

      it('应该在 start 为负数时抛出 TypeError', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, -1),
          {
            name: 'TypeError',
            message: /start must be a non-negative integer/,
          },
        );
      });

      it('应该在 start 超出 buffer 范围时抛出 RangeError', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 100),
          {
            name: 'RangeError',
            message: /exceeds buffer length/,
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
    });

    describe('limit 参数', () => {
      it('应该在 limit 为 0 时抛出 TypeError', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 0, 0),
          {
            name: 'TypeError',
            message: /limit must be a positive integer/,
          },
        );
      });

      it('应该在 limit 为负数时抛出 TypeError', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 0, -10),
          {
            name: 'TypeError',
            message: /limit must be a positive integer/,
          },
        );
      });

      it('应该在 limit 不是整数时抛出 TypeError', () => {
        assert.throws(
          () => decodeHttpLine(validBuffer, 0, 10.5),
          {
            name: 'TypeError',
            message: /limit must be a positive integer/,
          },
        );
      });
    });
  });

  describe('空 buffer 处理', () => {
    it('应该对空 buffer 返回 null', () => {
      const result = decodeHttpLine(Buffer.alloc(0));
      assert.strictEqual(result, null);
    });

    it('应该在空 buffer 但 start 不为 0 时抛出 RangeError', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.alloc(0), 1),
        {
          name: 'RangeError',
        },
      );
    });
  });

  describe('CRLF 解析', () => {
    it('应该正确解析以 CRLF 结尾的简单行', () => {
      const result = decodeHttpLine(Buffer.from('Hello World\r\n'));
      assert.strictEqual(result?.toString(), 'Hello World');
    });

    it('应该正确解析空行（仅 CRLF）', () => {
      const result = decodeHttpLine(Buffer.from('\r\n'));
      assert.ok(result);
      assert.strictEqual(result.length, 0);
      assert.strictEqual(result.toString(), '');
    });

    it('应该正确解析包含特殊字符的行', () => {
      const result = decodeHttpLine(Buffer.from('Content-Type: application/json\r\n'));
      assert.strictEqual(result?.toString(), 'Content-Type: application/json');
    });

    it('应该正确解析包含中文的行', () => {
      const result = decodeHttpLine(Buffer.from('你好世界\r\n'));
      assert.strictEqual(result?.toString(), '你好世界');
    });

    it('应该正确解析包含二进制数据的行', () => {
      const buf = Buffer.from([0x01, 0x02, 0x03, 0x0d, 0x0a]);
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual([...result], [0x01, 0x02, 0x03]);
    });

    it('应该处理多行数据，只返回第一行', () => {
      const result = decodeHttpLine(Buffer.from('Line1\r\nLine2\r\nLine3\r\n'));
      assert.strictEqual(result?.toString(), 'Line1');
    });

    it('应该不允许 CR', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('test\rmore\r\n')),
      );
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

    it('应该从 start 位置开始搜索，即使之前有 CRLF', () => {
      const buf = Buffer.from('first\r\nsecond\r\n');
      const result = decodeHttpLine(buf, 7);
      assert.strictEqual(result?.toString(), 'second');
    });

    it('应该能够连续读取多行', () => {
      const buf = Buffer.from('Line1\r\nLine2\r\nLine3\r\n');

      const line1 = decodeHttpLine(buf, 0);
      assert.strictEqual(line1?.toString(), 'Line1');

      const line2 = decodeHttpLine(buf, 7);
      assert.strictEqual(line2?.toString(), 'Line2');

      const line3 = decodeHttpLine(buf, 14);
      assert.strictEqual(line3?.toString(), 'Line3');
    });
  });

  describe('未找到完整行', () => {
    it('应该在找不到 CRLF 时返回 null', () => {
      assert.strictEqual(decodeHttpLine(Buffer.from('incomplete line')), null);
      assert.strictEqual(decodeHttpLine(Buffer.from('abcde')), null);
    });

    it('应该在只有 CR 没有 LF 时返回 null', () => {
      assert.strictEqual(decodeHttpLine(Buffer.from('Line\r')), null);
      assert.strictEqual(decodeHttpLine(Buffer.from('\r')), null);
    });

    it('应该在单字节 buffer 时返回 null', () => {
      assert.strictEqual(decodeHttpLine(Buffer.from('a')), null);
      assert.strictEqual(decodeHttpLine(Buffer.from('A')), null);
    });
  });

  describe('协议错误检测', () => {
    it('应该在起始位置是 LF 时抛出 DecodeHttpError', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('\nHello')),
      );
    });

    it('应该在 LF 前没有 CR 时抛出 DecodeHttpError', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('Hello\nWorld')),
      );

      assert.throws(
        () => decodeHttpLine(Buffer.from('test\n')),
      );
    });

    it('应该在中间出现单独的 LF 时抛出 DecodeHttpError', () => {
      assert.throws(
        () => decodeHttpLine(Buffer.from('test\nmore\r\n')),
      );
    });
  });

  describe('行长度限制', () => {
    it('应该在行长度超过限制时抛出 DecodeHttpError', () => {
      const buf = Buffer.from('A'.repeat(100) + '\r\n');
      assert.throws(
        () => decodeHttpLine(buf, 0, 50),
        {
          message: /line length exceeds limit/,
        },
      );
    });

    it('应该在未完成的行超过限制时抛出 DecodeHttpError', () => {
      const buf = Buffer.from('A'.repeat(100)); // 没有 CRLF
      assert.throws(
        () => decodeHttpLine(buf, 0, 50),
        {
          message: /line length exceeds limit/,
        },
      );
    });

    it('应该在限制内正确解析行', () => {
      const content = 'A'.repeat(10);
      const buf = Buffer.from(`${content}\r\n`);
      const result = decodeHttpLine(buf, 0, 15);
      assert.strictEqual(result?.toString(), content);
    });

    it('应该在行长度等于限制时返回 null（等待更多数据）', () => {
      const buf = Buffer.from('A'.repeat(50));
      const result = decodeHttpLine(buf, 0, 51);
      assert.strictEqual(result, null);
    });

    it('应该能够处理大行（在 limit 内）', () => {
      const largeContent = 'A'.repeat(15 * 1024);
      const buf = Buffer.from(`${largeContent}\r\n`);
      const result = decodeHttpLine(buf);
      assert.strictEqual(result?.length, 15 * 1024);
    });
  });

  describe('实际 HTTP 场景', () => {
    it('应该正确解析 HTTP 请求行', () => {
      const result = decodeHttpLine(Buffer.from('GET /path HTTP/1.1\r\n'));
      assert.strictEqual(result?.toString(), 'GET /path HTTP/1.1');
    });

    it('应该正确解析 HTTP 头部', () => {
      const result = decodeHttpLine(Buffer.from('Content-Type: application/json\r\n'));
      assert.strictEqual(result?.toString(), 'Content-Type: application/json');
    });

    it('应该正确解析空行（HTTP 头部结束标志）', () => {
      const buf = Buffer.from('Header: value\r\n\r\nBody');
      const firstLine = decodeHttpLine(buf);
      assert.ok(firstLine);
      assert.strictEqual(firstLine.toString(), 'Header: value');

      const emptyLine = decodeHttpLine(buf, firstLine.length + 2);
      assert.ok(emptyLine);
      assert.strictEqual(emptyLine.length, 0);
    });

    it('应该正确处理完整的 HTTP 头部解析流程', () => {
      const headers = 'GET / HTTP/1.1\r\nHost: example.com\r\nUser-Agent: Test\r\n\r\n';
      const buf = Buffer.from(headers);

      let offset = 0;
      const lines: string[] = [];

      while (offset < buf.length) {
        const line = decodeHttpLine(buf, offset);
        if (line === null) break;

        lines.push(line.toString());
        offset += line.length + 2; // +2 for CRLF

        // 空行表示头部结束
        if (line.length === 0) break;
      }

      assert.strictEqual(lines.length, 4);
      assert.strictEqual(lines[0], 'GET / HTTP/1.1');
      assert.strictEqual(lines[1], 'Host: example.com');
      assert.strictEqual(lines[2], 'User-Agent: Test');
      assert.strictEqual(lines[3], '');
    });

    it('应该能够处理包含大量行的 buffer', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line${i}`);
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
});

describe('decodeHttpLine', () => {
  describe('参数验证', () => {
    it('应该拒绝负数的 start', () => {
      const buf = Buffer.from('test\r\n');
      assert.throws(
        () => decodeHttpLine(buf, -1),
        { name: 'TypeError', message: 'start must be a non-negative integer' }
      );
    });

    it('应该拒绝非整数的 start', () => {
      const buf = Buffer.from('test\r\n');
      assert.throws(
        () => decodeHttpLine(buf, 1.5),
        { name: 'TypeError', message: 'start must be a non-negative integer' }
      );
    });

    it('应该拒绝非正数的 limit', () => {
      const buf = Buffer.from('test\r\n');
      assert.throws(
        () => decodeHttpLine(buf, 0, 0),
        { name: 'TypeError', message: 'limit must be a positive integer' }
      );
    });

    it('应该拒绝超出范围的 start', () => {
      const buf = Buffer.from('test');
      assert.throws(
        () => decodeHttpLine(buf, 10),
        { name: 'RangeError', message: /start \(10\) exceeds buffer length/ }
      );
    });
  });

  describe('边界情况', () => {
    it('应该对空 buffer 返回 null', () => {
      const buf = Buffer.alloc(0);
      const result = decodeHttpLine(buf);
      assert.strictEqual(result, null);
    });

    it('应该对单字节 buffer 返回 null', () => {
      const buf = Buffer.from('a');
      const result = decodeHttpLine(buf);
      assert.strictEqual(result, null);
    });

    it('应该对不完整的行返回 null', () => {
      const buf = Buffer.from('incomplete line');
      const result = decodeHttpLine(buf);
      assert.strictEqual(result, null);
    });

    it('应该对只有 CR 的 buffer 返回 null', () => {
      const buf = Buffer.from('test\r');
      const result = decodeHttpLine(buf);
      assert.strictEqual(result, null);
    });
  });

  describe('正常解码', () => {
    it('应该解码简单的 CRLF 结尾的行', () => {
      const buf = Buffer.from('Hello World\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Hello World');
    });

    it('应该解码空行', () => {
      const buf = Buffer.from('\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.length, 0);
    });

    it('应该从指定位置开始解码', () => {
      const buf = Buffer.from('skip\r\nHello\r\n');
      const result = decodeHttpLine(buf, 6);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Hello');
    });

    it('应该解码包含特殊字符的行', () => {
      const buf = Buffer.from('GET /path?query=value HTTP/1.1\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'GET /path?query=value HTTP/1.1');
    });

    it('应该处理 buffer 中有多行的情况', () => {
      const buf = Buffer.from('first line\r\nsecond line\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'first line');
    });
  });

  describe('错误检测 - Bare LF', () => {
    it('应该拒绝以 LF 开头的 buffer', () => {
      const buf = Buffer.from('\ntest');
      assert.throws(
        () => decodeHttpLine(buf),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_LF;
        }
      );
    });

    it('应该拒绝包含 bare LF 的行', () => {
      const buf = Buffer.from('test\nmore');
      assert.throws(
        () => decodeHttpLine(buf),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_LF;
        }
      );
    });

    it('应该拒绝中间的 bare LF', () => {
      const buf = Buffer.from('Hello\nWorld\r\n');
      assert.throws(
        () => decodeHttpLine(buf),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_LF;
        }
      );
    });
  });

  describe('错误检测 - Bare CR', () => {
    it('应该拒绝 CR 后没有 LF 的情况', () => {
      const buf = Buffer.from('test\rmore');
      assert.throws(
        () => decodeHttpLine(buf),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_CR;
        }
      );
    });

    it('应该拒绝 CR 后跟其他字符的情况', () => {
      const buf = Buffer.from('Hello\rWorld');
      assert.throws(
        () => decodeHttpLine(buf),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.BARE_CR;
        }
      );
    });
  });

  describe('大小限制', () => {
    it('应该接受在限制内的行', () => {
      const buf = Buffer.from('a'.repeat(100) + '\r\n');
      const result = decodeHttpLine(buf, 0, 200);
      assert.ok(result);
      assert.strictEqual(result.length, 100);
    });

    it('应该拒绝超过限制的行', () => {
      const buf = Buffer.from('a'.repeat(1000) + '\r\n');
      assert.throws(
        () => decodeHttpLine(buf, 0, 100),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.MESSAGE_TOO_LARGE &&
                 err.message.includes('exceeds limit of 100 bytes');
        }
      );
    });

    it('应该使用默认的 16KB 限制', () => {
      const buf = Buffer.from('a'.repeat(20000) + '\r\n');
      assert.throws(
        () => decodeHttpLine(buf),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.MESSAGE_TOO_LARGE;
        }
      );
    });

    it('应该对不完整但超限的行抛出错误', () => {
      const buf = Buffer.from('a'.repeat(200));
      assert.throws(
        () => decodeHttpLine(buf, 0, 100),
        (err: HttpDecodeError) => {
          return err.code === HttpDecodeErrorCode.MESSAGE_TOO_LARGE;
        }
      );
    });
  });

  describe('复杂场景', () => {
    it('应该处理 HTTP 请求行', () => {
      const buf = Buffer.from('GET /api/users HTTP/1.1\r\nHost: example.com\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'GET /api/users HTTP/1.1');
    });

    it('应该处理 HTTP 响应状态行', () => {
      const buf = Buffer.from('HTTP/1.1 200 OK\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'HTTP/1.1 200 OK');
    });

    it('应该处理包含空格的 header', () => {
      const buf = Buffer.from('Content-Type: application/json\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Content-Type: application/json');
    });

    it('应该从中间位置正确解码', () => {
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

  describe('性能和边界', () => {
    it('应该处理最小的有效行', () => {
      const buf = Buffer.from('a\r\n');
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'a');
    });

    it('应该处理二进制数据', () => {
      const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, CR, LF]);
      const result = decodeHttpLine(buf);
      assert.ok(result);
      assert.strictEqual(result.toString(), 'Hello');
    });
  });
});
