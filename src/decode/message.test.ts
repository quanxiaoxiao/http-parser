import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, test } from 'node:test';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { HttpDecodePhase } from '../specs.js';
import {
  createRequestState,
  createResponseState,
  decideBodyStrategy,
  decodeRequest,
  decodeResponse,
  type HttpRequestState,
  type HttpResponseState,
} from './message.js';

describe('HTTP Decoder', () => {
  describe('Request Decoding', () => {
    test('should decode simple GET request', () => {
      const input = Buffer.from(
        'GET /path HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.parsing.startLine?.method, 'GET');
      assert.strictEqual(state.parsing.startLine?.path, '/path');
      assert.strictEqual(state.parsing.startLine?.version, 1.1);
      assert.ok(state.parsing.headers?.headers);
    });

    test('should decode request with query parameters', () => {
      const input = Buffer.from(
        'GET /path?query=value&foo=bar HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'User-Agent: TestClient/1.0\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.parsing.startLine?.path, '/path?query=value&foo=bar');
    });

    test('should decode POST request (Content-Length)', () => {
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

      assert.strictEqual(state.parsing.startLine?.method, 'POST');
      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);

      const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
      assert.ok(bodyCompleteEvent);
      assert.strictEqual(bodyCompleteEvent.totalSize, body.length);
    });

    test('should decode request in chunks (streaming input)', () => {
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
      assert.strictEqual(state.parsing.startLine?.method, 'GET');
    });

    test('should handle segmented start line', () => {
      const state1 = decodeRequest(null, Buffer.from('GET /pa'));
      assert.strictEqual(state1.phase, HttpDecodePhase.START_LINE);

      const state2 = decodeRequest(state1, Buffer.from('th HTTP/1.1\r\n\r\n'));
      assert.strictEqual(state2.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state2.parsing.startLine?.path, '/path');
    });

    test('should handle segmented request body', () => {
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
      assert.strictEqual(state.phase, HttpDecodePhase.BODY_FIXED_LENGTH);

      state = decodeRequest(state, Buffer.from(bodyPart1));

      state = decodeRequest(state, Buffer.from(bodyPart2));
      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);

      const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
      assert.strictEqual(bodyCompleteEvent?.totalSize, totalBody.length);
    });

    test('should handle chunked encoded request body', () => {
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

    test('should handle request without body', () => {
      const input = Buffer.from(
        'DELETE /resource/123 HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.parsing.startLine?.method, 'DELETE');

      // 应该没有 body 相关的事件
      const bodyEvents = state.events.filter(e =>
        e.type === 'body-chunk' || e.type === 'body-complete',
      );
      assert.strictEqual(bodyEvents.length, 0);
    });

    test('should generate correct event sequence', () => {
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
    test('should decode simple 200 response', () => {
      const input = Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: text/plain\r\n' +
        'Content-Length: 5\r\n' +
        '\r\n' +
        'Hello',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.parsing.startLine?.version, 1.1);
      assert.strictEqual(state.parsing.startLine?.statusCode, 200);
      assert.strictEqual(state.parsing.startLine?.statusText, 'OK');
    });

    test('should decode 404 response', () => {
      const input = Buffer.from(
        'HTTP/1.1 404 Not Found\r\n' +
        'Content-Type: text/html\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.parsing.startLine?.statusCode, 404);
      assert.strictEqual(state.parsing.startLine?.statusText, 'Not Found');
    });

    test('should decode POST response with body', () => {
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
      assert.strictEqual(state.parsing.startLine?.statusCode, 201);

      const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
      assert.strictEqual(bodyCompleteEvent?.totalSize, body.length);
    });

    test('should handle chunked encoded response', () => {
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

    test('should decode response in chunks', () => {
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
      assert.strictEqual(state.parsing.startLine?.statusCode, 200);
    });

    test('should handle multiple header fields', () => {
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
      assert.ok(state.parsing.headers?.headers);

      // 验证包含多个头部
      const headerNames = Object.keys(state.parsing.headers.headers);
      assert.ok(headerNames.length >= 4);
    });

    test('should handle response without body', () => {
      const input = Buffer.from(
        'HTTP/1.1 204 No Content\r\n' +
        'Date: Mon, 01 Jan 2024 00:00:00 GMT\r\n' +
        '\r\n',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.parsing.startLine?.statusCode, 204);

      const bodyEvents = state.events.filter(e =>
        e.type === 'body-chunk' || e.type === 'body-complete',
      );
      assert.strictEqual(bodyEvents.length, 0);
    });
  });

  describe('Error Handling', () => {
    test('should throw error when decoding already finished request', () => {
      const input = Buffer.from('GET / HTTP/1.1\r\n\r\n');
      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);

      assert.throws(() => {
        decodeRequest(state, Buffer.from('GET / HTTP/1.1\r\n\r\n'));
      }, /already finished/);
    });

    test('should reject continuing decoding after error', () => {
      const state = createRequestState();
      state.error = new Error('Test error');

      assert.throws(() => {
        decodeRequest(state, Buffer.from('GET / HTTP/1.1\r\n\r\n'));
      }, /encountered error/);
    });
  });

  describe('State Management', () => {
    test('should correctly initialize request state', () => {
      const state = createRequestState();

      assert.strictEqual(state.messageType, 'request');
      assert.strictEqual(state.phase, HttpDecodePhase.START_LINE);
      assert.strictEqual(state.parsing.startLine, null);
      assert.strictEqual(state.parsing.headers, null);
      assert.strictEqual(state.parsing.body, null);
      assert.strictEqual(state.events.length, 0);
    });

    test('should correctly initialize response state', () => {
      const state = createResponseState();

      assert.strictEqual(state.messageType, 'response');
      assert.strictEqual(state.phase, HttpDecodePhase.START_LINE);
    });

    test('should reset events array on each decode', () => {
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
    test('should generate multiple body-chunk events for segmented received body', () => {
      const header = Buffer.from(
        'POST / HTTP/1.1\r\n' +
        'Content-Length: 10\r\n' +
        '\r\n',
      );

      let state = decodeRequest(null, header);

      state = decodeRequest(state, Buffer.from('12345'));
      const chunk1Events = state.events.filter(e => e.type === 'body-data');
      assert.strictEqual(chunk1Events.length, 1);
      assert.strictEqual(chunk1Events[0].size, 5);

      state = decodeRequest(state, Buffer.from('67890'));
      const chunk2Events = state.events.filter(e => e.type === 'body-data');
      assert.strictEqual(chunk2Events.length, 1);
      assert.strictEqual(chunk2Events[0].size, 5);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
    });

    test('should generate correct body-chunk events for chunked encoding', () => {
      const header = Buffer.from(
        'POST / HTTP/1.1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n',
      );

      let state = decodeRequest(null, header);

      state = decodeRequest(state, Buffer.from('3\r\nabc\r\n'));
      const chunkEvents = state.events.filter(e => e.type === 'body-data');
      assert.ok(chunkEvents.length > 0);

      state = decodeRequest(state, Buffer.from('4\r\ndefg\r\n0\r\n\r\n'));
      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty buffer input', () => {
      const state1 = decodeRequest(null, Buffer.alloc(0));
      assert.strictEqual(state1.phase, HttpDecodePhase.START_LINE);

      const state2 = decodeRequest(state1, Buffer.from('GET / HTTP/1.1\r\n\r\n'));
      assert.strictEqual(state2.phase, HttpDecodePhase.FINISHED);
    });

    test('should handle request with Content-Length 0', () => {
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

    test('should handle long path', () => {
      const longPath = '/api/' + 'a'.repeat(1000);
      const input = Buffer.from(
        `GET ${longPath} HTTP/1.1\r\n` +
        'Host: example.com\r\n' +
        '\r\n',
      );

      const state = decodeRequest(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.strictEqual(state.parsing.startLine?.path, longPath);
    });

    test('should handle multi-line header values', () => {
      const input = Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: text/plain\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n',
      );

      const state = decodeResponse(null, input);

      assert.strictEqual(state.phase, HttpDecodePhase.FINISHED);
      assert.ok(state.parsing.headers?.headers);
    });
  });
});

describe('decideBodyStrategy', () => {
  test('应该返回 none 当没有 Transfer-Encoding 和 Content-Length 时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            host: 'example.com',
            'user-agent': 'test',
          },
        },
      },
    };
    const result = decideBodyStrategy(state);
    assert.deepStrictEqual(result, { type: 'none' });
  });

  test('应该返回 chunked 当 Transfer-Encoding 是 chunked 时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'transfer-encoding': 'chunked',
          },
        },
      },
    };
    const result = decideBodyStrategy(state);
    assert.deepStrictEqual(result, { type: 'chunked' });
  });

  test('应该返回 chunked 当 Transfer-Encoding 是 CHUNKED (大写) 时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'transfer-encoding': 'CHUNKED',
          },
        },
      },
    };
    const result = decideBodyStrategy(state);
    assert.deepStrictEqual(result, { type: 'chunked' });
  });

  test('应该抛出错误当有多个 Transfer-Encoding headers 时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'transfer-encoding': ['chunked', 'gzip'],
          },
        },
      },
    };
    assert.throws(
      () => decideBodyStrategy(state),
      (err) => {
        return (
          err instanceof HttpDecodeError &&
          err.code === HttpDecodeErrorCode.INVALID_SYNTAX &&
          err.message === 'multiple Transfer-Encoding headers'
        );
      },
    );
  });

  test('应该抛出错误当 Transfer-Encoding 不是 chunked 时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'transfer-encoding': 'gzip',
          },
        },
      },
    };
    assert.throws(
      () => decideBodyStrategy(state),
      (err) => {
        return (
          err instanceof HttpDecodeError &&
          err.code === HttpDecodeErrorCode.UNSUPPORTED_FEATURE &&
          err.message === 'unsupported Transfer-Encoding: gzip'
        );
      },
    );
  });

  test('应该抛出错误当同时有 Transfer-Encoding 和 Content-Length 时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'transfer-encoding': 'chunked',
            'content-length': '100',
          },
        },
      },
    };
    assert.throws(
      () => decideBodyStrategy(state),
      (err) => {
        return (
          err instanceof HttpDecodeError &&
          err.code === HttpDecodeErrorCode.INVALID_SYNTAX &&
          err.message === 'Content-Length with Transfer-Encoding'
        );
      },
    );
  });

  test('应该返回 fixed 当 Content-Length 是有效数字时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'content-length': '1024',
          },
        },
      },
    };
    const result = decideBodyStrategy(state);
    assert.deepStrictEqual(result, { type: 'fixed', length: 1024 });
  });

  test('应该返回 none 当 Content-Length 是 0 时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'content-length': '0',
          },
        },
      },
    };
    const result = decideBodyStrategy(state);
    assert.deepStrictEqual(result, { type: 'none' });
  });

  test('应该抛出错误当有多个 Content-Length headers 时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'content-length': ['100', '200'],
          },
        },
      },
    };
    assert.throws(
      () => decideBodyStrategy(state),
      (err) => {
        return (
          err instanceof HttpDecodeError &&
          err.code === HttpDecodeErrorCode.INVALID_SYNTAX &&
          err.message === 'multiple Content-Length headers'
        );
      },
    );
  });

  test('应该抛出错误当 Content-Length 是负数时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'content-length': '-1',
          },
        },
      },
    };
    assert.throws(
      () => decideBodyStrategy(state),
      (err) => {
        return (
          err instanceof HttpDecodeError &&
          err.code === HttpDecodeErrorCode.INVALID_SYNTAX &&
          err.message === 'Content-Length invalid'
        );
      },
    );
  });

  test('应该抛出错误当 Content-Length 是无效字符串时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'content-length': 'invalid',
          },
        },
      },
    };
    assert.throws(
      () => decideBodyStrategy(state),
      (err) => {
        return (
          err instanceof HttpDecodeError &&
          err.code === HttpDecodeErrorCode.INVALID_SYNTAX &&
          err.message === 'Content-Length invalid'
        );
      },
    );
  });

  test('应该抛出错误当 Content-Length 超出安全整数范围时', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'content-length': '9007199254740992',
          },
        },
      },
    };
    assert.throws(
      () => decideBodyStrategy(state),
      (err) => {
        return (
          err instanceof HttpDecodeError &&
          err.code === HttpDecodeErrorCode.MESSAGE_TOO_LARGE &&
          err.message === 'Content-Length overflow'
        );
      },
    );
  });

  test('应该优先处理 Transfer-Encoding 而非 Content-Length', () => {
    const state = {
      parsing: {
        headers: {
          headers: {
            'transfer-encoding': 'chunked',
          },
        },
      },
    };
    const result = decideBodyStrategy(state);
    assert.deepStrictEqual(result, { type: 'chunked' });
  });
});
