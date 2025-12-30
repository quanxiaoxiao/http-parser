import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { formatHttpDate, isValidHttpDate,parseHttpDate } from './date.js';

describe('formatHttpDate', () => {
  it('应该正确格式化标准日期', () => {
    const date = new Date('1994-11-06T08:49:37.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Sun, 06 Nov 1994 08:49:37 GMT');
  });

  it('应该正确处理个位数日期', () => {
    const date = new Date('2024-01-05T12:30:45.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Fri, 05 Jan 2024 12:30:45 GMT');
  });

  it('应该正确处理年初日期', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Mon, 01 Jan 2024 00:00:00 GMT');
  });

  it('应该正确处理年末日期', () => {
    const date = new Date('2024-12-31T23:59:59.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Tue, 31 Dec 2024 23:59:59 GMT');
  });

  it('应该正确处理闰年2月29日', () => {
    const date = new Date('2024-02-29T12:00:00.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Thu, 29 Feb 2024 12:00:00 GMT');
  });
});

describe('parseHttpDate - IMF-fixdate 格式', () => {
  it('应该正确解析标准 IMF-fixdate 格式', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '1994-11-06T08:49:37.000Z');
  });

  it('应该正确解析不同月份', () => {
    const result = parseHttpDate('Wed, 15 Mar 2023 14:30:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2023-03-15T14:30:00.000Z');
  });

  it('应该正确解析年初日期', () => {
    const result = parseHttpDate('Mon, 01 Jan 2024 00:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2024-01-01T00:00:00.000Z');
  });

  it('应该正确解析年末日期', () => {
    const result = parseHttpDate('Tue, 31 Dec 2024 23:59:59 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2024-12-31T23:59:59.000Z');
  });

  it('应该拒绝无效的日期(如2月30日)', () => {
    const result = parseHttpDate('Sun, 30 Feb 2024 12:00:00 GMT');
    assert.strictEqual(result, null);
  });

  it('应该拒绝无效的时间(如25小时)', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 25:00:00 GMT');
    assert.strictEqual(result, null);
  });
});

describe('parseHttpDate - RFC 850 格式', () => {
  it('应该正确解析 RFC 850 格式(20世纪)', () => {
    const result = parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '1994-11-06T08:49:37.000Z');
  });

  it('应该正确处理70-99年份范围(1970-1999)', () => {
    const result = parseHttpDate('Thursday, 01-Jan-70 00:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.getUTCFullYear(), 1970);
  });

  it('应该正确处理00-69年份范围(2000-2069)', () => {
    const result = parseHttpDate('Saturday, 01-Jan-00 00:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.getUTCFullYear(), 2000);
  });

  it('应该正确处理69年(2069)', () => {
    const result = parseHttpDate('Monday, 15-Jun-69 12:30:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.getUTCFullYear(), 2069);
  });

  it('应该正确解析不同星期几', () => {
    const result = parseHttpDate('Monday, 01-May-95 10:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '1995-05-01T10:00:00.000Z');
  });
});

describe('parseHttpDate - ANSI C asctime 格式', () => {
  it('应该正确解析 asctime 格式', () => {
    const result = parseHttpDate('Sun Nov  6 08:49:37 1994');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '1994-11-06T08:49:37.000Z');
  });

  it('应该正确处理个位数日期(单空格)', () => {
    const result = parseHttpDate('Fri Jan  5 12:30:45 2024');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2024-01-05T12:30:45.000Z');
  });

  it('应该正确处理两位数日期', () => {
    const result = parseHttpDate('Wed Mar 15 14:30:00 2023');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2023-03-15T14:30:00.000Z');
  });

  it('应该正确处理不同年份', () => {
    const result = parseHttpDate('Sat Dec 25 00:00:00 2021');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2021-12-25T00:00:00.000Z');
  });
});

describe('parseHttpDate - 边界情况和错误处理', () => {
  it('应该拒绝空字符串', () => {
    const result = parseHttpDate('');
    assert.strictEqual(result, null);
  });

  it('应该拒绝无效格式', () => {
    const result = parseHttpDate('Invalid Date String');
    assert.strictEqual(result, null);
  });

  it('应该拒绝部分匹配的字符串', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994');
    assert.strictEqual(result, null);
  });

  it('应该拒绝错误的月份缩写', () => {
    const result = parseHttpDate('Sun, 06 Xxx 1994 08:49:37 GMT');
    assert.strictEqual(result, null);
  });

  it('应该拒绝错误的星期缩写', () => {
    const result = parseHttpDate('Xxx, 06 Nov 1994 08:49:37 GMT');
    assert.strictEqual(result, null);
  });

  it('应该拒绝没有 GMT 后缀的日期', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:49:37');
    assert.strictEqual(result, null);
  });

  it('应该拒绝字符串过短', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994');
    assert.strictEqual(result, null);
  });

  it('应该拒绝字符串过长', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT Extra Text Here');
    assert.strictEqual(result, null);
  });

  it('应该拒绝无效的小时(60)', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 60:00:00 GMT');
    assert.strictEqual(result, null);
  });

  it('应该拒绝无效的分钟(60)', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:60:00 GMT');
    assert.strictEqual(result, null);
  });

  it('应该拒绝无效的秒(60)', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:49:60 GMT');
    assert.strictEqual(result, null);
  });

  it('应该拒绝非闰年的2月29日', () => {
    const result = parseHttpDate('Sun, 29 Feb 2023 12:00:00 GMT');
    assert.strictEqual(result, null);
  });

  it('应该接受闰年的2月29日', () => {
    const result = parseHttpDate('Thu, 29 Feb 2024 12:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2024-02-29T12:00:00.000Z');
  });
});

describe('isValidHttpDate', () => {
  it('应该对有效的 IMF-fixdate 返回 true', () => {
    assert.strictEqual(isValidHttpDate('Sun, 06 Nov 1994 08:49:37 GMT'), true);
  });

  it('应该对有效的 RFC 850 返回 true', () => {
    assert.strictEqual(isValidHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), true);
  });

  it('应该对有效的 asctime 返回 true', () => {
    assert.strictEqual(isValidHttpDate('Sun Nov  6 08:49:37 1994'), true);
  });

  it('应该对无效日期返回 false', () => {
    assert.strictEqual(isValidHttpDate('Invalid Date'), false);
  });

  it('应该对空字符串返回 false', () => {
    assert.strictEqual(isValidHttpDate(''), false);
  });

  it('应该对溢出日期返回 false', () => {
    assert.strictEqual(isValidHttpDate('Sun, 32 Jan 1994 08:49:37 GMT'), false);
  });
});

describe('formatHttpDate 和 parseHttpDate 往返测试', () => {
  it('应该能够往返转换日期', () => {
    const original = new Date('2024-06-15T10:30:45.000Z');
    const formatted = formatHttpDate(original);
    const parsed = parseHttpDate(formatted);

    assert.ok(parsed);
    assert.strictEqual(parsed.toISOString(), original.toISOString());
  });

  it('应该能够处理多个往返转换', () => {
    const dates = [
      new Date('1994-11-06T08:49:37.000Z'),
      new Date('2024-01-01T00:00:00.000Z'),
      new Date('2024-12-31T23:59:59.000Z'),
      new Date('2024-02-29T12:00:00.000Z'),
    ];

    for (const date of dates) {
      const formatted = formatHttpDate(date);
      const parsed = parseHttpDate(formatted);
      assert.ok(parsed);
      assert.strictEqual(parsed.toISOString(), date.toISOString());
    }
  });
});
