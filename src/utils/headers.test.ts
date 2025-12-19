import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { type NormalizedHeaders } from '../types.js';
import {
  appendHeader,
  deleteHeader,
  getHeaderValue,
  normalizeHeaders,
  sanitizeHeaders,
  setHeader,
  stripHopByHopHeaders,
} from './headers.js';

describe('normalizeHeaders', () => {
  it('应该返回空对象当输入为 undefined', () => {
    const result = normalizeHeaders(undefined);
    assert.deepStrictEqual(result, {});
  });

  it('应该返回空对象当输入为空对象', () => {
    const result = normalizeHeaders({});
    assert.deepStrictEqual(result, {});
  });

  it('应该将 header 键名转为小写', () => {
    const result = normalizeHeaders({
      'Content-Type': 'application/json',
      ACCEPT: 'text/html',
      'X-Custom-Header': 'value',
    });

    assert.strictEqual(result['content-type']?.[0], 'application/json');
    assert.strictEqual(result['accept']?.[0], 'text/html');
    assert.strictEqual(result['x-custom-header']?.[0], 'value');
  });

  it('应该处理字符串值', () => {
    const result = normalizeHeaders({
      'content-type': 'application/json',
    });

    assert.deepStrictEqual(result['content-type'], ['application/json']);
  });

  it('应该处理数组值', () => {
    const result = normalizeHeaders({
      'set-cookie': ['cookie1=value1', 'cookie2=value2'],
    });

    assert.deepStrictEqual(result['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
  });

  it('应该去除值前后的空格', () => {
    const result = normalizeHeaders({
      'content-type': '  application/json  ',
      accept: ['  text/html  ', '  text/plain  '],
    });

    assert.strictEqual(result['content-type']?.[0], 'application/json');
    assert.deepStrictEqual(result['accept'], ['text/html', 'text/plain']);
  });

  it('应该跳过 null 和 undefined 值', () => {
    const result = normalizeHeaders({
      'content-type': 'application/json',
      'x-null': null,
      'x-undefined': undefined,
      accept: 'text/html',
    });

    assert.strictEqual(result['x-null'], undefined);
    assert.strictEqual(result['x-undefined'], undefined);
    assert.strictEqual(Object.keys(result).length, 2);
  });

  it('应该过滤数组中的 null 和 undefined', () => {
    const result = normalizeHeaders({
      accept: ['text/html', null, 'text/plain', undefined] as any,
    });

    assert.deepStrictEqual(result['accept'], ['text/html', 'text/plain']);
  });

  it('应该过滤空字符串', () => {
    const result = normalizeHeaders({
      accept: ['text/html', '  ', '', 'text/plain'],
    });

    assert.deepStrictEqual(result['accept'], ['text/html', 'text/plain']);
  });

  it('应该合并相同键名的 headers', () => {
    const headers: any = {
      'set-cookie': 'cookie1=value1',
    };

    const result = normalizeHeaders(headers);
    result['set-cookie']?.push('cookie2=value2');

    assert.deepStrictEqual(result['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
  });

  it('应该处理复杂场景', () => {
    const result = normalizeHeaders({
      'Content-Type': 'application/json',
      ACCEPT: ['text/html', '  application/xml  '],
      'X-Custom': null,
      Authorization: '  Bearer token  ',
      'Set-Cookie': ['cookie1=value1', '', 'cookie2=value2'],
    });

    assert.strictEqual(result['content-type']?.[0], 'application/json');
    assert.deepStrictEqual(result['accept'], ['text/html', 'application/xml']);
    assert.strictEqual(result['x-custom'], undefined);
    assert.strictEqual(result['authorization']?.[0], 'Bearer token');
    assert.deepStrictEqual(result['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
  });
});

describe('getHeaderValue', () => {
  it('应该获取第一个值', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json', 'text/html'],
    };

    const value = getHeaderValue(headers, 'content-type');
    assert.strictEqual(value, 'application/json');
  });

  it('应该不区分大小写', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
    };

    assert.strictEqual(getHeaderValue(headers, 'Content-Type'), 'application/json');
    assert.strictEqual(getHeaderValue(headers, 'CONTENT-TYPE'), 'application/json');
  });

  it('应该返回 undefined 当 header 不存在', () => {
    const headers: NormalizedHeaders = {};

    const value = getHeaderValue(headers, 'content-type');
    assert.strictEqual(value, undefined);
  });

  it('应该返回 undefined 当值数组为空', () => {
    const headers: NormalizedHeaders = {
      'content-type': [],
    };

    const value = getHeaderValue(headers, 'content-type');
    assert.strictEqual(value, undefined);
  });
});

describe('setHeader', () => {
  it('应该设置字符串值', () => {
    const headers: NormalizedHeaders = {};

    setHeader(headers, 'content-type', 'application/json');

    assert.deepStrictEqual(headers['content-type'], ['application/json']);
  });

  it('应该设置数组值', () => {
    const headers: NormalizedHeaders = {};

    setHeader(headers, 'set-cookie', ['cookie1=value1', 'cookie2=value2']);

    assert.deepStrictEqual(headers['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
  });

  it('应该覆盖已存在的值', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['text/html'],
    };

    setHeader(headers, 'content-type', 'application/json');

    assert.deepStrictEqual(headers['content-type'], ['application/json']);
  });

  it('应该将键名转为小写', () => {
    const headers: NormalizedHeaders = {};

    setHeader(headers, 'Content-Type', 'application/json');

    assert.strictEqual(headers['Content-Type'], undefined);
    assert.deepStrictEqual(headers['content-type'], ['application/json']);
  });
});

describe('appendHeader', () => {
  it('应该添加新的 header', () => {
    const headers: NormalizedHeaders = {};

    appendHeader(headers, 'content-type', 'application/json');

    assert.deepStrictEqual(headers['content-type'], ['application/json']);
  });

  it('应该追加到已存在的 header', () => {
    const headers: NormalizedHeaders = {
      'set-cookie': ['cookie1=value1'],
    };

    appendHeader(headers, 'set-cookie', 'cookie2=value2');

    assert.deepStrictEqual(headers['set-cookie'], ['cookie1=value1', 'cookie2=value2']);
  });

  it('应该追加数组值', () => {
    const headers: NormalizedHeaders = {
      accept: ['text/html'],
    };

    appendHeader(headers, 'accept', ['application/json', 'text/plain']);

    assert.deepStrictEqual(headers['accept'], ['text/html', 'application/json', 'text/plain']);
  });

  it('应该将键名转为小写', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['text/html'],
    };

    appendHeader(headers, 'Content-Type', 'application/json');

    assert.deepStrictEqual(headers['content-type'], ['text/html', 'application/json']);
  });
});

