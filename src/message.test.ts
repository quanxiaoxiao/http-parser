import * as assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';

import { decodeRequest } from './decode/message.js';
import { encodeRequest } from './encode/message.js';

describe('HTTP Request 编码解码测试', () => {
  describe('基本功能测试', () => {
    test('应该正确编码和解码简单的GET请求', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/users',
        },
        headers: {
          Host: 'example.com',
          'User-Agent': 'TestClient/1.0',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.startLine.raw, 'GET /api/users HTTP/1.1');
      assert.strictEqual(requestState.headersState.headers.host, 'example.com');
      assert.strictEqual(requestState.headersState.headers['user-agent'], 'TestClient/1.0');
    });

    test('应该正确编码和解码POST请求与字符串body', async () => {
      const bodyContent = 'Hello, World!';
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/message',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'text/plain',
        },
        body: bodyContent,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.startLine.method, 'POST');
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        bodyContent,
      );
    });

    test('应该正确处理PUT请求', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'PUT',
          path: '/api/resource/123',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.startLine.method, 'PUT');
      assert.strictEqual(requestState.startLine.path, '/api/resource/123');
    });

    test('应该正确处理DELETE请求', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'DELETE',
          path: '/api/resource/456',
        },
        headers: {
          Host: 'example.com',
          Authorization: 'Bearer token123',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.startLine.method, 'DELETE');
      assert.strictEqual(requestState.headersState.headers.authorization, 'Bearer token123');
    });
  });

  describe('流式上传测试', () => {
    test('应该正确处理流式上传数据', async () => {
      async function* generateData() {
        const file = await open(path.join(process.cwd(), 'package-lock.json'));
        for await (const chunk of file.readableWebStream()) {
          yield chunk;
          await setTimeout(10); // 减少延迟以加快测试
        }
        await file.close();
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/upload',
        },
        headers: {
          Host: 'example.com',
        },
        body: generateData(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.startLine.raw, 'POST /api/upload HTTP/1.1');
      assert.deepStrictEqual(requestState.headersState.headers.host, 'example.com');
      assert.strictEqual(requestState.headersState.headers['transfer-encoding'], 'chunked');

      const expectedContent = readFileSync(
        path.join(process.cwd(), 'package-lock.json'),
        'utf-8',
      );
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        expectedContent,
      );
    });

    test('应该正确处理小文件流式上传', async () => {
      const testData = 'Test content for streaming';
      const testFilePath = path.join(process.cwd(), 'test-temp-file.txt');

      // 创建测试文件
      writeFileSync(testFilePath, testData);

      async function* generateData() {
        const file = await open(testFilePath);
        for await (const chunk of file.readableWebStream()) {
          yield chunk;
        }
        await file.close();
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/upload',
        },
        headers: {
          Host: 'example.com',
        },
        body: generateData(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        testData,
      );

      // 清理测试文件
      try {
        const { unlinkSync } = await import('node:fs');
        unlinkSync(testFilePath);
      } catch (e) {
        // 忽略清理错误
      }
    });

    test('应该正确处理分块的流式数据', async () => {
      async function* generateChunks() {
        const chunks = ['chunk1', 'chunk2', 'chunk3'];
        for (const chunk of chunks) {
          yield Buffer.from(chunk);
          await setTimeout(5);
        }
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/data',
        },
        headers: {
          Host: 'example.com',
        },
        body: generateChunks(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        'chunk1chunk2chunk3',
      );
    });
  });

  describe('Headers测试', () => {
    test('应该正确处理多个headers', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/data',
        },
        headers: {
          Host: 'example.com',
          'User-Agent': 'TestClient/1.0',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          Authorization: 'Bearer token123',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      const headers = requestState.headersState.headers;
      assert.strictEqual(headers.host, 'example.com');
      assert.strictEqual(headers['user-agent'], 'TestClient/1.0');
      assert.strictEqual(headers.accept, 'application/json');
      assert.strictEqual(headers['accept-encoding'], 'gzip, deflate');
      assert.strictEqual(headers.authorization, 'Bearer token123');
    });

    test('应该正确处理空headers', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/',
        },
        headers: {},
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.startLine.method, 'GET');
    });
  });

  describe('Body测试', () => {
    test('应该正确处理JSON body', async () => {
      const bodyData = { name: 'John', age: 30 };
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/users',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyData),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      const receivedBody = Buffer.concat(requestState.bodyState.bodyChunks).toString();
      assert.deepStrictEqual(JSON.parse(receivedBody), bodyData);
    });

    test('应该正确处理空body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/data',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      if (requestState.bodyState && requestState.bodyState.bodyChunks) {
        assert.strictEqual(requestState.bodyState.bodyChunks.length, 0);
      }
    });

    test('应该正确处理二进制body', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/binary',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'application/octet-stream',
        },
        body: binaryData,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      const receivedBody = Buffer.concat(requestState.bodyState.bodyChunks);
      assert.deepStrictEqual(receivedBody, binaryData);
    });
  });

  describe('路径测试', () => {
    test('应该正确处理带查询参数的路径', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/search?q=test&limit=10',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.startLine.path, '/api/search?q=test&limit=10');
    });

    test('应该正确处理根路径', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.startLine.path, '/');
    });

    test('应该正确处理复杂路径', async () => {
      const complexPath = '/api/v1/users/123/posts/456/comments';
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: complexPath,
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.startLine.path, complexPath);
    });
  });

  describe('边界情况测试', () => {
    test('应该正确处理大量headers', async () => {
      const manyHeaders = {};
      for (let i = 0; i < 50; i++) {
        manyHeaders[`X-Custom-Header-${i}`] = `value-${i}`;
      }
      manyHeaders.Host = 'example.com';

      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test',
        },
        headers: manyHeaders,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState.finished);
      assert.strictEqual(requestState.headersState.headers.host, 'example.com');
      assert.strictEqual(
        requestState.headersState.headers['x-custom-header-0'],
        'value-0',
      );
    });

  });
});

