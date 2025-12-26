import * as assert from 'node:assert';
import { describe, test } from 'node:test';

import { DecodeHttpError } from '../errors.js';
import {
  createFixedLengthBodyState,
  decodeFixedLengthBody,
  getProgress,
  getRemainingBytes,
} from './fixed-length-body.js';

describe('createFixedLengthBodyState', () => {
  test('should create state with valid content length', () => {
    const state = createFixedLengthBodyState(100);

    assert.strictEqual(state.contentLength, 100);
    assert.strictEqual(state.bytesReceived, 0);
    assert.strictEqual(state.finished, false);
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.bodyChunks.length, 0);
  });

  test('should create finished state when content length is 0', () => {
    const state = createFixedLengthBodyState(0);

    assert.strictEqual(state.contentLength, 0);
    assert.strictEqual(state.finished, true);
  });

  test('should throw error for negative content length', () => {
    assert.throws(
      () => createFixedLengthBodyState(-1),
      (err: Error) => {
        assert.ok(err instanceof DecodeHttpError);
        assert.ok(err.message.includes('Invalid content length'));
        return true;
      },
    );
  });

  test('should throw error for non-integer content length', () => {
    assert.throws(
      () => createFixedLengthBodyState(100.5),
      (err: Error) => {
        assert.ok(err instanceof DecodeHttpError);
        assert.ok(err.message.includes('Invalid content length'));
        return true;
      },
    );
  });
});

describe('decodeFixedLengthBody', () => {
  test('should parse single chunk exactly matching content length', () => {
    const state = createFixedLengthBodyState(10);
    const input = Buffer.from('1234567890');

    const result = decodeFixedLengthBody(state, input);

    assert.strictEqual(result.bytesReceived, 10);
    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.buffer.toString(), '');
    assert.strictEqual(result.bodyChunks.length, 1);
  });

  test('should parse multiple chunks', () => {
    let state = createFixedLengthBodyState(10);

    state = decodeFixedLengthBody(state, Buffer.from('12345'));
    assert.strictEqual(state.bytesReceived, 5);
    assert.strictEqual(state.finished, false);

    state = decodeFixedLengthBody(state, Buffer.from('67890'));
    assert.strictEqual(state.bytesReceived, 10);
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.buffer.toString(), '');
  });

  test('should handle empty chunks', () => {
    let state = createFixedLengthBodyState(5);

    state = decodeFixedLengthBody(state, Buffer.from(''));
    assert.strictEqual(state.bytesReceived, 0);
    assert.strictEqual(state.finished, false);
    assert.strictEqual(state.bodyChunks.length, 0);

    state = decodeFixedLengthBody(state, Buffer.from('12345'));
    assert.strictEqual(state.bytesReceived, 5);
    assert.strictEqual(state.finished, true);
  });

  test('should more data than content length', () => {
    let state = createFixedLengthBodyState(5);
    const input = Buffer.from('1234567890');

    state = decodeFixedLengthBody(state, input);

    assert.strictEqual(state.bytesReceived, input.length);
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.bodyChunks[0].length, 5);
    assert.strictEqual(state.buffer.toString(), input.subarray(5).toString());
  });

  test('should call onChunk callback  more data than content length', () => {
    let state = createFixedLengthBodyState(5);
    const input = Buffer.from('1234567890');

    state = decodeFixedLengthBody(state, input, () => {});

    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.bodyChunks.length, 0);
    assert.strictEqual(state.bytesReceived, input.length);
    assert.strictEqual(state.contentLength, 5);
    assert.strictEqual(state.buffer.toString(), input.subarray(5 - input.length).toString());
  });

  test('should throw error when parsing already finished state', () => {
    let state = createFixedLengthBodyState(5);
    state = decodeFixedLengthBody(state, Buffer.from('12345'));

    assert.throws(
      () => decodeFixedLengthBody(state, Buffer.from('more')),
      (err: Error) => {
        assert.ok(err instanceof DecodeHttpError);
        assert.ok(err.message.includes('already finished'));
        return true;
      },
    );
  });

  test('should call onChunk callback for each chunk', () => {
    const chunks: Buffer[] = [];
    const onChunk = (chunk: Buffer) => chunks.push(chunk);

    let state = createFixedLengthBodyState(10);

    state = decodeFixedLengthBody(state, Buffer.from('12345'), onChunk);
    state = decodeFixedLengthBody(state, Buffer.from('67890'), onChunk);

    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].toString(), '12345');
    assert.strictEqual(chunks[1].toString(), '67890');
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.bodyChunks.length, 0);
  });

  test('should not call onChunk for empty buffers', () => {
    let callCount = 0;
    const onChunk = () => callCount++;

    let state = createFixedLengthBodyState(5);
    state = decodeFixedLengthBody(state, Buffer.from(''), onChunk);
    assert.ok(!state.finished);
    assert.strictEqual(state.bytesReceived, 0);
    state = decodeFixedLengthBody(state, Buffer.from('12345'), onChunk);

    assert.ok(state.finished);
    assert.strictEqual(state.bytesReceived, 5);
    assert.strictEqual(callCount, 1);
  });

  test('should concat buffers correctly when no onChunk provided', () => {
    let state = createFixedLengthBodyState(15);

    state = decodeFixedLengthBody(state, Buffer.from('hello'));
    state = decodeFixedLengthBody(state, Buffer.from(' '));
    state = decodeFixedLengthBody(state, Buffer.from('world'));
    state = decodeFixedLengthBody(state, Buffer.from('!!!!other'));

    assert.strictEqual(state.buffer.toString(), 'other');
    assert.strictEqual(state.bodyChunks.length, 4);
    assert.strictEqual(Buffer.concat(state.bodyChunks).toString(), 'hello world!!!!');
  });

  test('should optimize buffer handling for first chunk', () => {
    const state = createFixedLengthBodyState(5);
    const input = Buffer.from('hello');

    const result = decodeFixedLengthBody(state, input);

    assert.strictEqual(result.buffer.toString(), '');
  });
});