describe('deleteHeader', () => {
  it('应该删除存在的 header', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      accept: ['text/html'],
    };

    const result = deleteHeader(headers, 'content-type');

    assert.strictEqual(result, true);
    assert.strictEqual(headers['content-type'], undefined);
    assert.deepStrictEqual(headers['accept'], ['text/html']);
  });

  it('应该返回 false 当 header 不存在', () => {
    const headers: NormalizedHeaders = {
      accept: ['text/html'],
    };

    const result = deleteHeader(headers, 'content-type');

    assert.strictEqual(result, false);
  });

  it('应该不区分大小写', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
    };

    const result = deleteHeader(headers, 'Content-Type');

    assert.strictEqual(result, true);
    assert.strictEqual(headers['content-type'], undefined);
  });
});

describe('集成测试', () => {
  it('应该正确处理完整的 headers 操作流程', () => {
    // 规范化输入
    const headers = normalizeHeaders({
      'Content-Type': 'text/html',
      Accept: ['application/json', 'text/plain'],
    });

    // 获取值
    assert.strictEqual(getHeaderValue(headers, 'content-type'), 'text/html');

    // 设置值
    setHeader(headers, 'content-type', 'application/json');
    assert.strictEqual(getHeaderValue(headers, 'content-type'), 'application/json');

    // 追加值
    appendHeader(headers, 'set-cookie', 'cookie1=value1');
    appendHeader(headers, 'set-cookie', 'cookie2=value2');
    assert.deepStrictEqual(headers['set-cookie'], ['cookie1=value1', 'cookie2=value2']);

    // 删除值
    deleteHeader(headers, 'accept');
    assert.strictEqual(headers['accept'], undefined);

    // 验证最终状态
    assert.deepStrictEqual(Object.keys(headers).sort(), ['content-type', 'set-cookie']);
  });
});

