import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, test } from 'node:test';

import { HttpDecodePhase } from '../specs.js';
import {
  createRequestState,
  createResponseState,
  decodeRequest,
  decodeResponse,
} from './message.js';

describe('HTTP Decoder - Error Handling', () => {
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

describe('HTTP Decoder - State Management', () => {
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

    assert.ok(state2.events.length > 0);
    assert.ok(state2.events.length !== events1Count + state2.events.length);
  });
});

describe('HTTP Decoder - Edge Cases', () => {
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