describe('HTTP Request Encoding and Decoding', () => {
  describe('POST requests with Buffer body', () => {
    test('should encode and decode POST request with Buffer body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/test1',
        },
        headers: {
          Host: 'example.com',
        },
        body: Buffer.from('aaa'),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'POST /api/test1 HTTP/1.1');
      assert.deepStrictEqual(requestState!.headersState!.headers, {
        host: 'example.com',
        'content-length': '3',
      });
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), 'aaa');
    });

    test('should handle POST request with empty Buffer body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/empty',
        },
        headers: {
          Host: 'example.com',
        },
        body: Buffer.from(''),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'POST /api/empty HTTP/1.1');
      assert.deepStrictEqual(requestState!.headersState!.headers, {
        host: 'example.com',
        'content-length': '0',
      });
    });

    test('should handle POST request with large Buffer body', async () => {
      const largeData = Buffer.alloc(10000, 'x');
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/large',
        },
        headers: {
          Host: 'example.com',
        },
        body: largeData,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).length, 10000);
      assert.strictEqual(requestState!.headersState!.headers['content-length'], '10000');
    });

    test('should handle POST request with binary data', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]);
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/binary',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'application/octet-stream',
        },
        body: binaryData,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.deepStrictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks), binaryData);
    });
  });

  describe('GET requests with string body', () => {
    test('should encode and decode GET request with string body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test2',
        },
        headers: {
          Host: 'example.com',
        },
        body: 'bbb',
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'GET /api/test2 HTTP/1.1');
      assert.deepStrictEqual(requestState!.headersState!.headers, {
        host: 'example.com',
        'content-length': '3',
      });
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), 'bbb');
    });

    test('should handle GET request with UTF-8 string body', async () => {
      const unicodeString = '你好世界🌍';
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/unicode',
        },
        headers: {
          Host: 'example.com',
        },
        body: unicodeString,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), unicodeString);
    });

    test('should handle GET request with empty string body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/empty-string',
        },
        headers: {
          Host: 'example.com',
        },
        body: '',
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.ok(!requestState!.headersState!.headers['content-length']);
    });
  });

  describe('Requests without body', () => {
    test('should encode and decode GET request without body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test3',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'GET /api/test3 HTTP/1.1');
      assert.deepStrictEqual(requestState!.headersState!.headers, { host: 'example.com' });
      assert.strictEqual(requestState!.bodyState, null);
    });

    test('should handle DELETE request without body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'DELETE',
          path: '/api/resource/123',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'DELETE /api/resource/123 HTTP/1.1');
      assert.strictEqual(requestState!.bodyState, null);
    });

    test('should handle HEAD request without body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'HEAD',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'HEAD /api/test HTTP/1.1');
      assert.strictEqual(requestState!.bodyState, null);
    });

    test('should handle OPTIONS request without body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'OPTIONS',
          path: '*',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'OPTIONS * HTTP/1.1');
      assert.strictEqual(requestState!.bodyState, null);
    });
  });

  describe('Chunked transfer encoding with AsyncIterable', () => {
    test('should encode and decode request with chunked body', async () => {
      async function* generateData(): AsyncIterable<Buffer> {
        await setTimeout(100);
        yield Buffer.from('111');
        await setTimeout(100);
        yield Buffer.from('222');
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/upload',
        },
        headers: {
          Host: 'example.com',
        },
        body: generateData(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'POST /api/upload HTTP/1.1');
      assert.deepStrictEqual(requestState!.headersState!.headers, {
        host: 'example.com',
        'transfer-encoding': 'chunked',
      });
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), '111222');
    });

    test('should handle chunked body with single chunk', async () => {
      async function* generateData(): AsyncIterable<Buffer> {
        yield Buffer.from('single-chunk');
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/single-chunk',
        },
        headers: {
          Host: 'example.com',
        },
        body: generateData(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), 'single-chunk');
    });

    test('should handle chunked body with many small chunks', async () => {
      async function* generateData(): AsyncIterable<Buffer> {
        for (let i = 0; i < 10; i++) {
          yield Buffer.from(`chunk${i}`);
        }
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/many-chunks',
        },
        headers: {
          Host: 'example.com',
        },
        body: generateData(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      const expected = 'chunk0chunk1chunk2chunk3chunk4chunk5chunk6chunk7chunk8chunk9';
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), expected);
    });

    test('should handle chunked body with empty chunks', async () => {
      async function* generateData(): AsyncIterable<Buffer> {
        yield Buffer.from('start');
        yield Buffer.from('');
        yield Buffer.from('middle');
        yield Buffer.from('');
        yield Buffer.from('end');
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/empty-chunks',
        },
        headers: {
          Host: 'example.com',
        },
        body: generateData(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), 'startmiddleend');
    });

    test('should handle chunked body with large chunks', async () => {
      async function* generateData(): AsyncIterable<Buffer> {
        yield Buffer.alloc(5000, 'a');
        yield Buffer.alloc(5000, 'b');
        yield Buffer.alloc(5000, 'c');
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/large-chunks',
        },
        headers: {
          Host: 'example.com',
        },
        body: generateData(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).length, 15000);
    });
  });

  describe('Different HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];

    methods.forEach(method => {
      test(`should handle ${method} request`, async () => {
        const request = encodeRequest({
          startLine: {
            method,
            path: '/api/test',
          },
          headers: {
            Host: 'example.com',
          },
        });

        let requestState = null;
        for await (const chunk of request) {
          requestState = decodeRequest(requestState, chunk);
        }

        assert.ok(requestState!.finished);
        assert.strictEqual(requestState!.startLine!.raw, `${method} /api/test HTTP/1.1`);
      });
    });
  });

  describe('Different URL paths', () => {
    test('should handle root path', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'GET / HTTP/1.1');
    });

    test('should handle path with query parameters', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/search?q=test&limit=10',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'GET /api/search?q=test&limit=10 HTTP/1.1');
    });

    test('should handle path with encoded characters', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/path%20with%20spaces',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'GET /api/path%20with%20spaces HTTP/1.1');
    });

    test('should handle long path', async () => {
      const longPath = '/api/' + 'segment/'.repeat(50) + 'end';
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: longPath,
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.ok(requestState!.startLine!.raw.includes(longPath));
    });
  });

  describe('Multiple and custom headers', () => {
    test('should handle multiple headers', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
          'X-Custom-Header': 'custom-value',
          'User-Agent': 'Node.js Test',
        },
        body: Buffer.from('test'),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.headersState!.headers['host'], 'example.com');
      assert.strictEqual(requestState!.headersState!.headers['content-type'], 'application/json');
      assert.strictEqual(requestState!.headersState!.headers['authorization'], 'Bearer token123');
      assert.strictEqual(requestState!.headersState!.headers['x-custom-header'], 'custom-value');
      assert.strictEqual(requestState!.headersState!.headers['user-agent'], 'Node.js Test');
    });

    test('should handle headers with special characters', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
          'X-Special': 'value-with-dashes',
          'X-Numbers': '12345',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.headersState!.headers['x-special'], 'value-with-dashes');
      assert.strictEqual(requestState!.headersState!.headers['x-numbers'], '12345');
    });

    test('should handle case-insensitive header names', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test',
        },
        headers: {
          HOST: 'example.com',
          'Content-Type': 'text/plain',
        },
        body: 'test',
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      // Headers should be normalized to lowercase
      assert.ok('host' in requestState!.headersState!.headers);
    });
  });

  describe('Edge cases and boundary conditions', () => {
    test('should handle request with only required fields', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/',
        },
        headers: {},
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(requestState!.startLine!.raw, 'GET / HTTP/1.1');
    });

    test('should handle incremental decoding', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
        },
        body: Buffer.from('test data'),
      });

      let requestState = null;
      let chunkCount = 0;

      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
        chunkCount++;
      }

      assert.ok(requestState!.finished);
      assert.ok(chunkCount > 0);
    });

    test('should maintain state between decoding steps', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
        },
        body: Buffer.from('test'),
      });

      let requestState = null;
      const states = [];

      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
        states.push({ ...requestState });
      }

      assert.ok(states.length > 0);
      assert.ok(states[states.length - 1].finished);
    });
  });

  describe('Content-Type variations', () => {
    const contentTypes = [
      'application/json',
      'application/xml',
      'text/html',
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'application/octet-stream',
    ];

    contentTypes.forEach(contentType => {
      test(`should handle ${contentType} content type`, async () => {
        const request = encodeRequest({
          startLine: {
            method: 'POST',
            path: '/api/test',
          },
          headers: {
            Host: 'example.com',
            'Content-Type': contentType,
          },
          body: Buffer.from('test data'),
        });

        let requestState = null;
        for await (const chunk of request) {
          requestState = decodeRequest(requestState, chunk);
        }

        assert.ok(requestState!.finished);
        assert.strictEqual(requestState!.headersState!.headers['content-type'], contentType);
      });
    });
  });

  describe('Real-world scenarios', () => {
    test('should handle JSON API request', async () => {
      const jsonData = JSON.stringify({ name: 'test', value: 123 });
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/data',
        },
        headers: {
          Host: 'api.example.com',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: Buffer.from(jsonData),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      const receivedData = Buffer.concat(requestState!.bodyState!.bodyChunks).toString();
      assert.deepStrictEqual(JSON.parse(receivedData), { name: 'test', value: 123 });
    });

    test('should handle form submission', async () => {
      const formData = 'username=test&password=secret&remember=true';
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/login',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: Buffer.from(formData),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), formData);
    });

    test('should handle streaming file upload simulation', async () => {
      async function* generateFileData(): AsyncIterable<Buffer> {
        // Simulate reading file in chunks
        for (let i = 0; i < 5; i++) {
          await setTimeout(10);
          yield Buffer.from(`file-chunk-${i}-`);
        }
      }

      const request = encodeRequest({
        startLine: {
          method: 'PUT',
          path: '/upload/file.txt',
        },
        headers: {
          Host: 'storage.example.com',
          'Content-Type': 'text/plain',
        },
        body: generateFileData(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.ok(requestState!.finished);
      const uploaded = Buffer.concat(requestState!.bodyState!.bodyChunks).toString();
      assert.ok(uploaded.includes('file-chunk-0-'));
      assert.ok(uploaded.includes('file-chunk-4-'));
    });
  });
});
