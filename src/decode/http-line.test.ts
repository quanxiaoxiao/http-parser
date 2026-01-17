import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import {
 describe, it, test,
} from 'node:test';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { decodeHttpLine, validateParameters } from './http-line.js';

// 常量定义
const CR = 0x0d;
const LF = 0x0a;
const DEFAULT_MAX_LENGTH = 1024;

// 辅助函数
const buf = (s: string) => Buffer.from(s, 'ascii');
const createLine = (content: string) => `${content}\r\n`;
const repeat = (char: string, times: number) => char.repeat(times);

// 断言辅助函数
const assertHttpError = (
  fn: () => void,
  expectedCode: HttpDecodeErrorCode,
  message?: string,
) => {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof HttpDecodeError);
    assert.strictEqual(err.code, expectedCode);
    if (message) {
      assert.match(err.message, new RegExp(message));
    }
    return true;
  });
};

const assertLineEquals = (
  buffer: Buffer,
  offset: number,
  expected: string,
  maxLength = DEFAULT_MAX_LENGTH,
) => {
  const result = decodeHttpLine(buffer, offset, { maxLineLength: maxLength });
  assert.ok(result);
  assert.strictEqual(result.line.toString(), expected);
  return result;
};

describe('decodeHttpLine', () => {
  const validBuffer = buf(createLine('test'));

  describe('参数验证', () => {
    describe('offset 参数', () => {
      const testCases = [
        { offset: 1.5, error: 'TypeError', desc: '非整数' },
        { offset: -1, error: 'TypeError', desc: '负数' },
      ];

      testCases.forEach(({ offset, error, desc }) => {
        it(`应该拒绝${desc}的 offset`, () => {
          assert.throws(
            () => validateParameters(validBuffer, offset, { maxLineLength: 100 }),
            { name: error, message: 'offset must be a non-negative integer' },
          );
        });
      });

      it('应该拒绝超出 buffer 范围的 offset', () => {
        assert.throws(
          () => validateParameters(validBuffer, 100, { maxLineLength: 100 }),
          { name: 'RangeError', message: /offset \(100\) exceeds buffer length/ },
        );
      });

      it('应该接受有效的 offset 值', () => {
        assertLineEquals(validBuffer, 0, 'test', 100);

        const multiLine = buf('abc\r\ntest\r\n');
        assertLineEquals(multiLine, 5, 'test', 100);
      });

      it('应该拒绝 offset 等于 buffer.length', () => {
        assert.throws(
          () => validateParameters(validBuffer, validBuffer.length, { maxLineLength: 100 }),
          { name: 'RangeError' },
        );
      });
    });

    describe('maxLineLength 参数', () => {
      const invalidCases = [
        { value: 0, desc: '为 0' },
        { value: -10, desc: '负数' },
        { value: 10.5, desc: '非整数' },
      ];

      invalidCases.forEach(({ value, desc }) => {
        it(`应该拒绝 maxLineLength ${desc}`, () => {
          assert.throws(
            () => validateParameters(validBuffer, 0, { maxLineLength: value }),
            { name: 'TypeError', message: 'maxLineLength must be a positive integer' },
          );
        });
      });

      it('应该接受有效的 maxLineLength 值', () => {
        assertLineEquals(validBuffer, 0, 'test', 100);
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

    const incompleteCases = [
      { buffer: buf('a'), desc: '单字节 buffer' },
      { buffer: buf('incomplete line'), desc: '不完整的行' },
      { buffer: buf('test\r'), desc: '只有 CR 的 buffer' },
    ];

    incompleteCases.forEach(({ buffer, desc }) => {
      it(`应该对${desc}返回 null`, () => {
        const result = decodeHttpLine(buffer, 0, { maxLineLength: 100 });
        assert.strictEqual(result, null);
      });
    });

    it('应该处理最小的有效行', () => {
      assertLineEquals(buf('a\r\n'), 0, 'a', 100);
    });
  });

  describe('CRLF 正常解析', () => {
    const testCases = [
      { input: 'Hello World', desc: '简单的 CRLF 结尾的行' },
      { input: '', desc: '空行（仅 CRLF）' },
      { input: 'Content-Type: application/json; charset=utf-8', desc: '包含特殊字符的行', maxLen: 200 },
    ];

    testCases.forEach(({ input, desc, maxLen = 100 }) => {
      it(`应该解码${desc}`, () => {
        assertLineEquals(buf(createLine(input)), 0, input, maxLen);
      });
    });

    it('应该解码包含二进制数据的行', () => {
      const buffer = Buffer.from([0x01, 0x02, 0x03, CR, LF]);
      const result = decodeHttpLine(buffer, 0, { maxLineLength: 100 });
      assert.ok(result);
      assert.strictEqual(result.line.length, 3);
      assert.deepStrictEqual([...result.line], [0x01, 0x02, 0x03]);
    });

    it('应该处理多行数据，仅返回第一行', () => {
      assertLineEquals(buf('Line1\r\nLine2\r\nLine3\r\n'), 0, 'Line1');
    });
  });

  describe('从指定位置开始解析', () => {
    it('应该从指定的 offset 位置开始解析', () => {
      assertLineEquals(buf('skip\r\nHello\r\n'), 6, 'Hello');
    });

    it('应该正确处理不同的 offset 偏移量', () => {
      const buffer = buf('abc\r\n');
      assertLineEquals(buffer, 1, 'bc');
      assertLineEquals(buffer, 2, 'c');
      assertLineEquals(buffer, 3, '');
    });

    it('应该能够连续读取多行', () => {
      const buffer = buf('Line1\r\nLine2\r\nLine3\r\n');
      const expectedLines = ['Line1', 'Line2', 'Line3'];
      let offset = 0;

      expectedLines.forEach((expected) => {
        const result = assertLineEquals(buffer, offset, expected);
        offset += result.bytesConsumed;
      });
    });
  });

  describe('协议错误检测', () => {
    describe('Bare LF', () => {
      const bareLfCases = [
        { input: '\ntest', desc: '以 LF 开头的 buffer' },
        { input: 'test\nmore', desc: '包含 bare LF 的行' },
        { input: 'Hello\nWorld\r\n', desc: 'LF 前没有 CR 的情况' },
      ];

      bareLfCases.forEach(({ input, desc }) => {
        it(`应该拒绝${desc}`, () => {
          assertHttpError(
            () => decodeHttpLine(buf(input), 0, { maxLineLength: 100 }),
            HttpDecodeErrorCode.INVALID_LINE_ENDING,
          );
        });
      });
    });

    describe('Bare CR', () => {
      const bareCrCases = [
        { input: 'test\rmore', desc: 'CR 后没有 LF 的情况' },
        { input: 'Hello\rWorld', desc: 'CR 后跟其他字符的情况' },
        { input: 'test\rmore\r\n', desc: '行尾只有 CR 的情况' },
      ];

      bareCrCases.forEach(({ input, desc }) => {
        it(`应该拒绝${desc}`, () => {
          assertHttpError(
            () => decodeHttpLine(buf(input), 0, { maxLineLength: 100 }),
            HttpDecodeErrorCode.INVALID_LINE_ENDING,
          );
        });
      });
    });
  });

  describe('行长度限制', () => {
    it('应该接受在限制内的行', () => {
      const content = repeat('A', 100);
      const result = assertLineEquals(buf(createLine(content)), 0, content, 200);
      assert.strictEqual(result.line.length, 100);
    });

    it('应该在行长度超过限制时抛出错误', () => {
      assertHttpError(
        () => decodeHttpLine(buf(createLine(repeat('A', 1000))), 0, { maxLineLength: 100 }),
        HttpDecodeErrorCode.LINE_TOO_LARGE,
        'HTTP line exceeds maximum length',
      );
    });

    it('应该在不完整但超限的行抛出错误', () => {
      assertHttpError(
        () => decodeHttpLine(buf(repeat('A', 200)), 0, { maxLineLength: 100 }),
        HttpDecodeErrorCode.LINE_TOO_LARGE,
      );
    });

    it('应该在行长度等于限制-1时正常解析', () => {
      const result = assertLineEquals(buf(createLine(repeat('A', 50))), 0, repeat('A', 50), 51);
      assert.strictEqual(result.line.length, 50);
    });

    it('应该能够处理大行（在默认限制内）', () => {
      const largeContent = repeat('A', 15 * 1024);
      const result = assertLineEquals(buf(createLine(largeContent)), 0, largeContent, 16 * 1024);
      assert.strictEqual(result.line.length, 15 * 1024);
    });
  });

  describe('HTTP 实际场景', () => {
    const httpExamples = [
      { input: 'GET /api/users?id=123 HTTP/1.1', desc: 'HTTP 请求行' },
      { input: 'HTTP/1.1 200 OK', desc: 'HTTP 响应状态行' },
      { input: 'Content-Type: application/json', desc: 'HTTP 头部' },
      { input: 'User-Agent:   Mozilla/5.0   ', desc: '包含多个空格的头部' },
    ];

    httpExamples.forEach(({ input, desc }) => {
      it(`应该解析${desc}`, () => {
        assertLineEquals(buf(createLine(input)), 0, input);
      });
    });

    it('应该识别空行作为头部结束标志', () => {
      const buffer = buf('Header: value\r\n\r\nBody');

      const firstLine = assertLineEquals(buffer, 0, 'Header: value');
      const emptyLine = assertLineEquals(buffer, firstLine.bytesConsumed, '');

      assert.strictEqual(emptyLine.line.length, 0);
    });

    it('应该处理完整的 HTTP 头部解析流程', () => {
      const headers = ['GET / HTTP/1.1', 'Host: example.com', 'User-Agent: Test/1.0', 'Accept: */*', ''];
      const buffer = buf(headers.map(h => createLine(h)).join(''));

      const parsedLines: string[] = [];
      let offset = 0;

      while (offset < buffer.length) {
        const line = decodeHttpLine(buffer, offset, { maxLineLength: DEFAULT_MAX_LENGTH });
        if (!line) break;

        parsedLines.push(line.line.toString());
        offset += line.bytesConsumed;

        if (line.line.length === 0) break;
      }

      assert.strictEqual(parsedLines.length, headers.length);
      parsedLines.forEach((parsed, i) => {
        assert.strictEqual(parsed, headers[i]);
      });
    });

    it('应该处理包含大量行的 buffer', () => {
      const lineCount = 100;
      const headers = Array.from({ length: lineCount }, (_, i) => `Header-${i}: value-${i}`);
      const buffer = buf(headers.map(h => createLine(h)).join(''));

      let offset = 0;
      let count = 0;

      while (offset < buffer.length) {
        const line = decodeHttpLine(buffer, offset, { maxLineLength: DEFAULT_MAX_LENGTH });
        if (!line) break;
        count++;
        offset += line.bytesConsumed;
      }

      assert.strictEqual(count, lineCount);
    });
  });

  describe('性能和特殊数据', () => {
    it('应该处理纯二进制数据', () => {
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, CR, LF]);
      assertLineEquals(buffer, 0, 'Hello');
    });

    const binaryDataCases = [
      { data: [0x00, 0x01, 0x02], desc: '包含 NULL 字节的数据' },
      { data: [0xFF, 0xFE, 0xFD], desc: '高位字节数据' },
    ];

    binaryDataCases.forEach(({ data, desc }) => {
      it(`应该处理${desc}`, () => {
        const buffer = Buffer.from([...data, CR, LF]);
        const result = decodeHttpLine(buffer, 0, { maxLineLength: 100 });
        assert.ok(result);
        assert.strictEqual(result.line.length, data.length);
      });
    });
  });
});

// 简化的独立测试
describe('基础功能测试', () => {
  test('basic CRLF line', () => {
    const buffer = buf('GET / HTTP/1.1\r\n');
    const result = assertLineEquals(buffer, 0, 'GET / HTTP/1.1');
    assert.strictEqual(result.bytesConsumed, buffer.length);
  });

  test('offset works correctly', () => {
    assertLineEquals(buf('XXXGET / HTTP/1.1\r\n'), 3, 'GET / HTTP/1.1');
  });

  test('incomplete line returns null', () => {
    const result = decodeHttpLine(buf('GET / HTTP/1.1\r'), 0, { maxLineLength: DEFAULT_MAX_LENGTH });
    assert.strictEqual(result, null);
  });

  test('LF without CR throws', () => {
    assertHttpError(
      () => decodeHttpLine(buf('GET / HTTP/1.1\n'), 0, { maxLineLength: DEFAULT_MAX_LENGTH }),
      HttpDecodeErrorCode.INVALID_LINE_ENDING,
    );
  });

  test('CR not followed by LF throws', () => {
    assertHttpError(
      () => decodeHttpLine(buf('GET / HTTP/1.1\rX'), 0, { maxLineLength: DEFAULT_MAX_LENGTH }),
      HttpDecodeErrorCode.INVALID_LINE_ENDING,
    );
  });

  test('line too long throws', () => {
    assertHttpError(
      () => decodeHttpLine(buf(createLine(repeat('A', 5))), 0, { maxLineLength: 4 }),
      HttpDecodeErrorCode.LINE_TOO_LARGE,
    );
  });

  test('empty buffer with offset 0 returns null', () => {
    const result = decodeHttpLine(Buffer.alloc(0), 0, { maxLineLength: DEFAULT_MAX_LENGTH });
    assert.strictEqual(result, null);
  });

  test('offset out of range throws', () => {
    const buffer = buf('GET / HTTP/1.1\r\n');
    assert.throws(
      () => decodeHttpLine(buffer, buffer.length, { maxLineLength: DEFAULT_MAX_LENGTH }),
      RangeError,
    );
  });

  test('invalid maxLineLength throws', () => {
    assert.throws(
      () => decodeHttpLine(buf('GET / HTTP/1.1\r\n'), 0, { maxLineLength: 0 }),
      TypeError,
    );
  });
});
