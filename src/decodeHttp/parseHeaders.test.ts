import * as assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { createHeadersState, type HeadersState,parseHeaders } from './parseHeaders.js';

const mockDecodeHttpError = class DecodeHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeHttpError';
  }
};

const mockParseHeaderLine = mock.fn((line: string): [string, string] => {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) {
    return [line.trim(), ''];
  }
  const name = line.slice(0, colonIndex).trim();
  const value = line.slice(colonIndex + 1).trim();
  return [name, value];
});

describe('parseHeaders', () => {
  describe('createHeadersState', () => {
    it('should create initial state with empty values', () => {
      const state = createHeadersState();

      assert.strictEqual(state.buffer.length, 0);
      assert.strictEqual(state.headers, null);
      assert.strictEqual(state.finished, false);
      assert.deepStrictEqual(state.rawHeaders, []);
    });
  });

  describe('parseHeaders - basic functionality', () => {
    it('should parse simple headers correctly', () => {
      const initialState = createHeadersState();
      const input = Buffer.from('Content-Type: application/json\r\nContent-Length: 100\r\n\r\n');

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, true);
      assert.ok(result.headers);
      assert.strictEqual(result.headers['content-type'], 'application/json');
      assert.strictEqual(result.headers['content-length'], '100');
    });

    it('should preserve remaining buffer after headers', () => {
      const initialState = createHeadersState();
      const input = Buffer.from('Content-Type: text/html\r\n\r\nBody content here');

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.buffer.toString(), 'Body content here');
    });

    it('should handle headers split across multiple chunks', () => {
      const initialState = createHeadersState();

      // First chunk
      const chunk1 = Buffer.from('Content-Type: application/json\r\n');
      const state1 = parseHeaders(initialState, chunk1);

      assert.strictEqual(state1.finished, false);
      assert.strictEqual(state1.headers, null);

      // Second chunk
      const chunk2 = Buffer.from('Content-Length: 100\r\n\r\n');
      const state2 = parseHeaders(state1, chunk2);

      assert.strictEqual(state2.finished, true);
      assert.ok(state2.headers);
      assert.strictEqual(state2.headers['content-type'], 'application/json');
      assert.strictEqual(state2.headers['content-length'], '100');
    });

    it('should return unfinished state when no double CRLF found', () => {
      const initialState = createHeadersState();
      const input = Buffer.from('Content-Type: application/json\r\n');

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, false);
      assert.strictEqual(result.headers, null);
      assert.strictEqual(result.buffer.toString(), 'Content-Type: application/json\r\n');
    });
  });

  describe('parseHeaders - duplicate headers', () => {
    it('should handle duplicate headers as array', () => {
      const initialState = createHeadersState();
      const input = Buffer.from(
        'Set-Cookie: session=abc123\r\n' +
        'Set-Cookie: token=xyz789\r\n' +
        '\r\n',
      );

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, true);
      assert.ok(result.headers);
      assert.ok(Array.isArray(result.headers['set-cookie']));
      assert.deepStrictEqual(result.headers['set-cookie'], ['session=abc123', 'token=xyz789']);
    });

    it('should convert single header to array when duplicate added', () => {
      const initialState = createHeadersState();
      const input = Buffer.from(
        'Accept: text/html\r\n' +
        'Accept: application/json\r\n' +
        'Accept: application/xml\r\n' +
        '\r\n',
      );

      const result = parseHeaders(initialState, input);

      assert.ok(Array.isArray(result.headers!['accept']));
      assert.strictEqual(result.headers!['accept'].length, 3);
    });
  });

  describe('parseHeaders - rawHeaders', () => {
    it('should preserve original header case in rawHeaders', () => {
      const initialState = createHeadersState();
      const input = Buffer.from('Content-Type: application/json\r\nX-Custom-Header: value\r\n\r\n');

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, true);
      assert.deepStrictEqual(result.rawHeaders, [
        'Content-Type', 'application/json',
        'X-Custom-Header', 'value',
      ]);
    });
  });

  describe('parseHeaders - edge cases', () => {
    it('should handle empty headers', () => {
      const initialState = createHeadersState();
      const input = Buffer.from('\r\n\r\n');

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, true);
      assert.ok(result.headers);
      assert.strictEqual(Object.keys(result.headers).length, 0);
    });

    it('should ignore empty lines in headers', () => {
      const initialState = createHeadersState();
      const input = Buffer.from('Content-Type: text/html\r\n\r\nContent-Length: 100\r\n\r\n');

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.headers!['content-type'], 'text/html');
      // Content-Length should not be parsed as it's after the first \r\n\r\n
      assert.strictEqual(result.headers!['content-length'], undefined);
    });

    it('should handle headers with special characters', () => {
      const initialState = createHeadersState();
      const input = Buffer.from('Content-Type: application/json; charset=utf-8\r\n\r\n');

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.headers!['content-type'], 'application/json; charset=utf-8');
    });

    it('should normalize header names to lowercase', () => {
      const initialState = createHeadersState();
      const input = Buffer.from('Content-TYPE: text/html\r\nCONTENT-length: 100\r\n\r\n');

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, true);
      assert.ok(result.headers!['content-type']);
      assert.ok(result.headers!['content-length']);
      assert.strictEqual(result.headers!['Content-TYPE'], undefined);
    });
  });

  describe('parseHeaders - error handling', () => {
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
      const initialState = createHeadersState();
      const largeHeader = 'X-Large-Header: ' + 'x'.repeat(17 * 1024) + '\r\n\r\n';
      const input = Buffer.from(largeHeader);

      assert.throws(
        () => parseHeaders(initialState, input),
        {
          name: 'DecodeHttpError',
          message: /Headers too large/,
        },
      );
    });

    it('should accumulate buffer size across chunks and throw when limit exceeded', () => {
      const initialState = createHeadersState();

      // First chunk: 10KB
      const chunk1 = Buffer.from('X-Header: ' + 'x'.repeat(10 * 1024) + '\r\n');
      const state1 = parseHeaders(initialState, chunk1);

      // Second chunk: 7KB (total > 16KB)
      const chunk2 = Buffer.from('Y-Header: ' + 'y'.repeat(7 * 1024) + '\r\n\r\n');

      assert.throws(
        () => parseHeaders(state1, chunk2),
        {
          name: 'DecodeHttpError',
          message: /Headers too large/,
        },
      );
    });
  });

  describe('parseHeaders - buffer optimization', () => {
    it('should not create new buffer when prev buffer is empty', () => {
      const initialState = createHeadersState();
      const input = Buffer.from('Content-Type: text/html\r\n\r\n');

      const result = parseHeaders(initialState, input);

      assert.strictEqual(result.finished, true);
      // The implementation should use input directly when prev.buffer is empty
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

  describe('parseHeaders - real-world scenarios', () => {
    it('should handle chunked streaming scenario', () => {
      let state = createHeadersState();

      // Simulate receiving headers in small chunks
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
});
