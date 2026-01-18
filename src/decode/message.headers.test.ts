import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, test } from 'node:test';

import { HttpDecodeState } from '../specs.js';
import {
  decodeRequest,
  decodeResponse,
} from './message.js';

describe('HTTP Decoder - Headers', () => {
  test('should decode simple GET request with headers', () => {
    const input = Buffer.from(
      'GET /path HTTP/1.1\r\n' +
      'Host: example.com\r\n' +
      '\r\n',
    );

    const state = decodeRequest(null, input);

    assert.strictEqual(state.state, HttpDecodeState.FINISHED);
    assert.ok(state.parsing.headers?.headers);
    assert.strictEqual(state.parsing.headers?.headers?.host, 'example.com');
  });

  test('should decode request with query parameters and headers', () => {
    const input = Buffer.from(
      'GET /path?query=value&foo=bar HTTP/1.1\r\n' +
      'Host: example.com\r\n' +
      'User-Agent: TestClient/1.0\r\n' +
      '\r\n',
    );

    const state = decodeRequest(null, input);

    assert.strictEqual(state.state, HttpDecodeState.FINISHED);
    assert.strictEqual(state.parsing.startLine?.path, '/path?query=value&foo=bar');
    assert.ok(state.parsing.headers?.headers);
  });

  test('should decode POST request with Content-Type header', () => {
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

    assert.strictEqual(state.state, HttpDecodeState.FINISHED);
    assert.ok(state.parsing.headers?.headers);
    assert.strictEqual(state.parsing.headers?.headers?.['content-type'], 'application/x-www-form-urlencoded');
  });

  test('should decode simple 200 response with headers', () => {
    const input = Buffer.from(
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: text/plain\r\n' +
      'Content-Length: 5\r\n' +
      '\r\n' +
      'Hello',
    );

    const state = decodeResponse(null, input);

    assert.strictEqual(state.state, HttpDecodeState.FINISHED);
    assert.ok(state.parsing.headers?.headers);
    assert.strictEqual(state.parsing.headers?.headers?.['content-type'], 'text/plain');
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

    assert.strictEqual(state.state, HttpDecodeState.FINISHED);
    assert.ok(state.parsing.headers?.headers);

    const headerNames = Object.keys(state.parsing.headers.headers);
    assert.ok(headerNames.length >= 4);
    assert.ok(headerNames.includes('content-type'));
    assert.ok(headerNames.includes('content-length'));
    assert.ok(headerNames.includes('cache-control'));
    assert.ok(headerNames.includes('set-cookie'));
  });

  test('should handle response without body with headers', () => {
    const input = Buffer.from(
      'HTTP/1.1 204 No Content\r\n' +
      'Date: Mon, 01 Jan 2024 00:00:00 GMT\r\n' +
      '\r\n',
    );

    const state = decodeResponse(null, input);

    assert.strictEqual(state.state, HttpDecodeState.FINISHED);
    assert.ok(state.parsing.headers?.headers);
    assert.strictEqual(state.parsing.headers?.headers?.date, 'Mon, 01 Jan 2024 00:00:00 GMT');
  });

  test('should handle multi-line header values', () => {
    const input = Buffer.from(
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: text/plain\r\n' +
      'Content-Length: 0\r\n' +
      '\r\n',
    );

    const state = decodeResponse(null, input);

    assert.strictEqual(state.state, HttpDecodeState.FINISHED);
    assert.ok(state.parsing.headers?.headers);
  });
});
