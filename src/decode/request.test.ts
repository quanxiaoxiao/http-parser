import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import { HttpDecodePhase } from '../specs.js';
import { createRequestState, decodeRequest } from './message.js';

describe('decodeRequest', () => {
  describe('基础功能', () => {
    it('应该创建初始状态', () => {
      const state = createRequestState();
      assert.strictEqual(state.phase, HttpDecodePhase.START_LINE);
      assert.strictEqual(state.finished, false);
      assert.strictEqual(state.startLine, null);
      assert.strictEqual(state.headersState, null);
      assert.strictEqual(state.bodyState, null);
    });

    it('已完成的请求应该抛出错误', () => {
      const state = createRequestState();
      state.finished = true;

      assert.throws(
        () => decodeRequest(state, Buffer.from('test')),
        { message: 'Decoding already finished' },
      );
    });

    it('空输入不应改变状态', () => {
      const state = createRequestState();
      const result = decodeRequest(state, Buffer.alloc(0));

      assert.strictEqual(result.phase, HttpDecodePhase.START_LINE);
      assert.strictEqual(result.finished, false);
    });
  });

  describe('START_LINE 阶段', () => {
    it('应该解析简单的 GET 请求行', () => {
      const state = createRequestState();
      const input = Buffer.from('GET /path HTTP/1.1\r\n');

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.HEADERS);
      assert.ok(result.startLine);
      assert.strictEqual(result.startLine.method, 'GET');
      assert.strictEqual(result.startLine.path, '/path');
      assert.strictEqual(result.startLine.version, 1.1);
    });

    it('应该解析 POST 请求行', () => {
      const state = createRequestState();
      const input = Buffer.from('POST /api/users HTTP/1.1\r\n');

      const result = decodeRequest(state, input);

      assert.strictEqual(result.startLine.method, 'POST');
      assert.strictEqual(result.startLine.path, '/api/users');
    });

    it('不完整的请求行应该保持在 START_LINE 阶段', () => {
      const state = createRequestState();
      const input = Buffer.from('GET /path');

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.START_LINE);
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

      const result = decodeRequest(state, input);

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

      const result = decodeRequest(state, input);

      assert.ok(Array.isArray(result.headersState?.headers?.['accept']));
    });

    it('不完整的 headers 应该等待更多数据', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'GET /path HTTP/1.1\r\n' +
        'Host: example.com\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.HEADERS);
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

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.BODY_CHUNKED);
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

      const result = decodeRequest(state, input);

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

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.BODY_CHUNKED);
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

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.BODY_CONTENT_LENGTH);
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

      const result = decodeRequest(state, input);

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

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.BODY_CONTENT_LENGTH);
      assert.strictEqual(result.finished, false);
    });

    it('Content-Length 为 0 应该立即完成', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
    });
  });

  describe('分批解析', () => {
    it('应该支持分多次输入解析', () => {
      let state = createRequestState();

      // 第一批：请求行
      state = decodeRequest(state, Buffer.from('GET /path HTTP/1.1\r\n'));
      assert.strictEqual(state.phase, HttpDecodePhase.HEADERS);

      // 第二批：部分 headers
      state = decodeRequest(state, Buffer.from('Host: example.com\r\n'));
      assert.strictEqual(state.phase, HttpDecodePhase.HEADERS);

      // 第三批：结束 headers
      state = decodeRequest(state, Buffer.from('\r\n'));
      assert.strictEqual(state.finished, true);
    });

    it('应该处理分批的 body 数据', () => {
      let state = createRequestState();

      // Headers
      state = decodeRequest(state, Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: 11\r\n' +
        '\r\n',
      ));
      assert.strictEqual(state.phase, HttpDecodePhase.BODY_CONTENT_LENGTH);

      // 部分 body
      state = decodeRequest(state, Buffer.from('hello'));
      assert.strictEqual(state.finished, false);

      // 剩余 body
      state = decodeRequest(state, Buffer.from(' worldextra'));
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

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.BODY_CHUNKED);
    });

    it('应该忽略无效的 Content-Length', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: invalid\r\n' +
        '\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
    });

    it('应该处理负数 Content-Length', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /path HTTP/1.1\r\n' +
        'Content-Length: -1\r\n' +
        '\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
    });
  });
});

