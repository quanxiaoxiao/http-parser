import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { createHeadersState, parseHeaders } from './parseHeaders.js';

describe('createHeadersState', () => {
  it('should create initial state with empty values', () => {
    const state = createHeadersState();

    assert.strictEqual(state.buffer.length, 0);
    assert.deepStrictEqual(state.headers, {});
    assert.deepStrictEqual(state.rawHeaders, []);
    assert.strictEqual(state.bytesReceived, 0);
    assert.strictEqual(state.finished, false);
  });
});

describe('parseHeaders', () => {
  describe('basic parsing', () => {
    it('should parse single header line', () => {
      const state = createHeadersState();
      const input = Buffer.from('Host: example.com\r\n');
      const result = parseHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.deepStrictEqual(result.rawHeaders, ['Host', 'example.com']);
      assert.strictEqual(result.bytesReceived, 19);
      assert.strictEqual(result.finished, false);
    });

    it('should parse multiple header lines', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Content-Type: application/json\r\n' +
        'Content-Length: 123\r\n' +
        'Host: example.com\r\n',
      );
      const result = parseHeaders(state, input);

      assert.strictEqual(result.headers['content-type'], 'application/json');
      assert.strictEqual(result.headers['content-length'], '123');
      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.finished, false);
    });

    it('should handle empty line as headers end', () => {
      const state = createHeadersState();
      const input = Buffer.from('Host: example.com\r\n\r\n');
      const result = parseHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.bytesReceived, 19);
      assert.strictEqual(result.buffer.length, 0);
    });

    it('should handle empty input', () => {
      const state = createHeadersState();
      const input = Buffer.from('');
      const result = parseHeaders(state, input);

      assert.strictEqual(result.finished, false);
      assert.deepStrictEqual(result.headers, {});
      assert.strictEqual(result.bytesReceived, 0);
    });
  });

  describe('duplicate headers', () => {
    it('should handle duplicate header names as array', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Set-Cookie: cookie1=value1\r\nSet-Cookie: cookie2=value2\r\n',
      );
      const result = parseHeaders(state, input);

      assert.ok(Array.isArray(result.headers['set-cookie']));
      assert.deepStrictEqual(result.headers['set-cookie'], [
        'cookie1=value1',
        'cookie2=value2',
      ]);
      assert.deepStrictEqual(result.rawHeaders, [
        'Set-Cookie',
        'cookie1=value1',
        'Set-Cookie',
        'cookie2=value2',
      ]);
    });

    it('should handle three or more duplicate headers', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'X-Custom: value1\r\n' +
        'X-Custom: value2\r\n' +
        'X-Custom: value3\r\n\r\n',
      );
      const result = parseHeaders(state, input);

      assert.deepStrictEqual(result.headers['x-custom'], [
        'value1',
        'value2',
        'value3',
      ]);
    });

    it('should handle mixed case duplicate headers', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Cache-Control: no-cache\r\ncache-control: no-store\r\n',
      );
      const result = parseHeaders(state, input);

      assert.ok(Array.isArray(result.headers['cache-control']));
      assert.deepStrictEqual(result.headers['cache-control'], [
        'no-cache',
        'no-store',
      ]);
    });
  });

  describe('incremental parsing', () => {
    it('should preserve buffer when line is incomplete', () => {
      const state = createHeadersState();
      const input = Buffer.from('Host: exam');
      const result = parseHeaders(state, input);

      assert.strictEqual(result.buffer.toString(), 'Host: exam');
      assert.strictEqual(result.bytesReceived, 0);
      assert.strictEqual(result.finished, false);
      assert.deepStrictEqual(result.headers, {});
    });

    it('should concatenate buffers across multiple calls', () => {
      let state = createHeadersState();
      state = parseHeaders(state, Buffer.from('Host: exa'));

      assert.strictEqual(state.buffer.toString(), 'Host: exa');
      assert.strictEqual(state.bytesReceived, 0);

      state = parseHeaders(state, Buffer.from('mple.com\r\n'));

      assert.strictEqual(state.headers['host'], 'example.com');
      assert.strictEqual(state.buffer.length, 0);
      assert.strictEqual(state.bytesReceived, 19);
    });

    it('should continue parsing from previous buffer', () => {
      let state = createHeadersState();
      state = parseHeaders(state, Buffer.from('Content-Type: appli'));

      assert.strictEqual(state.finished, false);
      assert.strictEqual(state.buffer.toString(), 'Content-Type: appli');

      state = parseHeaders(state, Buffer.from('cation/json\r\n\r\n'));

      assert.strictEqual(state.headers['content-type'], 'application/json');
      assert.strictEqual(state.finished, true);
    });

    it('should preserve previous headers when continuing parsing', () => {
      let state = createHeadersState();
      state = parseHeaders(state, Buffer.from('Content-Type: application/json\r\n'));
      state = parseHeaders(state, Buffer.from('Host: example.com\r\n\r\n'));

      assert.strictEqual(state.headers['content-type'], 'application/json');
      assert.strictEqual(state.headers['host'], 'example.com');
      assert.strictEqual(state.finished, true);
    });
  });

  describe('header formatting', () => {
    it('should normalize header names to lowercase', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Content-Type: text/html\r\n' +
        'CONTENT-LENGTH: 100\r\n' +
        'CoNtEnT-EnCoDiNg: gzip\r\n\r\n',
      );
      const result = parseHeaders(state, input);

      assert.strictEqual(result.headers['content-type'], 'text/html');
      assert.strictEqual(result.headers['content-length'], '100');
      assert.strictEqual(result.headers['content-encoding'], 'gzip');
      assert.strictEqual(result.headers['Content-Type'], undefined);
      assert.strictEqual(result.rawHeaders[0], 'Content-Type'); // Raw keeps original case
    });

    it('should handle headers with whitespace in values', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Host:   example.com   \r\n' +
        'User-Agent: Mozilla/5.0 (Windows NT)\r\n\r\n',
      );
      const result = parseHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.headers['user-agent'], 'Mozilla/5.0 (Windows NT)');
    });

    it('should handle empty header values', () => {
      const state = createHeadersState();
      const input = Buffer.from('X-Empty-Header: \r\n');
      const result = parseHeaders(state, input);

      assert.strictEqual(result.headers['x-empty-header'], '');
      assert.deepStrictEqual(result.rawHeaders, ['X-Empty-Header', '']);
    });

    it('should preserve raw headers order', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Content-Type: application/json\r\n' +
        'Host: example.com\r\n' +
        'Content-Length: 123\r\n\r\n',
      );
      const result = parseHeaders(state, input);

      assert.deepStrictEqual(result.rawHeaders, [
        'Content-Type', 'application/json',
        'Host', 'example.com',
        'Content-Length', '123',
      ]);
    });
  });

  describe('body data handling', () => {
    it('should handle complete headers with body data', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Content-Type: text/plain\r\n\r\nThis is body data',
      );
      const result = parseHeaders(state, input);

      assert.strictEqual(result.headers['content-type'], 'text/plain');
      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.buffer.toString(), 'This is body data');
    });
  });

  describe('byte counting', () => {
    it('should count bytes correctly including CRLF', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: application/json\r\n\r\n');
      const result = parseHeaders(state, input);

      assert.strictEqual(result.bytesReceived, 32); // 30 + 2 (CRLF)
    });

    it('should handle long header values', () => {
      const state = createHeadersState();
      const longValue = 'a'.repeat(1000);
      const input = Buffer.from(`X-Long-Header: ${longValue}\r\n`);
      const result = parseHeaders(state, input);

      assert.strictEqual(result.headers['x-long-header'], longValue);
      assert.strictEqual(result.bytesReceived, 1017); // 15 + 1000 + 2
    });

    it('should preserve previous headers state', () => {
      const state = createHeadersState();
      state.headers = { host: 'example.com' };
      state.rawHeaders = ['Host', 'example.com'];
      state.bytesReceived = 19;

      const input = Buffer.from('Accept: */*\r\n');
      const result = parseHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.headers['accept'], '*/*');
      assert.deepStrictEqual(result.rawHeaders, [
        'Host',
        'example.com',
        'Accept',
        '*/*',
      ]);
      assert.strictEqual(result.bytesReceived, 32); // 19 + 13
    });
  });

  describe('callbacks', () => {
    it('should call onHeader callback for each header', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Content-Type: application/json\r\n' +
        'Host: example.com\r\n\r\n',
      );

      const calls = [];
      const onHeader = (name, value, headers) => {
        calls.push({ name, value, headers: { ...headers } });
      };

      parseHeaders(state, input, onHeader);

      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0].name, 'content-type');
      assert.strictEqual(calls[0].value, 'application/json');
      assert.strictEqual(calls[1].name, 'host');
      assert.strictEqual(calls[1].value, 'example.com');
    });
  });

  describe('error handling', () => {
    it('should throw error if headers already finished', () => {
      const state = createHeadersState();
      state.finished = true;
      const input = Buffer.from('Host: example.com\r\n');

      assert.throws(
        () => parseHeaders(state, input),
        {
          name: 'DecodeHttpError',
          message: 'Headers parsing already finished',
        },
      );
    });

    it('should throw error when parsing already finished headers', () => {
      const state = createHeadersState();
      const result = parseHeaders(state, Buffer.from('\r\n'));

      assert.strictEqual(result.finished, true);

      assert.throws(
        () => parseHeaders(result, Buffer.from('More: data\r\n')),
        {
          name: 'DecodeHttpError',
          message: 'Headers parsing already finished',
        },
      );
    });
  });
});