describe('normalizeHeaders', () => {
  it('should return empty object for undefined input', () => {
    const result = normalizeHeaders();
    assert.deepStrictEqual(result, {});
  });

  it('should return empty object for empty input', () => {
    const result = normalizeHeaders({});
    assert.deepStrictEqual(result, {});
  });

  it('should normalize single header', () => {
    const result = normalizeHeaders({ 'Content-Type': 'application/json' });
    assert.deepStrictEqual(result, { 'content-type': ['application/json'] });
  });

  it('should normalize multiple headers', () => {
    const result = normalizeHeaders({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
    });
    assert.deepStrictEqual(result, {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    });
  });

  it('should handle array values', () => {
    const result = normalizeHeaders({
      'Set-Cookie': ['cookie1=value1', 'cookie2=value2'],
    });
    assert.deepStrictEqual(result, {
      'set-cookie': ['cookie1=value1', 'cookie2=value2'],
    });
  });

  it('should skip null and undefined values', () => {
    const result = normalizeHeaders({
      'Content-Type': 'application/json',
      Authorization: null,
      'X-Custom': undefined,
    });
    assert.deepStrictEqual(result, {
      'content-type': ['application/json'],
    });
  });

  it('should trim whitespace from values', () => {
    const result = normalizeHeaders({
      'Content-Type': '  application/json  ',
    });
    assert.deepStrictEqual(result, {
      'content-type': ['application/json'],
    });
  });

  it('should skip empty string values', () => {
    const result = normalizeHeaders({
      'Content-Type': '',
      Authorization: '   ',
    });
    assert.deepStrictEqual(result, {});
  });

  it('should merge duplicate keys', () => {
    const result = normalizeHeaders({
      'x-custom': 'value1',
      'X-Custom': 'value2',
    });
    assert.deepStrictEqual(result, {
      'x-custom': ['value1', 'value2'],
    });
  });

  it('should filter out null values in arrays', () => {
    const result = normalizeHeaders({
      'Set-Cookie': ['cookie1', null, 'cookie2', undefined, ''],
    });
    assert.deepStrictEqual(result, {
      'set-cookie': ['cookie1', 'cookie2'],
    });
  });
});

describe('getHeaderValue', () => {
  it('should return first value of existing header', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json', 'text/plain'],
    };
    const result = getHeaderValue(headers, 'content-type');
    assert.strictEqual(result, 'application/json');
  });

  it('should be case-insensitive', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
    };
    const result = getHeaderValue(headers, 'Content-Type');
    assert.strictEqual(result, 'application/json');
  });

  it('should return undefined for non-existent header', () => {
    const headers: NormalizedHeaders = {};
    const result = getHeaderValue(headers, 'content-type');
    assert.strictEqual(result, undefined);
  });

  it('should return undefined for empty array', () => {
    const headers: NormalizedHeaders = {
      'content-type': [],
    };
    const result = getHeaderValue(headers, 'content-type');
    assert.strictEqual(result, undefined);
  });
});

describe('setHeader', () => {
  it('should set single string value', () => {
    const headers: NormalizedHeaders = {};
    setHeader(headers, 'Content-Type', 'application/json');
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });

  it('should set array values', () => {
    const headers: NormalizedHeaders = {};
    setHeader(headers, 'Set-Cookie', ['cookie1', 'cookie2']);
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1', 'cookie2'],
    });
  });

  it('should override existing header', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['text/plain'],
    };
    setHeader(headers, 'Content-Type', 'application/json');
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });

  it('should be case-insensitive', () => {
    const headers: NormalizedHeaders = {};
    setHeader(headers, 'Content-Type', 'application/json');
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });
});

