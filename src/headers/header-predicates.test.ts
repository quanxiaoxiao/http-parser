import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  hasBody,
  hasZeroContentLength,
  isChunked,
} from './header-predicates.js';

describe('isChunked', () => {
  it('当 transfer-encoding 包含 chunked 时应该返回 true', () => {
    const headers = { 'transfer-encoding': ['chunked'] };
    assert.strictEqual(isChunked(headers), true);
  });

  it('当 transfer-encoding 包含多个值且其中有 chunked 时应该返回 true', () => {
    const headers = { 'transfer-encoding': ['gzip', 'chunked'] };
    assert.strictEqual(isChunked(headers), true);
  });

  it('应该对 chunked 进行大小写不敏感匹配', () => {
    const headers = { 'transfer-encoding': ['CHUNKED'] };
    assert.strictEqual(isChunked(headers), true);
  });

  it('应该匹配混合大小写的 chunked', () => {
    const headers = { 'transfer-encoding': ['ChUnKeD'] };
    assert.strictEqual(isChunked(headers), true);
  });

  it('当 transfer-encoding 包含 chunked 作为复合值时应该返回 true', () => {
    const headers = { 'transfer-encoding': ['gzip, chunked'] };
    assert.strictEqual(isChunked(headers), true);
  });

  it('当 transfer-encoding 不包含 chunked 时应该返回 false', () => {
    const headers = { 'transfer-encoding': ['gzip'] };
    assert.strictEqual(isChunked(headers), false);
  });

  it('当 transfer-encoding 不存在时应该返回 false', () => {
    const headers = {};
    assert.strictEqual(isChunked(headers), false);
  });

  it('当 transfer-encoding 为空数组时应该返回 false', () => {
    const headers = { 'transfer-encoding': [] };
    assert.strictEqual(isChunked(headers), false);
  });

  it('应该处理包含 chunked 子串但不是完整单词的情况', () => {
    // "dechunked" 也会匹配，因为使用的是 includes
    const headers = { 'transfer-encoding': ['dechunked'] };
    assert.strictEqual(isChunked(headers), true);
  });
});

describe('hasBody', () => {
  it('当 content-length > 0 时应该返回 true', () => {
    const headers = { 'content-length': ['100'] };
    assert.strictEqual(hasBody(headers), true);
  });

  it('当 content-length = 1 时应该返回 true', () => {
    const headers = { 'content-length': ['1'] };
    assert.strictEqual(hasBody(headers), true);
  });

  it('当 content-length = 0 时应该返回 false', () => {
    const headers = { 'content-length': ['0'] };
    assert.strictEqual(hasBody(headers), false);
  });

  it('当 content-length 无效时应该检查 chunked', () => {
    const headers = {
      'content-length': ['invalid'],
      'transfer-encoding': ['chunked'],
    };
    assert.strictEqual(hasBody(headers), true);
  });

  it('当 content-length 无效且没有 chunked 时应该返回 false', () => {
    const headers = { 'content-length': ['invalid'] };
    assert.strictEqual(hasBody(headers), false);
  });

  it('当没有 content-length 但有 chunked 时应该返回 true', () => {
    const headers = { 'transfer-encoding': ['chunked'] };
    assert.strictEqual(hasBody(headers), true);
  });

  it('当既没有 content-length 也没有 chunked 时应该返回 false', () => {
    const headers = {};
    assert.strictEqual(hasBody(headers), false);
  });

  it('应该处理负数 content-length', () => {
    const headers = { 'content-length': ['-1'] };
    assert.strictEqual(hasBody(headers), false);
  });

  it('应该不处理浮点数 content-length', () => {
    const headers = { 'content-length': ['10.5'] };
    assert.strictEqual(hasBody(headers), false);
  });

  it('应该处理带空格的 content-length', () => {
    const headers = { 'content-length': ['  100  '] };
    assert.strictEqual(hasBody(headers), true);
  });

  it('content-length 优先于 chunked 检查', () => {
    const headers = {
      'content-length': ['100'],
      'transfer-encoding': ['chunked'],
    };
    assert.strictEqual(hasBody(headers), true);
  });

  it('当 content-length = 0 有包含 chunked 时应该返回 true', () => {
    const headers = {
      'content-length': ['0'],
      'transfer-encoding': ['chunked'],
    };
    assert.strictEqual(hasBody(headers), true);
  });
});

describe('hasZeroContentLength', () => {
  it('当 content-length = 0 时应该返回 true', () => {
    const headers = { 'content-length': ['0'] };
    assert.strictEqual(hasZeroContentLength(headers), true);
  });

  it('当 content-length > 0 时应该返回 false', () => {
    const headers = { 'content-length': ['100'] };
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('当 content-length < 0 时应该返回 false', () => {
    const headers = { 'content-length': ['-1'] };
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('当 content-length 不存在时应该返回 false', () => {
    const headers = {};
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('当 content-length 无效时应该返回 false', () => {
    const headers = { 'content-length': ['invalid'] };
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('当 content-length 为空字符串时应该返回 false', () => {
    const headers = { 'content-length': [''] };
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('应该处理带空格的 "0"', () => {
    const headers = { 'content-length': ['  0  '] };
    assert.strictEqual(hasZeroContentLength(headers), true);
  });

  it('应该处理 "0.0" 这样的浮点零不做处理', () => {
    const headers = { 'content-length': ['0.0'] };
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('当 content-length 为 null 时应该返回 false', () => {
    const headers = { 'content-length': null };
    assert.strictEqual(hasZeroContentLength(headers), false);
  });
});

describe('集成测试', () => {
  it('应该正确识别 chunked 编码的请求体', () => {
    const headers = {
      'transfer-encoding': ['chunked'],
      'content-type': ['application/json'],
    };

    assert.strictEqual(isChunked(headers), true);
    assert.strictEqual(hasBody(headers), true);
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('应该正确识别有 content-length 的请求体', () => {
    const headers = {
      'content-length': ['1234'],
      'content-type': ['application/json'],
    };

    assert.strictEqual(isChunked(headers), false);
    assert.strictEqual(hasBody(headers), true);
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('应该正确识别空请求体（content-length = 0）', () => {
    const headers = {
      'content-length': ['0'],
      'content-type': ['application/json'],
    };

    assert.strictEqual(isChunked(headers), false);
    assert.strictEqual(hasBody(headers), false);
    assert.strictEqual(hasZeroContentLength(headers), true);
  });

  it('应该正确识别没有请求体的请求', () => {
    const headers = {
      'content-type': ['application/json'],
    };

    assert.strictEqual(isChunked(headers), false);
    assert.strictEqual(hasBody(headers), false);
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('应该处理同时有 content-length 和 transfer-encoding 的情况', () => {
    const headers = {
      'content-length': ['1234'],
      'transfer-encoding': ['gzip', 'chunked'],
    };

    assert.strictEqual(isChunked(headers), true);
    // content-length > 0 优先返回 true
    assert.strictEqual(hasBody(headers), true);
    assert.strictEqual(hasZeroContentLength(headers), false);
  });

  it('应该不处理大小写混合的 headers', () => {
    const headers = {
      'Transfer-Encoding': ['chunked'],
      'Content-Length': ['9'],
    };
    assert.strictEqual(isChunked(headers), false);
    assert.strictEqual(hasZeroContentLength(headers), false);
  });
});
