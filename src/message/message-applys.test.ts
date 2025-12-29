import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import { setTimeout } from 'node:timers/promises';

import type { Body, NormalizedHeaders, RequestStartLine, ResponseStartLine } from '../types.js';
import { decideBodyHeaders } from './message-applys.js';

// Mock 依赖模块
// 辅助函数：创建空的 headers 对象
const createHeaders = (): NormalizedHeaders => ({});

// 辅助函数：创建请求起始行
const createRequestStartLine = (method: string): RequestStartLine => ({
  method,
  path: '/',
  version: 1.1,
});

// 辅助函数：创建响应起始行
const createResponseStartLine = (statusCode: number): ResponseStartLine => ({
  statusCode,
  statusText: 'OK',
  version: 1.1,
});

describe('decideBodyHeaders', () => {
  describe('流式 Body 处理', () => {
    it('应该为流式 body 设置 transfer-encoding: chunked', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('POST');
      async function *streamBody() {
        await setTimeout(10);
        yield Buffer.from('aa');
      }

      decideBodyHeaders(startLine, headers, streamBody());

      assert.strictEqual(headers['transfer-encoding']?.[0], 'chunked');
      assert.strictEqual(headers['content-length'], undefined);
      assert.strictEqual(headers['content-range'], undefined);
    });

    it('应该删除现有的 content-length 和 content-range', () => {
      const headers: NormalizedHeaders = {
        'content-length': ['100'],
        'content-range': ['bytes 0-99/100'],
      };
      const startLine = createRequestStartLine('POST');
      async function *streamBody() {
        await setTimeout(10);
        yield Buffer.from('aa');
      }

      decideBodyHeaders(startLine, headers, streamBody());

      assert.strictEqual(headers['content-length'], undefined);
      assert.strictEqual(headers['content-range'], undefined);
      assert.strictEqual(headers['transfer-encoding']?.[0], 'chunked');
    });
  });

  describe('空 Body 处理 - 请求', () => {
    it('应该为 null body 的 POST 请求设置 content-length: 0', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('POST');

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length']?.[0], '0');
    });

    it('应该为 null body 的 PUT 请求设置 content-length: 0', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('PUT');

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length']?.[0], '0');
    });

    it('不应该为 GET 请求设置 content-length', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('GET');

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length'], undefined);
    });

    it('不应该为 HEAD 请求设置 content-length', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('HEAD');

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length'], undefined);
    });

    it('不应该为 OPTIONS 请求设置 content-length', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('OPTIONS');

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length'], undefined);
    });

    it('不应该为 TRACE 请求设置 content-length', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('TRACE');

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length'], undefined);
    });

    it('应该处理小写的方法名', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('post');

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length']?.[0], '0');
    });
  });

  describe('空 Body 处理 - 响应', () => {
    it('应该为 200 响应设置 content-length: 0', () => {
      const headers = createHeaders();
      const startLine = createResponseStartLine(200);

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length']?.[0], '0');
    });

    it('不应该为 1xx 响应设置 content-length', () => {
      const headers = createHeaders();
      const startLine = createResponseStartLine(100);

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length'], undefined);
    });

    it('不应该为 204 No Content 响应设置 content-length', () => {
      const headers = createHeaders();
      const startLine = createResponseStartLine(204);

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length'], undefined);
    });

    it('不应该为 304 Not Modified 响应设置 content-length', () => {
      const headers = createHeaders();
      const startLine = createResponseStartLine(304);

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length'], undefined);
    });

    it('应该为 404 响应设置 content-length: 0', () => {
      const headers = createHeaders();
      const startLine = createResponseStartLine(404);

      decideBodyHeaders(startLine, headers, null);

      assert.strictEqual(headers['content-length']?.[0], '0');
    });
  });

  describe('零长度 Body 处理', () => {
    it('应该将空字符串 body 当作零长度处理', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('POST');

      decideBodyHeaders(startLine, headers, '');

      assert.strictEqual(headers['content-length']?.[0], '0');
    });

    it('应该将空 Buffer 当作零长度处理', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('POST');

      decideBodyHeaders(startLine, headers, Buffer.from(''));

      assert.strictEqual(headers['content-length']?.[0], '0');
    });
  });

  describe('固定长度 Body 处理', () => {
    it('应该为字符串 body 设置正确的 content-length', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('POST');
      const body = 'Hello World';

      decideBodyHeaders(startLine, headers, body);

      assert.strictEqual(headers['content-length']?.[0], '11');
      assert.strictEqual(headers['transfer-encoding'], undefined);
    });

    it('应该为 Buffer body 设置正确的 content-length', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('POST');
      const body = Buffer.from('Hello World');

      decideBodyHeaders(startLine, headers, body);

      assert.strictEqual(headers['content-length']?.[0], '11');
      assert.strictEqual(headers['transfer-encoding'], undefined);
    });

    it('应该删除现有的 transfer-encoding header', () => {
      const headers: NormalizedHeaders = {
        'transfer-encoding': ['chunked'],
      };
      const startLine = createRequestStartLine('POST');
      const body = 'Hello World';

      decideBodyHeaders(startLine, headers, body);

      assert.strictEqual(headers['transfer-encoding'], undefined);
      assert.strictEqual(headers['content-length']?.[0], '11');
    });

    it('应该处理响应的固定长度 body', () => {
      const headers = createHeaders();
      const startLine = createResponseStartLine(200);
      const body = 'Response body';

      decideBodyHeaders(startLine, headers, body);

      assert.strictEqual(headers['content-length']?.[0], '13');
      assert.strictEqual(headers['transfer-encoding'], undefined);
    });
  });

  describe('边界情况', () => {
    it('应该处理 undefined body', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('POST');

      decideBodyHeaders(startLine, headers, undefined as any);

      assert.strictEqual(headers['content-length']?.[0], '0');
    });

    it('应该处理没有 method 的请求起始行', () => {
      const headers = createHeaders();
      const startLine = { method: undefined } as any;

      assert.doesNotThrow(() => {
        decideBodyHeaders(startLine, headers, null);
      });
    });

    it('应该处理非常大的 body', () => {
      const headers = createHeaders();
      const startLine = createRequestStartLine('POST');
      const body = 'x'.repeat(1000000);

      decideBodyHeaders(startLine, headers, body);

      assert.strictEqual(headers['content-length']?.[0], '1000000');
    });
  });
});
