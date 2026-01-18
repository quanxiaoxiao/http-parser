import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, test } from 'node:test';

import { HttpDecodeState } from '../specs.js';
import {
  decodeRequest,
  decodeResponse,
  type HttpRequestState,
  type HttpResponseState,
} from './message.js';

describe('HTTP Decoder - Streaming', () => {
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
    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);
    assert.strictEqual(state.parsing.startLine?.method, 'GET');
  });

  test('should handle segmented start line', () => {
    const state1 = decodeRequest(null, Buffer.from('GET /pa'));
    assert.strictEqual(state1.phase, HttpDecodeState.START_LINE);

    const state2 = decodeRequest(state1, Buffer.from('th HTTP/1.1\r\n\r\n'));
    assert.strictEqual(state2.phase, HttpDecodeState.FINISHED);
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
    assert.strictEqual(state.phase, HttpDecodeState.BODY_FIXED_LENGTH);

    state = decodeRequest(state, Buffer.from(bodyPart1));

    state = decodeRequest(state, Buffer.from(bodyPart2));
    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);

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

    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);

    const bodyCompleteEvent = state.events.find(e => e.type === 'body-complete');
    assert.ok(bodyCompleteEvent);
    assert.strictEqual(bodyCompleteEvent.totalSize, 11);
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
    assert.strictEqual(state.phase, HttpDecodeState.FINISHED);
    assert.strictEqual(state.parsing.startLine?.statusCode, 200);
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
});
