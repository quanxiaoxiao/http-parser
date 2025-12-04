import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import createHeaderChecker from './createHeaderChecker';

describe('Header Checker', () => {
  it('should return true for existing header (case insensitive)', () => {
    const obj = { 'Content-Type': 'application/json', Authorization: 'Bearer token' };
    const checker = createHeaderChecker(obj);

    assert.strictEqual(checker('content-type'), true);
    assert.strictEqual(checker('CONTENT-TYPE'), true);
    assert.strictEqual(checker('Content-Type'), true);
    assert.strictEqual(checker('authorization'), true);
  });

  it('should return false for non-existing header', () => {
    const obj = { 'Content-Type': 'application/json' };
    const checker = createHeaderChecker(obj);

    assert.strictEqual(checker('Authorization'), false);
    assert.strictEqual(checker('X-Custom-Header'), false);
    assert.strictEqual(checker('content-types'), false);
  });

  it('should return false for empty object', () => {
    const obj = {};
    const checker = createHeaderChecker(obj);

    assert.strictEqual(checker('Content-Type'), false);
  });

  it('should work with multiple headers', () => {
    const obj = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
      'X-Custom-Header': 'value',
      Accept: 'application/json',
    };
    const checker = createHeaderChecker(obj);

    assert.strictEqual(checker('content-type'), true);
    assert.strictEqual(checker('authorization'), true);
    assert.strictEqual(checker('x-custom-header'), true);
    assert.strictEqual(checker('accept'), true);
    assert.strictEqual(checker('non-existent'), false);
  });

  it('should handle headers with special characters', () => {
    const obj = { 'X-Custom-Header-123': 'value' };
    const checker = createHeaderChecker(obj);

    assert.strictEqual(checker('x-custom-header-123'), true);
    assert.strictEqual(checker('X-CUSTOM-HEADER-123'), true);
  });

  it('should be reusable', () => {
    const obj = { 'Content-Type': 'application/json' };
    const checker = createHeaderChecker(obj);

    assert.strictEqual(checker('content-type'), true);
    assert.strictEqual(checker('content-type'), true);
    assert.strictEqual(checker('authorization'), false);
    assert.strictEqual(checker('authorization'), false);
  });

  it('should handle arry', () => {
    const obj = { 'Content-Type': 'application/json', Authorization: 'Bearer token', server: 'quan' };
    const checker = createHeaderChecker(obj);

    assert.strictEqual(checker(['content-type']), true);
    assert.strictEqual(checker(['content-Type']), true);
    assert.strictEqual(checker([]), false);
    assert.strictEqual(checker(['content-type', 'authorization']), true);
    assert.strictEqual(checker(['content-Type', 'other']), false);
  });
});
