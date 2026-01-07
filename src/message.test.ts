import * as assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';

import { HttpDecodePhase } from './specs.js';
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.startLine.method, 'PUT');
      assert.strictEqual(requestState.startLine.path, '/api/resource/123');
    });

    test('应该正确处理PATCH请求', async () => {
      const patchData = JSON.stringify({ status: 'updated' });
      const request = encodeRequest({
        startLine: {
          method: 'PATCH',
          path: '/api/resource/789',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'application/json',
        },
        body: patchData,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.startLine.method, 'PATCH');
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        patchData,
      );
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
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
          await setTimeout(10);
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        testData,
      );

      try {
        const { unlinkSync } = await import('node:fs');
        unlinkSync(testFilePath);
      } catch (err) {
        // ignore
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        'chunk1chunk2chunk3',
      );
    });

    test('应该正确处理包含空chunk的流式数据', async () => {
      async function* generateData() {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        'startmiddleend',
      );
    });

    test('应该正确处理大块流式数据', async () => {
      async function* generateData() {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(Buffer.concat(requestState.bodyState.bodyChunks).length, 15000);
    });

    test('应该正确处理单个chunk的流式数据', async () => {
      async function* generateData() {
        yield Buffer.from('single-chunk-data');
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/single',
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        'single-chunk-data',
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.startLine.method, 'GET');
    });

    test('应该正确处理大小写不敏感的header名称', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test',
        },
        headers: {
          HOST: 'example.com',
          'Content-Type': 'text/plain',
          'ACCEPT-ENCODING': 'gzip',
        },
        body: 'test',
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.ok('host' in requestState.headersState.headers);
      assert.ok('content-type' in requestState.headersState.headers);
      assert.ok('accept-encoding' in requestState.headersState.headers);
    });

    test('应该正确处理包含特殊字符的header值', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
          'X-Special': 'value-with-dashes_and_underscores',
          'X-Numbers': '12345',
          'X-Mixed': 'ABC123-xyz_789',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        requestState.headersState.headers['x-special'],
        'value-with-dashes_and_underscores',
      );
      assert.strictEqual(requestState.headersState.headers['x-numbers'], '12345');
      assert.strictEqual(requestState.headersState.headers['x-mixed'], 'ABC123-xyz_789');
    });

    test('应该正确处理大量自定义headers', async () => {
      const manyHeaders = { Host: 'example.com' };
      for (let i = 0; i < 50; i++) {
        manyHeaders[`X-Custom-Header-${i}`] = `value-${i}`;
      }

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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.headersState.headers.host, 'example.com');
      assert.strictEqual(requestState.headersState.headers['x-custom-header-0'], 'value-0');
      assert.strictEqual(requestState.headersState.headers['x-custom-header-49'], 'value-49');
    });

    test('应该正确处理包含空格的header值', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
          'X-Description': 'This is a header value with spaces',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        requestState.headersState.headers['x-description'],
        'This is a header value with spaces',
      );
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      if (requestState.bodyState && requestState.bodyState.bodyChunks) {
        assert.strictEqual(requestState.bodyState.bodyChunks.length, 0);
      }
    });

    test('应该正确处理空字符串body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/empty',
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.deepStrictEqual(requestState.headersState.headers['content-length'], '0');
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      const receivedBody = Buffer.concat(requestState.bodyState.bodyChunks);
      assert.deepStrictEqual(receivedBody, binaryData);
    });

    test('应该正确处理Buffer body', async () => {
      const bufferData = Buffer.from('test buffer data');
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/buffer',
        },
        headers: {
          Host: 'example.com',
        },
        body: bufferData,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        'test buffer data',
      );
      assert.strictEqual(requestState.headersState.headers['content-length'], '16');
    });

    test('应该正确处理大型Buffer body', async () => {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(Buffer.concat(requestState.bodyState.bodyChunks).length, 10000);
      assert.strictEqual(requestState.headersState.headers['content-length'], '10000');
    });

    test('应该正确处理UTF-8编码的字符串body', async () => {
      const unicodeString = '你好世界🌍🚀';
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/unicode',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: unicodeString,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        unicodeString,
      );
    });

    test('应该正确处理复杂的JSON结构', async () => {
      const complexData = {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          roles: ['admin', 'user'],
        },
        metadata: {
          created: new Date().toISOString(),
          tags: ['important', 'urgent'],
        },
      };

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/complex',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(complexData),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      const receivedBody = JSON.parse(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
      );
      assert.deepStrictEqual(receivedBody, complexData);
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.startLine.path, complexPath);
    });

    test('应该正确处理带编码字符的路径', async () => {
      const encodedPath = '/api/path%20with%20spaces/file%2Fname.txt';
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: encodedPath,
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.startLine.path, encodedPath);
    });

    test('应该正确处理带锚点的路径', async () => {
      const pathWithFragment = '/api/docs#section-1';
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: pathWithFragment,
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.startLine.path, pathWithFragment);
    });

    test('应该正确处理很长的路径', async () => {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.ok(requestState.startLine.raw.includes(longPath));
    });

    test('应该正确处理复杂查询参数', async () => {
      const complexQuery =
        '/api/search?q=test&tags[]=a&tags[]=b&filter[status]=active&sort=-created_at';
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: complexQuery,
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.startLine.path, complexQuery);
    });
  });

  describe('HTTP方法测试', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];

    methods.forEach((method) => {
      test(`应该正确处理${method}请求`, async () => {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
        assert.strictEqual(requestState.startLine.raw, `${method} /api/test HTTP/1.1`);
        assert.strictEqual(requestState.startLine.method, method);
      });
    });

    test('应该正确处理HEAD请求不包含body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'HEAD',
          path: '/api/resource',
        },
        headers: {
          Host: 'example.com',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.bodyState, null);
    });

    test('应该正确处理OPTIONS请求与星号路径', async () => {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.startLine.path, '*');
    });
  });

  describe('Content-Type测试', () => {
    const contentTypes = [
      'application/json',
      'application/xml',
      'text/html',
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'application/octet-stream',
      'image/jpeg',
      'video/mp4',
    ];

    contentTypes.forEach((contentType) => {
      test(`应该正确处理${contentType}类型`, async () => {
        const request = encodeRequest({
          startLine: {
            method: 'POST',
            path: '/api/upload',
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
        assert.strictEqual(requestState.headersState.headers['content-type'], contentType);
      });
    });

    test('应该正确处理带charset的Content-Type', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/data',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': 'text/html; charset=utf-8',
        },
        body: '<html><body>Hello</body></html>',
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        requestState.headersState.headers['content-type'],
        'text/html; charset=utf-8',
      );
    });

    test('应该正确处理带boundary的multipart/form-data', async () => {
      const contentType = 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/upload',
        },
        headers: {
          Host: 'example.com',
          'Content-Type': contentType,
        },
        body: 'form data',
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.headersState.headers['content-type'], contentType);
    });
  });

  describe('真实场景测试', () => {
    test('应该正确处理JSON API请求', async () => {
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
          Authorization: 'Bearer token123',
        },
        body: jsonData,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      const receivedData = Buffer.concat(requestState.bodyState.bodyChunks).toString();
      assert.deepStrictEqual(JSON.parse(receivedData), { name: 'test', value: 123 });
    });

    test('应该正确处理表单提交', async () => {
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
        body: formData,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(Buffer.concat(requestState.bodyState.bodyChunks).toString(), formData);
    });

    test('应该正确处理流式文件上传模拟', async () => {
      async function* generateFileData() {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      const uploaded = Buffer.concat(requestState.bodyState.bodyChunks).toString();
      assert.ok(uploaded.includes('file-chunk-0-'));
      assert.ok(uploaded.includes('file-chunk-4-'));
    });

    test('应该正确处理GraphQL请求', async () => {
      const graphqlQuery = {
        query: 'query { user(id: "123") { name, email } }',
        variables: { id: '123' },
      };

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/graphql',
        },
        headers: {
          Host: 'api.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(graphqlQuery),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      const received = JSON.parse(Buffer.concat(requestState.bodyState.bodyChunks).toString());
      assert.deepStrictEqual(received, graphqlQuery);
    });

    test('应该正确处理REST API PATCH请求', async () => {
      const patchData = [
        { op: 'replace', path: '/status', value: 'active' },
        { op: 'add', path: '/tags/-', value: 'important' },
      ];

      const request = encodeRequest({
        startLine: {
          method: 'PATCH',
          path: '/api/resources/123',
        },
        headers: {
          Host: 'api.example.com',
          'Content-Type': 'application/json-patch+json',
        },
        body: JSON.stringify(patchData),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      const received = JSON.parse(Buffer.concat(requestState.bodyState.bodyChunks).toString());
      assert.deepStrictEqual(received, patchData);
    });

    test('应该正确处理带认证的请求', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/protected',
        },
        headers: {
          Host: 'api.example.com',
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          'X-API-Key': 'abc123xyz',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.ok(requestState.headersState.headers.authorization.startsWith('Bearer'));
      assert.strictEqual(requestState.headersState.headers['x-api-key'], 'abc123xyz');
    });
  });

  describe('边界情况和错误处理测试', () => {
    test('应该正确处理仅包含必需字段的请求', async () => {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.startLine.raw, 'GET / HTTP/1.1');
    });

    test('应该正确处理增量解码', async () => {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.ok(chunkCount > 0);
    });

    test('应该在解码步骤之间保持状态', async () => {
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
      assert.deepStrictEqual(states[states.length - 1].phase, HttpDecodePhase.FINISHED);
    });

    test('应该正确处理极小的body', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/tiny',
        },
        headers: {
          Host: 'example.com',
        },
        body: 'x',
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(Buffer.concat(requestState.bodyState.bodyChunks).toString(), 'x');
    });

    test('应该正确处理很长的header值', async () => {
      const longValue = 'a'.repeat(1000);
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
          'X-Long-Header': longValue,
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.headersState.headers['x-long-header'], longValue);
    });

    test('应该正确处理多个相同类型但不同值的自定义headers', async () => {
      const request = encodeRequest({
        startLine: {
          method: 'GET',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
          'X-Request-ID': '123',
          'X-Session-ID': '456',
          'X-Trace-ID': '789',
        },
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.headersState.headers['x-request-id'], '123');
      assert.strictEqual(requestState.headersState.headers['x-session-id'], '456');
      assert.strictEqual(requestState.headersState.headers['x-trace-id'], '789');
    });
  });

  describe('性能和压力测试', () => {
    test('应该正确处理大量小请求连续编码解码', async () => {
      for (let i = 0; i < 100; i++) {
        const request = encodeRequest({
          startLine: {
            method: 'GET',
            path: `/api/test/${i}`,
          },
          headers: {
            Host: 'example.com',
          },
        });

        let requestState = null;
        for await (const chunk of request) {
          requestState = decodeRequest(requestState, chunk);
        }

        assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
        assert.strictEqual(requestState.startLine.path, `/api/test/${i}`);
      }
    });

    test('应该正确处理非常大的body数据', async () => {
      const hugeData = Buffer.alloc(100000, 'x');
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/huge',
        },
        headers: {
          Host: 'example.com',
        },
        body: hugeData,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(Buffer.concat(requestState.bodyState.bodyChunks).length, 100000);
    });

    test('应该正确处理包含大量chunk的流式传输', async () => {
      async function* generateManyChunks() {
        for (let i = 0; i < 1000; i++) {
          yield Buffer.from(`chunk${i}`);
        }
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/stream',
        },
        headers: {
          Host: 'example.com',
        },
        body: generateManyChunks(),
      });

      let requestState = null;
      let chunkCount = 0;

      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
        chunkCount++;
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.ok(chunkCount > 0);
    });
  });

  describe('特殊字符和编码测试', () => {
    test('应该正确处理包含特殊字符的body', async () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/special',
        },
        headers: {
          Host: 'example.com',
        },
        body: specialChars,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.bodyChunks).toString(),
        specialChars,
      );
    });

    test('应该正确处理各种语言的Unicode字符', async () => {
      const multiLang = '中文 日本語 한국어 العربية עברית Ελληνικά Русский';
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/multilang',
        },
        headers: {
          Host: 'example.com',
        },
        body: multiLang,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(Buffer.concat(requestState.bodyState.bodyChunks).toString(), multiLang);
    });

    test('应该正确处理emoji字符', async () => {
      const emojis = '😀😃😄😁🎉🎊🎈🎁🌟✨💫⭐';
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/emoji',
        },
        headers: {
          Host: 'example.com',
        },
        body: emojis,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(Buffer.concat(requestState.bodyState.bodyChunks).toString(), emojis);
    });

    test('应该正确处理包含换行符的body', async () => {
      const multiline = 'Line 1\nLine 2\r\nLine 3\rLine 4';
      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/multiline',
        },
        headers: {
          Host: 'example.com',
        },
        body: multiline,
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(Buffer.concat(requestState.bodyState.bodyChunks).toString(), multiline);
    });
  });

  describe('Content-Length和Transfer-Encoding测试', () => {
    test('应该为Buffer body自动添加Content-Length', async () => {
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
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.headersState.headers['content-length'], '9');
    });

    test('应该为AsyncIterable body使用Transfer-Encoding: chunked', async () => {
      async function* gen() {
        yield Buffer.from('chunk');
      }

      const request = encodeRequest({
        startLine: {
          method: 'POST',
          path: '/api/test',
        },
        headers: {
          Host: 'example.com',
        },
        body: gen(),
      });

      let requestState = null;
      for await (const chunk of request) {
        requestState = decodeRequest(requestState, chunk);
      }

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.headersState.headers['transfer-encoding'], 'chunked');
    });

    test('应该为空Buffer设置Content-Length为0', async () => {
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

      assert.strictEqual(requestState.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(requestState.headersState.headers['content-length'], '0');
    });
  });
});
