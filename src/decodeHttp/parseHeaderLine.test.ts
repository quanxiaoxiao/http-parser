import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { DecodeHttpError } from '../errors.js';
import parseHeaderLine from './parseHeaderLine.js';

describe('parseHeaderLine', () => {
  describe('正常解析', () => {
    const validCases = [
      {
        desc: '标准 HTTP header',
        input: 'Content-Type: application/json',
        expected: ['Content-Type', 'application/json'],
      },
      {
        desc: 'header 带前后空格',
        input: 'Authorization:   Bearer token123  ',
        expected: ['Authorization', 'Bearer token123'],
      },
      {
        desc: 'header 无额外空格',
        input: 'Host:example.com',
        expected: ['Host', 'example.com'],
      },
      {
        desc: 'value 包含多个冒号',
        input: 'X-Custom: value:with:colons',
        expected: ['X-Custom', 'value:with:colons'],
      },
      {
        desc: 'value 以冒号开头',
        input: 'X-Custom: :startWithColon',
        expected: ['X-Custom', ':startWithColon'],
      },
      {
        desc: '特殊字符（Cookie）',
        input: 'Set-Cookie: session=abc123; Path=/; HttpOnly',
        expected: ['Set-Cookie', 'session=abc123; Path=/; HttpOnly'],
      },
      {
        desc: '单字符 name 和 value',
        input: 'A: B',
        expected: ['A', 'B'],
      },
      {
        desc: '数字 value',
        input: 'Content-Length: 12345',
        expected: ['Content-Length', '12345'],
      },
    ];

    validCases.forEach(({ desc, input, expected }) => {
      it(`应该正确解析${desc}`, () => {
        const [name, value] = parseHeaderLine(input);
        assert.strictEqual(name, expected[0]);
        assert.strictEqual(value, expected[1]);
      });
    });

    it('应该正确处理超长 header 值', () => {
      const longValue = 'a'.repeat(1000);
      const [name, value] = parseHeaderLine(`Content-Length: ${longValue}`);
      assert.strictEqual(name, 'Content-Length');
      assert.strictEqual(value, longValue);
    });
  });

  describe('边界情况', () => {
    const edgeCases = [
      {
        desc: 'name 为空',
        input: ': value',
        expected: ['', 'value'],
      },
      {
        desc: 'value 为空',
        input: 'Content-Type:',
        expected: ['Content-Type', ''],
      },
      {
        desc: 'value 只有空格',
        input: 'Content-Type:   ',
        expected: ['Content-Type', ''],
      },
      {
        desc: '只有冒号',
        input: ':',
        expected: ['', ''],
      },
    ];

    edgeCases.forEach(({ desc, input, expected }) => {
      it(`应该正确处理${desc}`, () => {
        const [name, value] = parseHeaderLine(input);
        assert.strictEqual(name, expected[0]);
        assert.strictEqual(value, expected[1]);
      });
    });
  });

  describe('错误情况', () => {
    const errorCases = [
      {
        desc: '缺少冒号',
        input: 'InvalidHeader',
        errorCheck: (error: Error) =>
          error instanceof DecodeHttpError &&
          error.message.includes('missing') &&
          error.message.includes('InvalidHeader'),
      },
      {
        desc: '空字符串',
        input: '',
        errorCheck: (error: Error) => error instanceof DecodeHttpError,
      },
    ];

    errorCases.forEach(({ desc, input, errorCheck }) => {
      it(`应该在${desc}时抛出 DecodeHttpError`, () => {
        assert.throws(() => parseHeaderLine(input), errorCheck);
      });
    });
  });
});
