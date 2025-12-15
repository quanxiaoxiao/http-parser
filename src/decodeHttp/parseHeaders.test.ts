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
  it('should throw error if headers already finished', () => {
    const state = createHeadersState();
    state.finished = true;
    const input = Buffer.from('Host: example.com\r\n');

    assert.throws(
      () => parseHeaders(state, input),
      {
        name: 'DecodeHttpError',
        message: 'Headers parsing already finished',
      }
    );
  });

  it('should parse single header line', () => {
    const state = createHeadersState();
    const input = Buffer.from('Host: example.com\r\n');
    const result = parseHeaders(state, input);

    assert.strictEqual(result.headers['host'], 'example.com');
    assert.deepStrictEqual(result.rawHeaders, ['Host', 'example.com']);
    assert.strictEqual(result.bytesReceived, 19); // "Host: example.com" + "\r\n"
    assert.strictEqual(result.finished, false);
  });

  it('should parse multiple header lines', () => {
    const state = createHeadersState();
    const input = Buffer.from(
      'Host: example.com\r\nContent-Type: application/json\r\n'
    );
    const result = parseHeaders(state, input);

    assert.strictEqual(result.headers['host'], 'example.com');
    assert.strictEqual(result.headers['content-type'], 'application/json');
    assert.deepStrictEqual(result.rawHeaders, [
      'Host',
      'example.com',
      'Content-Type',
      'application/json',
    ]);
    assert.strictEqual(result.bytesReceived, 51);
    assert.strictEqual(result.finished, false);
  });

  it('should handle empty line as headers end', () => {
    const state = createHeadersState();
    const input = Buffer.from('Host: example.com\r\n\r\n');
    const result = parseHeaders(state, input);

    assert.strictEqual(result.headers['host'], 'example.com');
    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bytesReceived, 19); // Only header line, not final CRLF
    assert.strictEqual(result.buffer.length, 0);
  });

  it('should handle duplicate header names as array', () => {
    const state = createHeadersState();
    const input = Buffer.from(
      'Set-Cookie: cookie1=value1\r\nSet-Cookie: cookie2=value2\r\n'
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

  it('should handle three or more duplicate header names as array', () => {
    const state = createHeadersState();
    const input = Buffer.from(
      'Set-Cookie: cookie1\r\nSet-Cookie: cookie2\r\nSet-Cookie: cookie3\r\n'
    );
    const result = parseHeaders(state, input);

    assert.ok(Array.isArray(result.headers['set-cookie']));
    assert.deepStrictEqual(result.headers['set-cookie'], [
      'cookie1',
      'cookie2',
      'cookie3',
    ]);
  });

  it('should preserve buffer when line is incomplete', () => {
    const state = createHeadersState();
    const input = Buffer.from('Host: exam'); // Incomplete line without \r\n
    const result = parseHeaders(state, input);

    assert.strictEqual(result.buffer.toString(), 'Host: exam');
    assert.strictEqual(result.bytesReceived, 0);
    assert.strictEqual(result.finished, false);
    assert.deepStrictEqual(result.headers, {});
  });

  it('should concatenate buffers across multiple calls', () => {
    const state1 = createHeadersState();
    const result1 = parseHeaders(state1, Buffer.from('Host: exa'));

    assert.strictEqual(result1.buffer.toString(), 'Host: exa');
    assert.strictEqual(result1.bytesReceived, 0);

    const result2 = parseHeaders(result1, Buffer.from('mple.com\r\n'));

    assert.strictEqual(result2.headers['host'], 'example.com');
    assert.strictEqual(result2.buffer.length, 0);
    assert.strictEqual(result2.bytesReceived, 19);
  });

  it('should normalize header names to lowercase', () => {
    const state = createHeadersState();
    const input = Buffer.from('Content-Type: text/html\r\n');
    const result = parseHeaders(state, input);

    assert.strictEqual(result.headers['content-type'], 'text/html');
    assert.strictEqual(result.headers['Content-Type'], undefined);
    assert.strictEqual(result.rawHeaders[0], 'Content-Type'); // Raw keeps original case
  });

  it('should preserve previous headers when parsing new input', () => {
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

  it('should handle complete headers with body data', () => {
    const state = createHeadersState();
    const input = Buffer.from(
      'Content-Type: text/plain\r\n\r\nThis is body data'
    );
    const result = parseHeaders(state, input);

    assert.strictEqual(result.headers['content-type'], 'text/plain');
    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.buffer.toString(), 'This is body data');
  });

  it('should handle headers with various whitespace', () => {
    const state = createHeadersState();
    const input = Buffer.from(
      'Host:   example.com   \r\nUser-Agent: Mozilla/5.0\r\n'
    );
    const result = parseHeaders(state, input);

    assert.strictEqual(result.headers['host'], 'example.com');
    assert.strictEqual(result.headers['user-agent'], 'Mozilla/5.0');
  });

  it('should handle empty headers correctly', () => {
    const state = createHeadersState();
    const input = Buffer.from('X-Empty-Header: \r\n');
    const result = parseHeaders(state, input);

    assert.strictEqual(result.headers['x-empty-header'], '');
    assert.deepStrictEqual(result.rawHeaders, ['X-Empty-Header', '']);
  });

  it('should handle mixed case duplicate headers', () => {
    const state = createHeadersState();
    const input = Buffer.from(
      'Cache-Control: no-cache\r\ncache-control: no-store\r\n'
    );
    const result = parseHeaders(state, input);

    assert.ok(Array.isArray(result.headers['cache-control']));
    assert.deepStrictEqual(result.headers['cache-control'], [
      'no-cache',
      'no-store',
    ]);
  });

  it('should handle long header values', () => {
    const state = createHeadersState();
    const longValue = 'a'.repeat(1000);
    const input = Buffer.from(`X-Long-Header: ${longValue}\r\n`);
    const result = parseHeaders(state, input);

    assert.strictEqual(result.headers['x-long-header'], longValue);
    assert.strictEqual(result.bytesReceived, 1017); // "X-Long-Header: " (15) + 1000 + "\r\n" (2)
  });
});