describe('appendHeader', () => {
  it('should append to non-existent header', () => {
    const headers: NormalizedHeaders = {};
    appendHeader(headers, 'Set-Cookie', 'cookie1');
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1'],
    });
  });

  it('should append to existing header', () => {
    const headers: NormalizedHeaders = {
      'set-cookie': ['cookie1'],
    };
    appendHeader(headers, 'Set-Cookie', 'cookie2');
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1', 'cookie2'],
    });
  });

  it('should append array values', () => {
    const headers: NormalizedHeaders = {
      'set-cookie': ['cookie1'],
    };
    appendHeader(headers, 'Set-Cookie', ['cookie2', 'cookie3']);
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1', 'cookie2', 'cookie3'],
    });
  });

  it('should be case-insensitive', () => {
    const headers: NormalizedHeaders = {
      'set-cookie': ['cookie1'],
    };
    appendHeader(headers, 'SET-COOKIE', 'cookie2');
    assert.deepStrictEqual(headers, {
      'set-cookie': ['cookie1', 'cookie2'],
    });
  });
});

describe('deleteHeader', () => {
  it('should delete existing header and return true', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
    };
    const result = deleteHeader(headers, 'content-type');
    assert.strictEqual(result, true);
    assert.deepStrictEqual(headers, {});
  });

  it('should return false for non-existent header', () => {
    const headers: NormalizedHeaders = {};
    const result = deleteHeader(headers, 'content-type');
    assert.strictEqual(result, false);
  });

  it('should be case-insensitive', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
    };
    const result = deleteHeader(headers, 'Content-Type');
    assert.strictEqual(result, true);
    assert.deepStrictEqual(headers, {});
  });

  it('should not affect other headers', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    };
    deleteHeader(headers, 'content-type');
    assert.deepStrictEqual(headers, {
      authorization: ['Bearer token'],
    });
  });
});

describe('stripHopByHopHeaders', () => {
  it('should remove all hop-by-hop headers', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      connection: ['keep-alive'],
      'transfer-encoding': ['chunked'],
      'content-length': ['100'],
      upgrade: ['websocket'],
      authorization: ['Bearer token'],
    };
    stripHopByHopHeaders(headers);
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    });
  });

  it('should handle empty headers object', () => {
    const headers: NormalizedHeaders = {};
    stripHopByHopHeaders(headers);
    assert.deepStrictEqual(headers, {});
  });

  it('should remove all standard hop-by-hop headers', () => {
    const headers: NormalizedHeaders = {
      connection: ['close'],
      'transfer-encoding': ['chunked'],
      'content-length': ['200'],
      trailer: ['Expires'],
      upgrade: ['h2c'],
      expect: ['100-continue'],
      'keep-alive': ['timeout=5'],
      'proxy-connection': ['keep-alive'],
    };
    stripHopByHopHeaders(headers);
    assert.deepStrictEqual(headers, {});
  });
});

describe('sanitizeHeaders', () => {
  it('should remove hop-by-hop headers', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      connection: ['keep-alive'],
      'transfer-encoding': ['chunked'],
    };
    sanitizeHeaders(headers);
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
    });
  });

  it('should remove custom hop-by-hop headers from Connection header', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      connection: ['close, x-custom-header'],
      'x-custom-header': ['value'],
    };
    sanitizeHeaders(headers);

    assert.strictEqual(headers['x-custom-header'], undefined);
  });

  it('should handle headers without connection header', () => {
    const headers: NormalizedHeaders = {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    };
    sanitizeHeaders(headers);
    assert.deepStrictEqual(headers, {
      'content-type': ['application/json'],
      authorization: ['Bearer token'],
    });
  });
});
