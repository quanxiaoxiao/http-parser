import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { DecodeHttpError } from '../errors.js';
import { createHeadersState, type HeadersState, parseHeaders } from './parseHeaders.js';

describe('parseHeaders', () => {
  describe('createHeadersState', () => {
    it('should create initial state with empty values', () => {
      const state = createHeadersState();

      assert.deepStrictEqual(state, {
        buffer: Buffer.alloc(0),
        headers: null,
        rawHeaders: [],
        finished: false,
      });
    });
  });

  describe('basic functionality', () => {
    it('should parse simple headers correctly', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: application/json\r\nContent-Length: 100\r\n\r\n');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.ok(result.headers);
      assert.strictEqual(result.headers['content-type'], 'application/json');
      assert.strictEqual(result.headers['content-length'], '100');
    });

    it('should preserve remaining buffer after headers', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: text/html\r\n\r\nBody content here');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.buffer.toString(), 'Body content here');
    });

    it('should handle XML body content after headers', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: application/xml\r\n\r\n<body>content</body>');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.buffer.toString(), '<body>content</body>');
    });

    it('should return unfinished state when no double CRLF found', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: application/json\r\n');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, false);
      assert.strictEqual(result.headers, null);
      assert.strictEqual(result.buffer.toString(), 'Content-Type: application/json\r\n');
    });

    it('should handle empty headers', () => {
      const state = createHeadersState();
      const input = Buffer.from('\r\n\r\n');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.ok(result.headers);
      assert.strictEqual(Object.keys(result.headers).length, 0);
    });
  });

  describe('chunked header parsing', () => {
    it('should handle headers split across two chunks', () => {
      let state = createHeadersState();

      const chunk1 = Buffer.from('Content-Type: application/json\r\n');
      state = parseHeaders(state, chunk1);
      assert.strictEqual(state.finished, false);
      assert.strictEqual(state.headers, null);

      const chunk2 = Buffer.from('Content-Length: 100\r\n\r\n');
      state = parseHeaders(state, chunk2);
      assert.strictEqual(state.finished, true);
      assert.ok(state.headers);
      assert.strictEqual(state.headers['content-type'], 'application/json');
      assert.strictEqual(state.headers['content-length'], '100');
    });

    it('should handle headers split mid-line', () => {
      let state = createHeadersState();

      const chunk1 = Buffer.from('Content-Type: text/plain\r\nCon');
      state = parseHeaders(state, chunk1);
      assert.strictEqual(state.finished, false);
      assert.strictEqual(state.headers, null);
      assert.strictEqual(state.buffer.toString(), chunk1.toString());

      const chunk2 = Buffer.from('tent-Length: 456\r\nConnection: close\r\n\r\nBody data');
      state = parseHeaders(state, chunk2);
      assert.strictEqual(state.finished, true);
      assert.strictEqual(state.buffer.toString(), 'Body data');
      assert.deepStrictEqual(state.headers, {
        'content-type': 'text/plain',
        'content-length': '456',
        connection: 'close',
      });
    });

    it('should handle streaming scenario with multiple small chunks', () => {
      let state = createHeadersState();

      const chunks = [
        Buffer.from('Content-'),
        Buffer.from('Type: applic'),
        Buffer.from('ation/json\r\n'),
        Buffer.from('Content-Length'),
        Buffer.from(': 100\r\n\r\n'),
        Buffer.from('body data'),
      ];

      for (const chunk of chunks) {
        state = parseHeaders(state, chunk);
        if (state.finished) break;
      }

      assert.strictEqual(state.finished, true);
      assert.strictEqual(state.headers!['content-type'], 'application/json');
      assert.strictEqual(state.headers!['content-length'], '100');
    });
  });

  describe('duplicate headers', () => {
    it('should handle duplicate headers as array', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Set-Cookie: session=abc123\r\n' +
        'Set-Cookie: token=xyz789\r\n' +
        '\r\n',
      );

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.ok(result.headers);
      assert.ok(Array.isArray(result.headers['set-cookie']));
      assert.deepStrictEqual(result.headers['set-cookie'], ['session=abc123', 'token=xyz789']);
    });

    it('should handle multiple Set-Cookie headers with paths', () => {
      const state = createHeadersState();
      const input = Buffer.from('Set-Cookie: a=1\r\nSet-Cookie: b=2; Path=/\r\n\r\n');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.deepStrictEqual(result.headers!['set-cookie'], ['a=1', 'b=2; Path=/']);
    });

    it('should convert single header to array when duplicate added', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Accept: text/html\r\n' +
        'Accept: application/json\r\n' +
        'Accept: application/xml\r\n' +
        '\r\n',
      );

      const result = parseHeaders(state, input);

      assert.ok(Array.isArray(result.headers!['accept']));
      assert.strictEqual(result.headers!['accept'].length, 3);
    });
  });

  describe('rawHeaders preservation', () => {
    it('should preserve original header case in rawHeaders', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: application/json\r\nX-Custom-Header: value\r\n\r\n');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.deepStrictEqual(result.rawHeaders, [
        'Content-Type', 'application/json',
        'X-Custom-Header', 'value',
      ]);
    });
  });

  describe('header normalization', () => {
    it('should normalize header names to lowercase', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-TYPE: text/html\r\nCONTENT-length: 100\r\n\r\n');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.ok(result.headers!['content-type']);
      assert.ok(result.headers!['content-length']);
      assert.strictEqual(result.headers!['Content-TYPE'], undefined);
    });

    it('should handle headers with special characters', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: application/json; charset=utf-8\r\n\r\n');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.headers!['content-type'], 'application/json; charset=utf-8');
    });
  });

  describe('edge cases', () => {
    it('should ignore empty lines in headers', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: text/html\r\n\r\nContent-Length: 100\r\n\r\n');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.headers!['content-type'], 'text/html');
      assert.strictEqual(result.headers!['content-length'], undefined);
    });

    it('should not parse status line as header', () => {
      const state = createHeadersState();
      const input = Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 123\r\n\r\n');

      assert.throws(() => parseHeaders(state, input));
    });
  });

  describe('error handling', () => {
    it('should throw error when parsing already finished headers', () => {
      const finishedState: HeadersState = {
        buffer: Buffer.alloc(0),
        headers: {},
        rawHeaders: [],
        finished: true,
      };
      const input = Buffer.from('Content-Type: text/html\r\n\r\n');

      assert.throws(
        () => parseHeaders(finishedState, input),
        {
          name: 'DecodeHttpError',
          message: 'Headers parsing already finished',
        },
      );
    });

    it('should throw error when headers exceed maximum size', () => {
      const state = createHeadersState();
      const largeHeader = 'X-Large-Header: ' + 'x'.repeat(17 * 1024) + '\r\n\r\n';
      const input = Buffer.from(largeHeader);

      assert.throws(
        () => parseHeaders(state, input),
        {
          name: 'DecodeHttpError',
          message: /Headers too large/,
        },
      );
    });

    it('should throw error when single header line exceeds 16KB', () => {
      const state = createHeadersState();
      const largeHeaderLine = 'X-Large-Header: ' + 'a'.repeat(16 * 1024);
      const input = Buffer.from(largeHeaderLine);

      assert.throws(
        () => parseHeaders(state, input),
        DecodeHttpError,
      );
    });

    it('should accumulate buffer size across chunks and throw when limit exceeded', () => {
      let state = createHeadersState();

      const chunk1 = Buffer.from('X-Header: ' + 'x'.repeat(10 * 1024) + '\r\n');
      state = parseHeaders(state, chunk1);

      const chunk2 = Buffer.from('Y-Header: ' + 'y'.repeat(7 * 1024) + '\r\n\r\n');

      assert.throws(
        () => parseHeaders(state, chunk2),
        {
          name: 'DecodeHttpError',
          message: /Headers too large/,
        },
      );
    });
  });

  describe('buffer optimization', () => {
    it('should not create new buffer when prev buffer is empty', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: text/html\r\n\r\n');

      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, true);
    });

    it('should concatenate buffers when prev buffer has data', () => {
      const stateWithBuffer: HeadersState = {
        buffer: Buffer.from('Content-'),
        headers: null,
        rawHeaders: [],
        finished: false,
      };
      const input = Buffer.from('Type: text/html\r\n\r\n');

      const result = parseHeaders(stateWithBuffer, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.headers!['content-type'], 'text/html');
    });
  });
});