describe('HTTP Request Parser', () => {
  describe('createRequestState', () => {
    it('应该创建初始状态', () => {
      const state = createRequestState();

      assert.strictEqual(state.phase, HttpDecodePhase.START_LINE);
      assert.strictEqual(state.finished, false);
      assert.strictEqual(state.startLine, null);
      assert.strictEqual(state.headersState, null);
      assert.strictEqual(state.bodyState, null);
      assert.strictEqual(state.buffer.length, 0);
      assert.strictEqual(state.error, undefined);
    });
  });

  describe('decodeRequest - Start Line', () => {
    it('应该解析简单的 GET 请求行', () => {
      const state = createRequestState();
      const input = Buffer.from('GET /path HTTP/1.1\r\n');

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.HEADERS);
      assert.strictEqual(result.startLine?.method, 'GET');
      assert.strictEqual(result.startLine?.path, '/path');
      assert.strictEqual(result.startLine?.version, 1.1);
    });

    it('应该解析 POST 请求行', () => {
      const state = createRequestState();
      const input = Buffer.from('POST /api/users HTTP/1.1\r\n');

      const result = decodeRequest(state, input);

      assert.strictEqual(result.startLine?.method, 'POST');
      assert.strictEqual(result.startLine?.path, '/api/users');
    });

    it('应该处理带查询参数的请求行', () => {
      const state = createRequestState();
      const input = Buffer.from('GET /search?q=test&limit=10 HTTP/1.1\r\n');

      const result = decodeRequest(state, input);

      assert.strictEqual(result.startLine?.path, '/search?q=test&limit=10');
    });

    it('应该等待不完整的请求行', () => {
      const state = createRequestState();
      const input = Buffer.from('GET /path');

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.START_LINE);
      assert.ok(!result.startLine?.method);
    });

    it('应该支持分块接收请求行', () => {
      let state = createRequestState();

      state = decodeRequest(state, Buffer.from('GET /pa'));
      assert.strictEqual(state.phase, HttpDecodePhase.START_LINE);

      state = decodeRequest(state, Buffer.from('th HTTP/1.1\r\n'));
      assert.strictEqual(state.phase, HttpDecodePhase.HEADERS);
      assert.strictEqual(state.startLine?.path, '/path');
    });
  });

  describe('decodeRequest - Headers', () => {
    it('应该解析简单的 headers（无 body）', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'GET / HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'User-Agent: test\r\n' +
        '\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.headersState?.headers['host'], 'example.com');
      assert.strictEqual(result.headersState?.headers['user-agent'], 'test');
    });

    it('应该解析多行 header 值', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'GET / HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'Accept: text/html,application/json\r\n' +
        '\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.headersState?.headers['accept'], 'text/html,application/json');
    });

    it('应该处理分块接收的 headers', () => {
      let state = createRequestState();

      state = decodeRequest(state, Buffer.from('GET / HTTP/1.1\r\n'));
      state = decodeRequest(state, Buffer.from('Host: example.com\r\n'));
      state = decodeRequest(state, Buffer.from('Content-Length: 0\r\n\r\n'));

      assert.strictEqual(state.finished, true);
      assert.strictEqual(state.headersState?.headers['host'], 'example.com');
    });
  });

  describe('decodeRequest - Body with Content-Length', () => {
    it('应该解析带 Content-Length 的请求体', () => {
      const state = createRequestState();
      const body = 'Hello World';
      const input = Buffer.from(
        'POST /api HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        `Content-Length: ${body.length}\r\n` +
        '\r\n' +
        body,
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.phase, HttpDecodePhase.FINISHED);
    });

    it('应该处理分块接收的请求体', () => {
      let state = createRequestState();
      const body = 'Hello World';

      state = decodeRequest(state, Buffer.from(
        'POST /api HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        `Content-Length: ${body.length}\r\n` +
        '\r\n',
      ));

      assert.strictEqual(state.phase, HttpDecodePhase.BODY_CONTENT_LENGTH);
      assert.strictEqual(state.finished, false);

      state = decodeRequest(state, Buffer.from(body));

      assert.strictEqual(state.finished, true);
    });

    it('应该处理 JSON 请求体', () => {
      const state = createRequestState();
      const body = JSON.stringify({ name: 'test', value: 123 });
      const input = Buffer.from(
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        `Content-Length: ${body.length}\r\n` +
        '\r\n' +
        body,
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.headersState?.headers['content-type'], 'application/json');
    });

    it('应该处理大型请求体', () => {
      const state = createRequestState();
      const body = 'x'.repeat(10000);
      const input = Buffer.from(
        'POST /api HTTP/1.1\r\n' +
        `Content-Length: ${body.length}\r\n` +
        '\r\n' +
        body,
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
    });
  });

  describe('decodeRequest - Chunked Encoding', () => {
    it('应该解析简单的 chunked 请求', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /api HTTP/1.1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '5\r\n' +
        'Hello\r\n' +
        '0\r\n' +
        '\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.phase, HttpDecodePhase.FINISHED);
    });

    it('应该解析多个 chunks', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST /api HTTP/1.1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '5\r\n' +
        'Hello\r\n' +
        '6\r\n' +
        ' World\r\n' +
        '0\r\n' +
        '\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
    });

    it('应该处理分块接收的 chunked 数据', () => {
      let state = createRequestState();

      state = decodeRequest(state, Buffer.from(
        'POST /api HTTP/1.1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n',
      ));

      assert.strictEqual(state.phase, HttpDecodePhase.BODY_CHUNKED);

      state = decodeRequest(state, Buffer.from('5\r\nHello\r\n'));
      state = decodeRequest(state, Buffer.from('0\r\n\r\n'));

      assert.strictEqual(state.finished, true);
    });
  });

  describe('decodeRequest - Error Handling', () => {
    it('应该拒绝已完成的请求继续解析', () => {
      const state = createRequestState();
      const input1 = Buffer.from('GET / HTTP/1.1\r\n\r\n');

      const result = decodeRequest(state, input1);
      assert.strictEqual(result.finished, true);

      const input2 = Buffer.from('GET / HTTP/1.1\r\n\r\n');
      assert.throws(() => {
        decodeRequest(result, input2);
      }, /Decoding already finished/);
    });

    it('应该处理无效的请求行', () => {
      let state = createRequestState();
      const input = Buffer.from('INVALID REQUEST\r\n');

      state = decodeRequest(state, input);
      assert.ok(state.error);
    });

    it('应该在错误后拒绝继续解析', () => {
      let state = createRequestState();

      state = decodeRequest(state, Buffer.from('INVALID\r\n'));

      assert.ok(state.error);
      assert.throws(() => {
        decodeRequest(state, Buffer.from('GET / HTTP/1.1\r\n'));
      }, /Decoding encountered error:/);
    });
  });

  describe('decodeRequest - Edge Cases', () => {
    it('应该处理空的输入缓冲区', () => {
      const state = createRequestState();
      const result = decodeRequest(state, Buffer.alloc(0));

      assert.strictEqual(result.phase, HttpDecodePhase.START_LINE);
      assert.strictEqual(result.finished, false);
    });

    it('应该处理 Content-Length 为 0 的请求', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST / HTTP/1.1\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.finished, true);
    });

    it('应该处理多个连续的空格和制表符', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'GET   /path   HTTP/1.1\r\n' +
        'Host:   example.com\r\n' +
        '\r\n',
      );

      const result = decodeRequest(state, input);

      assert.ok(result.startLine?.path);
      assert.ok(result.headersState?.headers['host']);
    });

    it('应该处理不同的 HTTP 版本', () => {
      const state1 = createRequestState();
      const input1 = Buffer.from('GET / HTTP/1.0\r\n\r\n');
      const result1 = decodeRequest(state1, input1);
      assert.strictEqual(result1.startLine?.version, 1.0);

      const state2 = createRequestState();
      const input2 = Buffer.from('GET / HTTP/1.1\r\n\r\n');
      const result2 = decodeRequest(state2, input2);
      assert.strictEqual(result2.startLine?.version, 1.1);
    });

    it('应该优先处理 Transfer-Encoding 而不是 Content-Length', () => {
      const state = createRequestState();
      const input = Buffer.from(
        'POST / HTTP/1.1\r\n' +
        'Content-Length: 100\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '0\r\n\r\n',
      );

      const result = decodeRequest(state, input);

      assert.strictEqual(result.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(result.finished, true);
    });
  });
});
