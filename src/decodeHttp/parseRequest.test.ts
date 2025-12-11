import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import { createRequestState, parseRequest } from './parseRequest.js';

describe('parseRequest', () => {
  describe('基础功能', () => {
    it('应该创建初始状态', () => {
      const state = createRequestState();
      assert.strictEqual(state.phase, 'STARTLINE');
      assert.strictEqual(state.finished, false);
      assert.strictEqual(state.startLine, null);
      assert.strictEqual(state.headersState, null);
      assert.strictEqual(state.bodyState, null);
    });

    it('已完成的请求应该抛出错误', () => {
      const state = createRequestState();
      state.finished = true;

      assert.throws(
        () => parseRequest(state, Buffer.from('test')),
        { message: 'Request decoding already finished' },
      );
    });

    it('空输入不应改变状态', () => {
      const state = createRequestState();
      const result = parseRequest(state, Buffer.alloc(0));

      assert.strictEqual(result.phase, 'STARTLINE');
      assert.strictEqual(result.finished, false);
    });
  });

  describe('STARTLINE 阶段', () => {
    it('应该解析简单的 GET 请求行', () => {
      const state = createRequestState();
      const input = Buffer.from('GET /path HTTP/1.1\r\n');

      const result = parseRequest(state, input);

      assert.strictEqual(result.phase, 'HEADERS');
      assert.ok(result.startLine);
      assert.strictEqual(result.startLine.method, 'GET');
      assert.strictEqual(result.startLine.path, '/path');
      assert.strictEqual(result.startLine.version, 1.1);
    });

    it('应该解析 POST 请求行', () => {
      const state = createRequestState();
      const input = Buffer.from('POST /api/users HTTP/1.1\r\n');

      const result = parseRequest(state, input);

      assert.strictEqual(result.startLine.method, 'POST');
      assert.strictEqual(result.startLine.path, '/api/users');
    });

    it('不完整的请求行应该保持在 STARTLINE 阶段', () => {
      const state = createRequestState();
      const input = Buffer.from('GET /path');

      const result = parseRequest(state, input);

      assert.strictEqual(result.phase, 'STARTLINE');
      assert.strictEqual(result.finished, false);
    });
  });

  describe('HEADERS 阶段', () => {
    it('应该解析没有 body 的完整请求', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'GET /path HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'User-Agent: test\r\n' +
        '\r\n',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.finished, true);
      assert.ok(result.headersState?.headers);
      assert.strictEqual(result.headersState.headers['host'], 'example.com');
      assert.strictEqual(result.headersState.headers['user-agent'], 'test');
    });

    it('应该处理多值 header', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'GET /path HTTP/1.1\r\n' +
        'Accept: text/html\r\n' +
        'Accept: application/json\r\n' +
        '\r\n',
      );

      const result = parseRequest(state, input);

      assert.ok(Array.isArray(result.headersState?.headers?.['accept']));
    });

    it('不完整的 headers 应该等待更多数据', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'GET /path HTTP/1.1\r\n' +
        'Host: example.com\r\n',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.phase, 'HEADERS');
      assert.strictEqual(result.finished, false);
    });
  });

  describe('BODY_CHUNKED 阶段', () => {
    it('应该识别 chunked transfer-encoding', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.phase, 'BODY_CHUNKED');
      assert.ok(result.bodyState);
    });

    it('应该解析完整的 chunked body', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '5\r\n' +
        'hello\r\n' +
        '0\r\n' +
        '\r\n',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.finished, true);
    });

    it('应该处理不完整的 chunked body', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '5\r\n' +
        'hel',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.phase, 'BODY_CHUNKED');
      assert.strictEqual(result.finished, false);
    });
  });

  describe('BODY_CONTENT_LENGTH 阶段', () => {
    it('应该识别 Content-Length header', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: 11\r\n' +
        '\r\n',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.phase, 'BODY_CONTENT_LENGTH');
      assert.ok(result.bodyState);
    });

    it('应该解析完整的 content-length body', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: 11\r\n' +
        '\r\n' +
        'hello world',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.finished, true);
    });

    it('应该处理不完整的 content-length body', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: 11\r\n' +
        '\r\n' +
        'hello',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.phase, 'BODY_CONTENT_LENGTH');
      assert.strictEqual(result.finished, false);
    });

    it('Content-Length 为 0 应该立即完成', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.finished, true);
    });
  });

  describe('分批解析', () => {
    it('应该支持分多次输入解析', () => {
      let state = createRequestState();

      // 第一批：请求行
      state = parseRequest(state, Buffer.from('GET /path HTTP/1.1\r\n'));
      assert.strictEqual(state.phase, 'HEADERS');

      // 第二批：部分 headers
      state = parseRequest(state, Buffer.from('Host: example.com\r\n'));
      assert.strictEqual(state.phase, 'HEADERS');

      // 第三批：结束 headers
      state = parseRequest(state, Buffer.from('\r\n'));
      assert.strictEqual(state.finished, true);
    });

    it('应该处理分批的 body 数据', () => {
      let state = createRequestState();

      // Headers
      state = parseRequest(state, Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: 11\r\n' +
        '\r\n',
      ));
      assert.strictEqual(state.phase, 'BODY_CONTENT_LENGTH');

      // 部分 body
      state = parseRequest(state, Buffer.from('hello'));
      assert.strictEqual(state.finished, false);

      // 剩余 body
      state = parseRequest(state, Buffer.from(' worldextra'));
      assert.strictEqual(state.finished, true);
      assert.strictEqual(state.bodyState.bodyChunks.length, 2);
      assert.strictEqual(Buffer.concat(state.bodyState.bodyChunks).toString(), 'hello world');
      assert.strictEqual(state.buffer.toString(), 'extra');
    });
  });

  describe('边界情况', () => {
    it('应该处理大小写不敏感的 Transfer-Encoding', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Transfer-Encoding: CHUNKED\r\n' +
        '\r\n',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.phase, 'BODY_CHUNKED');
    });

    it('应该忽略无效的 Content-Length', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: invalid\r\n' +
        '\r\n',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.finished, true);
    });

    it('应该处理负数 Content-Length', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: -1\r\n' +
        '\r\n',
      );

      const result = parseRequest(state, input);

      assert.strictEqual(result.finished, true);
    });
  });
});
