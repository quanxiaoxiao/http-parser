import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  formatHttpDate,
  isValidHttpDate,
  parseHttpDate,
} from './date.js';

describe('formatHttpDate', () => {
  it('should correctly format standard date', () => {
    const date = new Date('1994-11-06T08:49:37.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Sun, 06 Nov 1994 08:49:37 GMT');
  });

  it('should correctly handle single-digit date', () => {
    const date = new Date('2024-01-05T12:30:45.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Fri, 05 Jan 2024 12:30:45 GMT');
  });

  it('should correctly handle early year date', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Mon, 01 Jan 2024 00:00:00 GMT');
  });

  it('should correctly handle end of year date', () => {
    const date = new Date('2024-12-31T23:59:59.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Tue, 31 Dec 2024 23:59:59 GMT');
  });

  it('should correctly handle leap year Feb 29', () => {
    const date = new Date('2024-02-29T12:00:00.000Z');
    const result = formatHttpDate(date);
    assert.strictEqual(result, 'Thu, 29 Feb 2024 12:00:00 GMT');
  });
});

describe('parseHttpDate - IMF-fixdate Format', () => {
  it('should correctly parse standard IMF-fixdate format', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '1994-11-06T08:49:37.000Z');
  });

  it('should correctly parse different months', () => {
    const result = parseHttpDate('Wed, 15 Mar 2023 14:30:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2023-03-15T14:30:00.000Z');
  });

  it('should correctly parse early year date', () => {
    const result = parseHttpDate('Mon, 01 Jan 2024 00:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2024-01-01T00:00:00.000Z');
  });

  it('should correctly parse end of year date', () => {
    const result = parseHttpDate('Tue, 31 Dec 2024 23:59:59 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2024-12-31T23:59:59.000Z');
  });

  it('should reject invalid date (like Feb 30)', () => {
    const result = parseHttpDate('Sun, 30 Feb 2024 12:00:00 GMT');
    assert.strictEqual(result, null);
  });

  it('should reject invalid time (like 25 hours)', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 25:00:00 GMT');
    assert.strictEqual(result, null);
  });
});

describe('parseHttpDate - RFC 850 Format', () => {
  it('should correctly parse RFC 850 format (20th century)', () => {
    const result = parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '1994-11-06T08:49:37.000Z');
  });

  it('should correctly handle 70-99 year range (1970-1999)', () => {
    const result = parseHttpDate('Thursday, 01-Jan-70 00:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.getUTCFullYear(), 1970);
  });

  it('should correctly handle 00-69 year range (2000-2069)', () => {
    const result = parseHttpDate('Saturday, 01-Jan-00 00:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.getUTCFullYear(), 2000);
  });

  it('should correctly handle year 69 (2069)', () => {
    const result = parseHttpDate('Monday, 15-Jun-69 12:30:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.getUTCFullYear(), 2069);
  });

  it('should correctly parse different day of week', () => {
    const result = parseHttpDate('Monday, 01-May-95 10:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '1995-05-01T10:00:00.000Z');
  });
});

describe('parseHttpDate - ANSI C asctime Format', () => {
  it('should correctly parse asctime format', () => {
    const result = parseHttpDate('Sun Nov  6 08:49:37 1994');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '1994-11-06T08:49:37.000Z');
  });

  it('should correctly handle single-digit date (single space)', () => {
    const result = parseHttpDate('Fri Jan  5 12:30:45 2024');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2024-01-05T12:30:45.000Z');
  });

  it('should correctly handle two-digit date', () => {
    const result = parseHttpDate('Wed Mar 15 14:30:00 2023');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2023-03-15T14:30:00.000Z');
  });

  it('should correctly handle different years', () => {
    const result = parseHttpDate('Sat Dec 25 00:00:00 2021');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2021-12-25T00:00:00.000Z');
  });
});

describe('parseHttpDate - Edge Cases and Error Handling', () => {
  it('should reject empty string', () => {
    const result = parseHttpDate('');
    assert.strictEqual(result, null);
  });

  it('should reject invalid format', () => {
    const result = parseHttpDate('Invalid Date String');
    assert.strictEqual(result, null);
  });

  it('should reject partially matched string', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994');
    assert.strictEqual(result, null);
  });

  it('should reject incorrect month abbreviation', () => {
    const result = parseHttpDate('Sun, 06 Xxx 1994 08:49:37 GMT');
    assert.strictEqual(result, null);
  });

  it('should reject incorrect day of week abbreviation', () => {
    const result = parseHttpDate('Xxx, 06 Nov 1994 08:49:37 GMT');
    assert.strictEqual(result, null);
  });

  it('should reject date without GMT suffix', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:49:37');
    assert.strictEqual(result, null);
  });

  it('should reject string that is too short', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994');
    assert.strictEqual(result, null);
  });

  it('should reject string that is too long', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT Extra Text Here');
    assert.strictEqual(result, null);
  });

  it('should reject invalid hour (60)', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 60:00:00 GMT');
    assert.strictEqual(result, null);
  });

  it('should reject invalid minute (60)', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:60:00 GMT');
    assert.strictEqual(result, null);
  });

  it('should reject invalid second (60)', () => {
    const result = parseHttpDate('Sun, 06 Nov 1994 08:49:60 GMT');
    assert.strictEqual(result, null);
  });

  it('should reject Feb 29 in non-leap year', () => {
    const result = parseHttpDate('Sun, 29 Feb 2023 12:00:00 GMT');
    assert.strictEqual(result, null);
  });

  it('should accept Feb 29 in leap year', () => {
    const result = parseHttpDate('Thu, 29 Feb 2024 12:00:00 GMT');
    assert.ok(result);
    assert.strictEqual(result.toISOString(), '2024-02-29T12:00:00.000Z');
  });
});

describe('isValidHttpDate', () => {
  it('should return true for valid IMF-fixdate', () => {
    assert.strictEqual(isValidHttpDate('Sun, 06 Nov 1994 08:49:37 GMT'), true);
  });

  it('should return true for valid RFC 850', () => {
    assert.strictEqual(isValidHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), true);
  });

  it('should return true for valid asctime', () => {
    assert.strictEqual(isValidHttpDate('Sun Nov  6 08:49:37 1994'), true);
  });

  it('should return false for invalid date', () => {
    assert.strictEqual(isValidHttpDate('Invalid Date'), false);
  });

  it('should return false for empty string', () => {
    assert.strictEqual(isValidHttpDate(''), false);
  });

  it('should return false for overflow date', () => {
    assert.strictEqual(isValidHttpDate('Sun, 32 Jan 1994 08:49:37 GMT'), false);
  });
});

describe('formatHttpDate and parseHttpDate Round-trip Tests', () => {
  it('should be able to round-trip convert dates', () => {
    const original = new Date('2024-06-15T10:30:45.000Z');
    const formatted = formatHttpDate(original);
    const parsed = parseHttpDate(formatted);

    assert.ok(parsed);
    assert.strictEqual(parsed.toISOString(), original.toISOString());
  });

  it('should be able to handle multiple round-trip conversions', () => {
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