describe('getProgress', () => {
  test('should return 1 for zero content length', () => {
    const state = createFixedLengthBodyState(0);
    assert.strictEqual(getProgress(state), 1);
  });

  test('should return 0 for no bytes received', () => {
    const state = createFixedLengthBodyState(100);
    assert.strictEqual(getProgress(state), 0);
  });

  test('should return correct progress for partial data', () => {
    let state = createFixedLengthBodyState(100);
    state = decodeFixedLengthBody(state, Buffer.alloc(50));

    assert.strictEqual(getProgress(state), 0.5);
  });

  test('should return 1 for completed transfer', () => {
    let state = createFixedLengthBodyState(100);
    state = decodeFixedLengthBody(state, Buffer.alloc(100));

    assert.strictEqual(getProgress(state), 1);
  });

  test('should handle incremental progress', () => {
    let state = createFixedLengthBodyState(100);

    state = decodeFixedLengthBody(state, Buffer.alloc(25));
    assert.strictEqual(getProgress(state), 0.25);

    state = decodeFixedLengthBody(state, Buffer.alloc(25));
    assert.strictEqual(getProgress(state), 0.5);

    state = decodeFixedLengthBody(state, Buffer.alloc(50));
    assert.strictEqual(getProgress(state), 1);
  });
});

describe('getRemainingBytes', () => {
  test('should return full content length initially', () => {
    const state = createFixedLengthBodyState(100);
    assert.strictEqual(getRemainingBytes(state), 100);
  });

  test('should return 0 for zero content length', () => {
    const state = createFixedLengthBodyState(0);
    assert.strictEqual(getRemainingBytes(state), 0);
  });

  test('should return correct remaining bytes after partial data', () => {
    let state = createFixedLengthBodyState(100);
    state = decodeFixedLengthBody(state, Buffer.alloc(30));

    assert.strictEqual(getRemainingBytes(state), 70);
  });

  test('should return 0 when transfer is complete', () => {
    let state = createFixedLengthBodyState(100);
    state = decodeFixedLengthBody(state, Buffer.alloc(100));

    assert.strictEqual(getRemainingBytes(state), 0);
  });

  test('should handle incremental decreases', () => {
    let state = createFixedLengthBodyState(100);

    state = decodeFixedLengthBody(state, Buffer.alloc(10));
    assert.strictEqual(getRemainingBytes(state), 90);

    state = decodeFixedLengthBody(state, Buffer.alloc(40));
    assert.strictEqual(getRemainingBytes(state), 50);

    state = decodeFixedLengthBody(state, Buffer.alloc(50));
    assert.strictEqual(getRemainingBytes(state), 0);
  });
});

describe('integration tests', () => {
  test('should handle complete workflow without onChunk', () => {
    let state = createFixedLengthBodyState(20);

    assert.strictEqual(getProgress(state), 0);
    assert.strictEqual(getRemainingBytes(state), 20);

    state = decodeFixedLengthBody(state, Buffer.from('Hello, '));
    assert.strictEqual(getProgress(state), 0.35);
    assert.strictEqual(getRemainingBytes(state), 13);

    state = decodeFixedLengthBody(state, Buffer.from('World! '));
    assert.strictEqual(getProgress(state), 0.7);
    assert.strictEqual(getRemainingBytes(state), 6);

    state = decodeFixedLengthBody(state, Buffer.from('Done!!aa'));
    assert.strictEqual(getProgress(state), 1);
    assert.strictEqual(getRemainingBytes(state), 0);
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.buffer.toString(), 'aa');
  });

  test('should handle complete workflow with onChunk', () => {
    const receivedChunks: string[] = [];
    const onChunk = (chunk: Buffer) => receivedChunks.push(chunk.toString());

    let state = createFixedLengthBodyState(20);

    state = decodeFixedLengthBody(state, Buffer.from('Hello, '), onChunk);
    state = decodeFixedLengthBody(state, Buffer.from('World! '), onChunk);
    state = decodeFixedLengthBody(state, Buffer.from('Done!!'), onChunk);

    assert.strictEqual(state.finished, true);
    assert.strictEqual(receivedChunks.length, 3);
    assert.deepStrictEqual(receivedChunks, ['Hello, ', 'World! ', 'Done!!']);
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.bodyChunks.length, 0);
  });
});
