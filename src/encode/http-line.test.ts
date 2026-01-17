import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, test } from 'node:test';

import {
  encodeHttpLine,
  encodeHttpLines,
} from './http-line.js';

const CR = 0x0d;
const LF = 0x0a;

describe('encodeHttpLine', () => {
  test('应该在简单字符串后添加 CRLF', () => {
    const input = Buffer.from('Hello');
    const result = encodeHttpLine(input);
    const expected = Buffer.from([...Buffer.from('Hello'), CR, LF]);

    assert.deepStrictEqual(result, expected);
  });

  test('应该在空 Buffer 后添加 CRLF', () => {
    const input = Buffer.alloc(0);
    const result = encodeHttpLine(input);
    const expected = Buffer.from([CR, LF]);

    assert.deepStrictEqual(result, expected);
  });

  test('应该正确处理包含特殊字符的 Buffer', () => {
    const input = Buffer.from('Content-Type: text/html');
    const result = encodeHttpLine(input);

    assert.strictEqual(result.length, input.length + 2);
    assert.strictEqual(result[result.length - 2], CR);
    assert.strictEqual(result[result.length - 1], LF);
    assert.strictEqual(result.subarray(0, input.length).toString(), 'Content-Type: text/html');
  });

  test('应该不修改原始 Buffer', () => {
    const input = Buffer.from('Test');
    const original = Buffer.from(input);
    encodeHttpLine(input);

    assert.deepStrictEqual(input, original);
  });

  test('应该处理二进制数据', () => {
    const input = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    const result = encodeHttpLine(input);

    assert.strictEqual(result.length, 6);
    assert.deepStrictEqual(result.subarray(0, 4), input);
    assert.strictEqual(result[4], CR);
    assert.strictEqual(result[5], LF);
  });
});

describe('encodeHttpLines', () => {
  test('应该处理空数组', () => {
    const result = encodeHttpLines([]);
    assert.strictEqual(result.length, 0);
    assert.ok(Buffer.isBuffer(result));
  });

  test('应该为单个 Buffer 添加 CRLF', () => {
    const input = [Buffer.from('Line1')];
    const result = encodeHttpLines(input);
    const expected = Buffer.from([...Buffer.from('Line1'), CR, LF]);

    assert.deepStrictEqual(result, expected);
  });

  test('应该正确连接多个 Buffer 并添加 CRLF', () => {
    const inputs = [
      Buffer.from('GET / HTTP/1.1'),
      Buffer.from('Host: example.com'),
      Buffer.from('Connection: close'),
    ];
    const result = encodeHttpLines(inputs);

    const expected = Buffer.concat([
      Buffer.from('GET / HTTP/1.1'), Buffer.from([CR, LF]),
      Buffer.from('Host: example.com'), Buffer.from([CR, LF]),
      Buffer.from('Connection: close'), Buffer.from([CR, LF]),
    ]);

    assert.deepStrictEqual(result, expected);
  });

  test('应该计算正确的总长度', () => {
    const inputs = [
      Buffer.from('A'),
      Buffer.from('BB'),
      Buffer.from('CCC'),
    ];
    const result = encodeHttpLines(inputs);

    // 1 + 2 + 2 + 2 + 3 + 2 = 12
    assert.strictEqual(result.length, 12);
  });

  test('应该处理包含空 Buffer 的数组', () => {
    const inputs = [
      Buffer.from('Header1'),
      Buffer.alloc(0),
      Buffer.from('Header2'),
    ];
    const result = encodeHttpLines(inputs);

    // 验证每行都有 CRLF
    const lines = [];
    let offset = 0;

    // Header1\r\n
    lines.push(result.subarray(offset, offset + 7).toString());
    offset += 9;

    // \r\n (空行)
    offset += 2;

    // Header2\r\n
    lines.push(result.subarray(offset, offset + 7).toString());

    assert.strictEqual(lines[0], 'Header1');
    assert.strictEqual(lines[1], 'Header2');
  });

  test('应该不修改原始 Buffer 数组', () => {
    const inputs = [
      Buffer.from('Line1'),
      Buffer.from('Line2'),
    ];
    const originals = inputs.map(buf => Buffer.from(buf));

    encodeHttpLines(inputs);

    inputs.forEach((buf, i) => {
      assert.deepStrictEqual(buf, originals[i]);
    });
  });

  test('应该正确处理大量行', () => {
    const inputs = Array.from({ length: 100 }, (_, i) =>
      Buffer.from(`Header${i}: value${i}`),
    );
    const result = encodeHttpLines(inputs);

    // 验证最后一行正确添加了 CRLF
    const lastTwo = result.subarray(result.length - 2);
    assert.strictEqual(lastTwo[0], CR);
    assert.strictEqual(lastTwo[1], LF);
  });

  test('应该处理二进制数据数组', () => {
    const inputs = [
      Buffer.from([0x00, 0x01]),
      Buffer.from([0xff, 0xfe]),
    ];
    const result = encodeHttpLines(inputs);

    assert.strictEqual(result.length, 8); // (2 + 2) * 2
    assert.strictEqual(result[0], 0x00);
    assert.strictEqual(result[1], 0x01);
    assert.strictEqual(result[2], CR);
    assert.strictEqual(result[3], LF);
    assert.strictEqual(result[4], 0xff);
    assert.strictEqual(result[5], 0xfe);
    assert.strictEqual(result[6], CR);
    assert.strictEqual(result[7], LF);
  });
});
