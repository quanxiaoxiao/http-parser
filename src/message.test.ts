import * as assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';

import { decodeRequest } from './decode/message.js';
import { encodeRequest } from './encode/message.js';
import { HttpDecodePhase } from './specs.js';

describe('HTTP Request Encode Decode Tests', () => {
  describe('Basic Functionality Tests', () => {
    test('should correctly encode and decode simple GET request', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.raw, 'GET /api/users HTTP/1.1');
      assert.strictEqual(requestState.parsing.headers.headers.host, 'example.com');
      assert.strictEqual(requestState.parsing.headers.headers['user-agent'], 'TestClient/1.0');
    });

    test('should correctly encode and decode POST request with string body', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.method, 'POST');
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.chunks).toString(),
        bodyContent,
      );
    });

    test('should correctly handle PUT request', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.method, 'PUT');
      assert.strictEqual(requestState.parsing.startLine.path, '/api/resource/123');
    });

    test('should correctly handle PATCH request', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.method, 'PATCH');
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.chunks).toString(),
        patchData,
      );
    });

    test('should correctly handle DELETE request', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.method, 'DELETE');
      assert.strictEqual(requestState.parsing.headers.headers.authorization, 'Bearer token123');
    });
  });

  describe('Streaming Upload Tests', () => {
    test('should correctly handle streaming upload data', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.raw, 'POST /api/upload HTTP/1.1');
      assert.deepStrictEqual(requestState.parsing.headers.headers.host, 'example.com');
      assert.strictEqual(requestState.parsing.headers.headers['transfer-encoding'], 'chunked');

      const expectedContent = readFileSync(
        path.join(process.cwd(), 'package-lock.json'),
        'utf-8',
      );
      assert.strictEqual(
        Buffer.concat(requestState.bodyState.chunks).toString(),
        expectedContent,
      );
    });

    test('should correctly handle small file streaming upload', async () => {
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
        Buffer.concat(requestState.bodyState.chunks).toString(),
        testData,
      );

      try {
        const { unlinkSync } = await import('node:fs');
        unlinkSync(testFilePath);
      } catch {
        // ignore
      }
    });

    test('should correctly handle chunked streaming data', async () => {
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
        Buffer.concat(requestState.bodyState.chunks).toString(),
        'chunk1chunk2chunk3',
      );
    });

    test('should correctly handle streaming data with empty chunks', async () => {
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
        Buffer.concat(requestState.bodyState.chunks).toString(),
        'startmiddleend',
      );
    });

    test('should correctly handle large chunk streaming data', async () => {
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
      assert.strictEqual(Buffer.concat(requestState.bodyState.chunks).length, 15000);
    });

    test('should correctly handle single chunk streaming data', async () => {
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
        Buffer.concat(requestState.bodyState.chunks).toString(),
        'single-chunk-data',
      );
    });
  });

  describe('Headers Tests', () => {
    test('should correctly handle multiple headers', async () => {
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
      const headers = requestState.parsing.headers.headers;
      assert.strictEqual(headers.host, 'example.com');
      assert.strictEqual(headers['user-agent'], 'TestClient/1.0');
      assert.strictEqual(headers.accept, 'application/json');
      assert.strictEqual(headers['accept-encoding'], 'gzip, deflate');
      assert.strictEqual(headers.authorization, 'Bearer token123');
    });

    test('should correctly handle empty headers', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.method, 'GET');
    });

    test('should correctly handle case-insensitive header names', async () => {
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
      assert.ok('host' in requestState.parsing.headers.headers);
      assert.ok('content-type' in requestState.parsing.headers.headers);
      assert.ok('accept-encoding' in requestState.parsing.headers.headers);
    });

    test('should correctly handle header values with special characters', async () => {
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
        requestState.parsing.headers.headers['x-special'],
        'value-with-dashes_and_underscores',
      );
      assert.strictEqual(requestState.parsing.headers.headers['x-numbers'], '12345');
      assert.strictEqual(requestState.parsing.headers.headers['x-mixed'], 'ABC123-xyz_789');
    });

    test('should correctly handle many custom headers', async () => {
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
      assert.strictEqual(requestState.parsing.headers.headers.host, 'example.com');
      assert.strictEqual(requestState.parsing.headers.headers['x-custom-header-0'], 'value-0');
      assert.strictEqual(requestState.parsing.headers.headers['x-custom-header-49'], 'value-49');
    });

    test('should correctly handle header values with spaces', async () => {
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
        requestState.parsing.headers.headers['x-description'],
        'This is a header value with spaces',
      );
    });
  });

  describe('Body Tests', () => {
    test('should correctly handle JSON body', async () => {
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
      const receivedBody = Buffer.concat(requestState.bodyState.chunks).toString();
      assert.deepStrictEqual(JSON.parse(receivedBody), bodyData);
    });

    test('should correctly handle empty body', async () => {
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
      if (requestState.bodyState && requestState.bodyState.chunks) {
        assert.strictEqual(requestState.bodyState.chunks.length, 0);
      }
    });

    test('should correctly handle empty string body', async () => {
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
      assert.deepStrictEqual(requestState.parsing.headers.headers['content-length'], '0');
    });

    test('should correctly handle binary body', async () => {
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
      const receivedBody = Buffer.concat(requestState.bodyState.chunks);
      assert.deepStrictEqual(receivedBody, binaryData);
    });

    test('should correctly handle Buffer body', async () => {
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
        Buffer.concat(requestState.bodyState.chunks).toString(),
        'test buffer data',
      );
      assert.strictEqual(requestState.parsing.headers.headers['content-length'], '16');
    });

    test('should correctly handle large Buffer body', async () => {
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
      assert.strictEqual(Buffer.concat(requestState.bodyState.chunks).length, 10000);
      assert.strictEqual(requestState.parsing.headers.headers['content-length'], '10000');
    });

    test('should correctly handle UTF-8 encoded string body', async () => {
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
        Buffer.concat(requestState.bodyState.chunks).toString(),
        unicodeString,
      );
    });

    test('should correctly handle complex JSON structure', async () => {
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
        Buffer.concat(requestState.bodyState.chunks).toString(),
      );
      assert.deepStrictEqual(receivedBody, complexData);
    });
  });

  describe('Path Tests', () => {
    test('should correctly handle path with query parameters', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.path, '/api/search?q=test&limit=10');
    });

    test('should correctly handle root path', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.path, '/');
    });

    test('should correctly handle complex path', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.path, complexPath);
    });

    test('should correctly handle path with encoded characters', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.path, encodedPath);
    });

    test('should correctly handle path with fragment', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.path, pathWithFragment);
    });

    test('should correctly handle very long path', async () => {
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
      assert.ok(requestState.parsing.startLine.raw.includes(longPath));
    });

    test('should correctly handle complex query parameters', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.path, complexQuery);
    });
  });

  describe('HTTP Method Tests', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];

    methods.forEach((method) => {
      test(`should correctly handle ${method} request`, async () => {
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
        assert.strictEqual(requestState.parsing.startLine.raw, `${method} /api/test HTTP/1.1`);
        assert.strictEqual(requestState.parsing.startLine.method, method);
      });
    });

    test('should correctly handle HEAD request without body', async () => {
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

    test('should correctly handle OPTIONS request with asterisk path', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.path, '*');
    });
  });

  describe('Content-Type Tests', () => {
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
      test(`should correctly handle ${contentType} type`, async () => {
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
        assert.strictEqual(requestState.parsing.headers.headers['content-type'], contentType);
      });
    });

    test('should correctly handle Content-Type with charset', async () => {
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
        requestState.parsing.headers.headers['content-type'],
        'text/html; charset=utf-8',
      );
    });

    test('should correctly handle multipart/form-data with boundary', async () => {
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
      assert.strictEqual(requestState.parsing.headers.headers['content-type'], contentType);
    });
  });

  describe('Real World Scenario Tests', () => {
    test('should correctly handle JSON API request', async () => {
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
      const receivedData = Buffer.concat(requestState.bodyState.chunks).toString();
      assert.deepStrictEqual(JSON.parse(receivedData), { name: 'test', value: 123 });
    });

    test('should correctly handle form submission', async () => {
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
      assert.strictEqual(Buffer.concat(requestState.bodyState.chunks).toString(), formData);
    });

    test('should correctly handle simulated streaming file upload', async () => {
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
      const uploaded = Buffer.concat(requestState.bodyState.chunks).toString();
      assert.ok(uploaded.includes('file-chunk-0-'));
      assert.ok(uploaded.includes('file-chunk-4-'));
    });

    test('should correctly handle GraphQL request', async () => {
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
      const received = JSON.parse(Buffer.concat(requestState.bodyState.chunks).toString());
      assert.deepStrictEqual(received, graphqlQuery);
    });

    test('should correctly handle REST API PATCH request', async () => {
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
      const received = JSON.parse(Buffer.concat(requestState.bodyState.chunks).toString());
      assert.deepStrictEqual(received, patchData);
    });

    test('should correctly handle authenticated request', async () => {
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
      assert.ok(requestState.parsing.headers.headers.authorization.startsWith('Bearer'));
      assert.strictEqual(requestState.parsing.headers.headers['x-api-key'], 'abc123xyz');
    });
  });

  describe('Edge Cases and Error Handling Tests', () => {
    test('should correctly handle request with only required fields', async () => {
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
      assert.strictEqual(requestState.parsing.startLine.raw, 'GET / HTTP/1.1');
    });

    test('should correctly handle incremental decoding', async () => {
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
      assert.deepStrictEqual(states[states.length - 1].phase, HttpDecodePhase.FINISHED);
    });

    test('should correctly handle extremely small body', async () => {
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
      assert.strictEqual(Buffer.concat(requestState.bodyState.chunks).toString(), 'x');
    });

    test('should correctly handle very long header value', async () => {
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
      assert.strictEqual(requestState.parsing.headers.headers['x-long-header'], longValue);
    });

    test('should correctly handle multiple custom headers with same type but different values', async () => {
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
      assert.strictEqual(requestState.parsing.headers.headers['x-request-id'], '123');
      assert.strictEqual(requestState.parsing.headers.headers['x-session-id'], '456');
      assert.strictEqual(requestState.parsing.headers.headers['x-trace-id'], '789');
    });
  });

  describe('Performance and Stress Tests', () => {
    test('should correctly handle many small requests encoding and decoding consecutively', async () => {
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
        assert.strictEqual(requestState.parsing.startLine.path, `/api/test/${i}`);
      }
    });

    test('should correctly handle very large body data', async () => {
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
      assert.strictEqual(Buffer.concat(requestState.bodyState.chunks).length, 100000);
    });

    test('should correctly handle streaming with many chunks', async () => {
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

  describe('Special Characters and Encoding Tests', () => {
    test('should correctly handle body with special characters', async () => {
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
        Buffer.concat(requestState.bodyState.chunks).toString(),
        specialChars,
      );
    });

    test('should correctly handle Unicode characters from various languages', async () => {
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
      assert.strictEqual(Buffer.concat(requestState.bodyState.chunks).toString(), multiLang);
    });

    test('should correctly handle emoji characters', async () => {
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
      assert.strictEqual(Buffer.concat(requestState.bodyState.chunks).toString(), emojis);
    });

    test('should correctly handle body with newlines', async () => {
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
      assert.strictEqual(Buffer.concat(requestState.bodyState.chunks).toString(), multiline);
    });
  });

  describe('Content-Length and Transfer-Encoding Tests', () => {
    test('should automatically add Content-Length for Buffer body', async () => {
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
      assert.strictEqual(requestState.parsing.headers.headers['content-length'], '9');
    });

    test('should use Transfer-Encoding: chunked for AsyncIterable body', async () => {
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
      assert.strictEqual(requestState.parsing.headers.headers['transfer-encoding'], 'chunked');
    });

    test('should set Content-Length to 0 for empty Buffer', async () => {
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
      assert.strictEqual(requestState.parsing.headers.headers['content-length'], '0');
    });
  });
});
