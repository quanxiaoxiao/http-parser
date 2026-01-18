import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, test } from 'node:test';

import {
  HttpDecodeError,
  HttpDecodeErrorCode,
} from '../errors.js';
import { HttpDecodeState } from '../specs.js';
import {
  createRequestState,
  createResponseState,
  decideBodyStrategy,
  decodeRequest,
  decodeResponse,
} from './message.js';

describe('HTTP Decoder - Body', () => {
  test('should decode POST request with body', () => {
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

    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);

    const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
    assert.ok(bodyCompleteEvent);
    assert.strictEqual(bodyCompleteEvent.totalSize, body.length);
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

    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);

    const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
    assert.ok(bodyCompleteEvent);
    assert.strictEqual(bodyCompleteEvent.totalSize, 11);
  });

  test('should handle request without body', () => {
    const input = Buffer.from(
      'DELETE /resource/123 HTTP/1.1\r\n' +
      'Host: example.com\r\n' +
      '\r\n',
    );

    const state = decodeRequest(null, input);

    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);

    const bodyEvents = state.events.filter(e =>
      e.type === 'body-chunk' || e.type === 'body-complete',
    );
    assert.strictEqual(bodyEvents.length, 0);
  });

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

    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);
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
    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);
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

    const state = decodeRequest(null, Buffer.from(
      'POST /api/data HTTP/1.1\r\n' +
      'Host: example.com\r\n' +
      `Content-Length: ${body.length}\r\n` +
      '\r\n' +
      body,
    ));

    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);

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

    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);
    const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
    assert.strictEqual(bodyCompleteEvent?.totalSize, 9);
  });

  test('should handle response without body', () => {
    const input = Buffer.from(
      'HTTP/1.1 204 No Content\r\n' +
      'Date: Mon, 01 Jan 2024 00:00:00 GMT\r\n' +
      '\r\n',
    );

    const state = decodeResponse(null, input);

    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);

    const bodyEvents = state.events.filter(e =>
      e.type === 'body-chunk' || e.type === 'body-complete',
    );
    assert.strictEqual(bodyEvents.length, 0);
  });

  test('should handle request with Content-Length 0', () => {
    const input = Buffer.from(
      'POST / HTTP/1.1\r\n' +
      'Content-Length: 0\r\n' +
      '\r\n',
    );

    const state = decodeRequest(null, input);

    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);

    const bodyEvents = state.events.filter(e =>
      e.type === 'body-chunk' || e.type === 'body-complete',
    );
    assert.strictEqual(bodyEvents.length, 0);
  });
});

describe('decideBodyStrategy', () => {
  test('should return none when no Transfer-Encoding and Content-Length', () => {
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

  test('should return chunked when Transfer-Encoding is chunked', () => {
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

  test('should return chunked when Transfer-Encoding is CHUNKED (uppercase)', () => {
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

  test('should throw error when multiple Transfer-Encoding headers', () => {
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

  test('should throw error when Transfer-Encoding is not chunked', () => {
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

  test('should throw error when both Transfer-Encoding and Content-Length present', () => {
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

  test('should return fixed when Content-Length is valid number', () => {
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

  test('should return none when Content-Length is 0', () => {
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

  test('should throw error when multiple Content-Length headers', () => {
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

  test('should throw error when Content-Length is negative', () => {
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

  test('should throw error when Content-Length is invalid string', () => {
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

  test('should throw error when Content-Length exceeds safe integer range', () => {
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

  test('should prioritize Transfer-Encoding over Content-Length', () => {
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
