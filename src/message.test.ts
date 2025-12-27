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
