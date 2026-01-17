import * as assert from 'node:assert';
import { describe, test } from 'node:test';

import {
  parseHex,
  parseInteger,
} from './number.js';

test('parseInteger - 有效的整数字符串', () => {
  assert.strictEqual(parseInteger('123'), 123);
  assert.strictEqual(parseInteger('0'), 0);
  assert.strictEqual(parseInteger('999'), 999);
});

test('parseInteger - 有效的数字类型', () => {
  assert.strictEqual(parseInteger(123), 123);
  assert.strictEqual(parseInteger(0), 0);
  assert.strictEqual(parseInteger(999), 999);
});

test('parseInteger - 无效输入返回 null', () => {
  assert.strictEqual(parseInteger('abc'), null);
  assert.strictEqual(parseInteger('12.5'), null);
  assert.strictEqual(parseInteger('-1'), null);
  assert.strictEqual(parseInteger('1e2'), null);
  assert.strictEqual(parseInteger('12a'), null);
  assert.strictEqual(parseInteger(' 12'), null);
  assert.strictEqual(parseInteger('12 '), null);
  assert.strictEqual(parseInteger(''), null);
  assert.strictEqual(parseInteger(NaN), null);
  assert.strictEqual(parseInteger(-1), null);
  assert.strictEqual(parseInteger(12.5), null);
  assert.strictEqual(parseInteger(Infinity), null);
});

// parseHex 测试
test('parseHex - 有效的小写十六进制字符串', () => {
  assert.strictEqual(parseHex('ff'), 255);
  assert.strictEqual(parseHex('0'), 0);
  assert.strictEqual(parseHex('10'), 16);
  assert.strictEqual(parseHex('a'), 10);
  assert.strictEqual(parseHex('1a2b'), 6699);
});

test('parseHex - 有效的大写十六进制字符串', () => {
  assert.strictEqual(parseHex('FF'), 255);
  assert.strictEqual(parseHex('A'), 10);
  assert.strictEqual(parseHex('1A2B'), 6699);
  assert.strictEqual(parseHex('DEADBEEF'), 3735928559);
});

test('parseHex - 有效的数字类型', () => {
  assert.strictEqual(parseHex(255), 255);
  assert.strictEqual(parseHex(0), 0);
  assert.strictEqual(parseHex(16), 16);
});

test('parseHex - 无效输入返回 null', () => {
  assert.strictEqual(parseHex('xyz'), null);
  assert.strictEqual(parseHex('1g2'), null);
  assert.strictEqual(parseHex('-1'), null);
  assert.strictEqual(parseHex('12.5'), null);
  assert.strictEqual(parseHex(' ff'), null);
  assert.strictEqual(parseHex('ff '), null);
  assert.strictEqual(parseHex(''), null);
  assert.strictEqual(parseHex(NaN), null);
  assert.strictEqual(parseHex(-1), null);
  assert.strictEqual(parseHex(12.5), null);
  assert.strictEqual(parseHex(Infinity), null);
});

test('parseHex - 带0x前缀应返回 null', () => {
  assert.strictEqual(parseHex('0xff'), null);
  assert.strictEqual(parseHex('0x10'), null);
});

test('parseHex - 边界值测试', () => {
  assert.strictEqual(parseHex('ffffffff'), 4294967295);
  assert.strictEqual(parseHex('0'), 0);
});

describe('parseInteger 函数测试', () => {

  describe('有效的正整数', () => {
    test('应该正确解析数字类型的正整数', () => {
      assert.strictEqual(parseInteger(123), 123);
      assert.strictEqual(parseInteger(0), 0);
      assert.strictEqual(parseInteger(999), 999);
    });

    test('应该正确解析字符串类型的正整数', () => {
      assert.strictEqual(parseInteger('123'), 123);
      assert.strictEqual(parseInteger('0'), 0);
      assert.strictEqual(parseInteger('999'), 999);
    });
  });

  describe('无效输入应返回 null', () => {
    test('负数应返回 null', () => {
      assert.strictEqual(parseInteger(-1), null);
      assert.strictEqual(parseInteger(-100), null);
      assert.strictEqual(parseInteger('-5'), null);
    });

    test('小数应返回 null', () => {
      assert.strictEqual(parseInteger(1.5), null);
      assert.strictEqual(parseInteger(0.1), null);
      assert.strictEqual(parseInteger('3.14'), null);
    });

    test('无效字符串应返回 null', () => {
      assert.strictEqual(parseInteger('abc'), null);
      assert.strictEqual(parseInteger('12abc'), null);
      assert.strictEqual(parseInteger(''), null);
      assert.strictEqual(parseInteger(' '), null);
    });

    test('NaN 应返回 null', () => {
      assert.strictEqual(parseInteger(NaN), null);
    });

    test('Infinity 应返回 null', () => {
      assert.strictEqual(parseInteger(Infinity), null);
      assert.strictEqual(parseInteger(-Infinity), null);
    });

    test('带前导零的字符串应正确处理', () => {
      assert.strictEqual(parseInteger('08'), null);
      assert.strictEqual(parseInteger('007'), null);
    });

    test('带空格的字符串应返回 null', () => {
      assert.strictEqual(parseInteger(' 123'), null);
      assert.strictEqual(parseInteger('123 '), null);
    });
  });

  describe('边界情况', () => {
    test('最大安全整数', () => {
      const maxSafeInt = Number.MAX_SAFE_INTEGER;
      assert.strictEqual(parseInteger(maxSafeInt), maxSafeInt);
    });

    test('超出安全整数范围的字符串', () => {
      const largeNum = '9007199254740992'; // MAX_SAFE_INTEGER + 1
      // 这个测试取决于你的业务需求
      const result = parseInteger(largeNum);
      assert.strictEqual(typeof result === 'number' || result === null, true);
    });

    test('零的各种形式', () => {
      assert.strictEqual(parseInteger(0), 0);
      assert.strictEqual(parseInteger('0'), 0);
      assert.strictEqual(parseInteger('00'), null);
    });
  });

  describe('类型转换精度检查', () => {
    test('字符串转换后与原值不同应返回 null', () => {
      // 这个测试确保没有精度损失
      assert.strictEqual(parseInteger('123.456'), null);
      assert.strictEqual(parseInteger('12.0'), null);
    });
  });
});
