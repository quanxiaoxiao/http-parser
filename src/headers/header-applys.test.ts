import * as assert from 'node:assert';
import {
  describe, it,
} from 'node:test';

import {
  applyHostHeader,
} from './header-applys.js';

describe('applyHostHeader', () => {
  it('应该设置 Host header', () => {
    const headers = {};
    applyHostHeader(headers, 'example.com');
    assert.deepStrictEqual(headers, {
      host: ['example.com'],
    });
  });

  it('应该替换已存在的 Host header', () => {
    const headers = {
      host: ['old.example.com'],
    };
    applyHostHeader(headers, 'new.example.com');
    assert.deepStrictEqual(headers, {
      host: ['new.example.com'],
    });
  });

  it('应该处理带端口的 host', () => {
    const headers = {};
    applyHostHeader(headers, 'example.com:8080');
    assert.deepStrictEqual(headers, {
      host: ['example.com:8080'],
    });
  });

  it('应该抛出错误当 host 为空字符串', () => {
    const headers = {};
    assert.throws(
      () => applyHostHeader(headers, ''),
      { message: 'Client request requires host' },
    );
  });
});
