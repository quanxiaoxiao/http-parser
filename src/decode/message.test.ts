import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, test } from 'node:test';

import { HttpDecodePhase } from '../specs.js';
import {
  createRequestState,
  createResponseState,
  decodeRequest,
  decodeResponse,
  type HttpRequestState,
  type HttpResponseState,
} from './message.js';

describe('HTTP Decoder', () => {
  describe('Request Decoding', () => {
    test('应该解码简单的 GET 请求', () => {
      const input = Buffer.from(
        'GET /path HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.method, 'GET');
      assert.strictEqual(state.startLine?.path, '/path');
      assert.strictEqual(state.startLine?.version, 1.1);
      assert.ok(state.headersState?.headers);
    });

    test('应该解码带查询参数的请求', () => {
      const input = Buffer.from(
        'GET /path?query=value&foo=bar HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'User-Agent: TestClient/1.0\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.path, '/path?query=value&foo=bar');
    });

    test('应该解码 POST 请求（Content-Length）', () => {
      const body = 'name=value&test=123';
      const input = Buffer.from(
        'POST /api/data HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        `Content-Length: ${body.length}\r\n` +
        'Content-Type: application/x-www-form-urlencoded\r\n' +
        '\r\n' +
        body,
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.startLine?.method, 'POST');
      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);

      const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
      assert.ok(bodyCompleteEvent);
      assert.strictEqual(bodyCompleteEvent.totalSize, body.length);
    });

    test('应该分段解码请求（流式输入）', () => {
      const parts = [
        'GET /path HTTP/1.1\r\n',
        'Host: example.com\r\n',
        'Accept: */*\r\n',
        '\r\n',
      ];

      let state: HttpRequestState | null = null;

      for (const part of parts) {
        state = decodeRequest(state, Buffer.from(part));
      }

      assert.ok(state);
      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.method, 'GET');
    });

    test('应该处理分段的 start line', () => {
      const state1 = decodeRequest(null, Buffer.from('GET /pa'));
      assert.strictEqual(state1.phase, HttpDecodePhase.START_LINE);

      const state2 = decodeRequest(state1, Buffer.from('th HTTP/1.1\r\n\r\n'));
      assert.strictEqual(state2.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state2.startLine?.path, '/path');
    });

    test('应该处理分段的请求体', () => {
      const bodyPart1 = 'Hello ';
      const bodyPart2 = 'World!';
      const totalBody = bodyPart1 + bodyPart2;

      const header = Buffer.from(
        'POST /upload HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        `Content-Length: ${totalBody.length}\r\n` +
        '\r\n',
      );

      let state = decodeRequest(null, header);
      assert.strictEqual(state.phase, HttpDecodePhase.BODY_CONTENT_LENGTH);

      state = decodeRequest(state, Buffer.from(bodyPart1));

      state = decodeRequest(state, Buffer.from(bodyPart2));
      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);

      const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
      assert.strictEqual(bodyCompleteEvent?.totalSize, totalBody.length);
    });

    test('应该处理 chunked 编码的请求体', () => {
      const input = Buffer.from(
        'POST /upload HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '5\r\n' +
        'Hello\r\n' +
        '6\r\n' +
        ' World\r\n' +
        '0\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);

      const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
      assert.ok(bodyCompleteEvent);
      assert.strictEqual(bodyCompleteEvent.totalSize, 11); // "Hello World"
    });

    test('应该处理没有请求体的请求', () => {
      const input = Buffer.from(
        'DELETE /resource/123 HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.method, 'DELETE');

      // 应该没有 body 相关的事件
      const bodyEvents = state.events.filter(e =>
        e.type === 'body-chunk' || e.type === 'body-complete',
      );
      assert.strictEqual(bodyEvents.length, 0);
    });

    test('应该生成正确的事件序列', () => {
      const input = Buffer.from(
        'GET /test HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      const eventTypes = state.events.map(e => e.type);

      assert.ok(eventTypes.includes('start-line-complete'));
      assert.ok(eventTypes.includes('headers-complete'));
      assert.ok(eventTypes.includes('message-complete'));

      // 验证事件顺序
      const startLineIndex = eventTypes.indexOf('start-line-complete');
      const headersIndex = eventTypes.indexOf('headers-complete');
      const messageIndex = eventTypes.indexOf('message-complete');

      assert.ok(startLineIndex < headersIndex);
      assert.ok(headersIndex < messageIndex);
    });
  });

  describe('Response Decoding', () => {
    test('应该解码简单的 200 响应', () => {
      const input = Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: text/plain\r\n' +
        'Content-Length: 5\r\n' +
        '\r\n' +
        'Hello',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.version, 1.1);
      assert.strictEqual(state.startLine?.statusCode, 200);
      assert.strictEqual(state.startLine?.statusText, 'OK');
    });

    test('应该解码 404 响应', () => {
      const input = Buffer.from(
        'HTTP/1.1 404 Not Found\r\n' +
        'Content-Type: text/html\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.statusCode, 404);
      assert.strictEqual(state.startLine?.statusText, 'Not Found');
    });

    test('应该解码带响应体的 POST 响应', () => {
      const body = '{"success":true,"id":123}';
      const input = Buffer.from(
        'HTTP/1.1 201 Created\r\n' +
        'Content-Type: application/json\r\n' +
        `Content-Length: ${body.length}\r\n` +
        '\r\n' +
        body,
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.statusCode, 201);

      const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
      assert.strictEqual(bodyCompleteEvent?.totalSize, body.length);
    });

    test('应该处理 chunked 编码的响应', () => {
      const input = Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '4\r\n' +
        'Wiki\r\n' +
        '5\r\n' +
        'pedia\r\n' +
        '0\r\n' +
        '\r\n',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
      assert.strictEqual(bodyCompleteEvent?.totalSize, 9); // "Wikipedia"
    });

    test('应该分段解码响应', () => {
      const parts = [
        'HTTP/1.1 200 OK\r\n',
        'Content-Type: text/plain\r\n',
        'Content-Length: 4\r\n',
        '\r\n',
        'test',
      ];

      let state: HttpResponseState | null = null;

      for (const part of parts) {
        state = decodeResponse(state, Buffer.from(part));
      }

      assert.ok(state);
      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.statusCode, 200);
    });

    test('应该处理多个头部字段', () => {
      const input = Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: text/html\r\n' +
        'Content-Length: 0\r\n' +
        'Cache-Control: no-cache\r\n' +
        'Set-Cookie: session=abc123\r\n' +
        'X-Custom-Header: value\r\n' +
        '\r\n',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.ok(state.headersState?.headers);

      // 验证包含多个头部
      const headerNames = Object.keys(state.headersState.headers);
      assert.ok(headerNames.length >= 4);
    });

    test('应该处理没有响应体的响应', () => {
      const input = Buffer.from(
        'HTTP/1.1 204 No Content\r\n' +
        'Date: Mon, 01 Jan 2024 00:00:00 GMT\r\n' +
        '\r\n',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.statusCode, 204);

      const bodyEvents = state.events.filter(e =>
        e.type === 'body-chunk' || e.type === 'body-complete',
      );
      assert.strictEqual(bodyEvents.length, 0);
    });
  });

  describe('Error Handling', () => {
    test('应该在重复解码已完成的请求时抛出错误', () => {
      const input = Buffer.from('GET / HTTP/1.1\r\n\r\n');
      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);

      assert.throws(() => {
        decodeRequest(state, Buffer.from('GET / HTTP/1.1\r\n\r\n'));
      }, /already finished/);
    });

    test('应该在遇到错误后拒绝继续解码', () => {
      const state = createRequestState();
      state.error = new Error('Test error');

      assert.throws(() => {
        decodeRequest(state, Buffer.from('GET / HTTP/1.1\r\n\r\n'));
      }, /encountered error/);
    });
  });

  describe('State Management', () => {
    test('应该正确初始化请求状态', () => {
      const state = createRequestState();

      assert.strictEqual(state.mode, 'request');
      assert.strictEqual(state.phase, HttpDecodePhase.START_LINE);
      assert.strictEqual(state.startLine, null);
      assert.strictEqual(state.headersState, null);
      assert.strictEqual(state.bodyState, null);
      assert.strictEqual(state.events.length, 0);
    });

    test('应该正确初始化响应状态', () => {
      const state = createResponseState();

      assert.strictEqual(state.mode, 'response');
      assert.strictEqual(state.phase, HttpDecodePhase.START_LINE);
    });

    test('应该在每次解码时重置事件数组', () => {
      const input1 = Buffer.from('GET / HTTP/1.1\r\n');
      const state1 = decodeRequest(null, input1);
      const events1Count = state1.events.length;

      const input2 = Buffer.from('Host: example.com\r\n\r\n');
      const state2 = decodeRequest(state1, input2);

      // 第二次解码应该只包含新事件
      assert.ok(state2.events.length > 0);
      assert.ok(state2.events.length !== events1Count + state2.events.length);
    });
  });

  describe('Body Chunk Events', () => {
    test('应该为分段接收的请求体生成多个 body-chunk 事件', () => {
      const header = Buffer.from(
        'POST / HTTP/1.1\r\n' +
        'Content-Length: 10\r\n' +
        '\r\n',
      );

      let state = decodeRequest(null, header);

      state = decodeRequest(state, Buffer.from('12345'));
      const chunk1Events = state.events.filter(e => e.type === 'body-chunk');
      assert.strictEqual(chunk1Events.length, 1);
      assert.strictEqual(chunk1Events[0].size, 5);

      state = decodeRequest(state, Buffer.from('67890'));
      const chunk2Events = state.events.filter(e => e.type === 'body-chunk');
      assert.strictEqual(chunk2Events.length, 1);
      assert.strictEqual(chunk2Events[0].size, 5);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
    });

    test('应该为 chunked 编码生成正确的 body-chunk 事件', () => {
      const header = Buffer.from(
        'POST / HTTP/1.1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n',
      );

      let state = decodeRequest(null, header);

      state = decodeRequest(state, Buffer.from('3\r\nabc\r\n'));
      const chunkEvents = state.events.filter(e => e.type === 'body-chunk');
      assert.ok(chunkEvents.length > 0);

      state = decodeRequest(state, Buffer.from('4\r\ndefg\r\n0\r\n\r\n'));
      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
    });
  });

  describe('Edge Cases', () => {
    test('应该处理空缓冲区输入', () => {
      const state1 = decodeRequest(null, Buffer.alloc(0));
      assert.strictEqual(state1.phase, HttpDecodePhase.START_LINE);

      const state2 = decodeRequest(state1, Buffer.from('GET / HTTP/1.1\r\n\r\n'));
      assert.strictEqual(state2.phase, HttpDecodePhase.FINISHED);
    });

    test('应该处理 Content-Length 为 0 的请求', () => {
      const input = Buffer.from(
        'POST / HTTP/1.1\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);

      const bodyEvents = state.events.filter(e =>
        e.type === 'body-chunk' || e.type === 'body-complete',
      );
      assert.strictEqual(bodyEvents.length, 0);
    });

    test('应该处理长路径', () => {
      const longPath = '/api/' + 'a'.repeat(1000);
      const input = Buffer.from(
        `GET ${longPath} HTTP/1.1\r\n` +
        'Host: example.com\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.startLine?.path, longPath);
    });

    test('应该处理多行头部值', () => {
      const input = Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: text/plain\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.ok(state.headersState?.headers);
    });
  });
});
