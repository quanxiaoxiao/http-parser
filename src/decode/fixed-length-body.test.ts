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
    assert.strictEqual(state.receivedBody, 0);
    assert.strictEqual(state.finished, false);
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.chunks.length, 0);
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
        assert.ok(err.message.includes('Invalid content length'));
        return true;
      },
    );
  });

  test('should throw error for non-integer content length', () => {
    assert.throws(
      () => createFixedLengthBodyState(100.5),
      (err: Error) => {
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

    assert.strictEqual(result.receivedBody, 10);
    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.buffer.toString(), '');
    assert.strictEqual(result.chunks.length, 1);
  });

  test('should parse multiple chunks', () => {
    let state = createFixedLengthBodyState(10);

    state = decodeFixedLengthBody(state, Buffer.from('12345'));
    assert.strictEqual(state.receivedBody, 5);
    assert.strictEqual(state.finished, false);

    state = decodeFixedLengthBody(state, Buffer.from('67890'));
    assert.strictEqual(state.receivedBody, 10);
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.buffer.toString(), '');
  });

  test('should handle empty chunks', () => {
    let state = createFixedLengthBodyState(5);

    state = decodeFixedLengthBody(state, Buffer.from(''));
    assert.strictEqual(state.receivedBody, 0);
    assert.strictEqual(state.finished, false);
    assert.strictEqual(state.chunks.length, 0);

    state = decodeFixedLengthBody(state, Buffer.from('12345'));
    assert.strictEqual(state.receivedBody, 5);
    assert.strictEqual(state.finished, true);
  });

  test('should more data than content length', () => {
    let state = createFixedLengthBodyState(5);
    const input = Buffer.from('1234567890');

    state = decodeFixedLengthBody(state, input);

    assert.strictEqual(state.receivedBody, input.length);
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.chunks[0].length, 5);
    assert.strictEqual(state.buffer.toString(), input.subarray(5).toString());
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
});

describe('FixedLengthBody Decoder', () => {

  describe('createFixedLengthBodyState', () => {
    test('应该正确初始化状态', () => {
      const state = createFixedLengthBodyState(100);
      assert.equal(state.contentLength, 100);
      assert.equal(state.receivedBody, 0);
      assert.equal(state.finished, false);
      assert.equal(state.chunks.length, 0);
    });

    test('当 Content-Length 为 0 时，应立即标记为完成', () => {
      const state = createFixedLengthBodyState(0);
      assert.equal(state.finished, true);
    });

    test('无效的 Content-Length 应抛出错误', () => {
      assert.throws(() => createFixedLengthBodyState(-1));
      assert.throws(() => createFixedLengthBodyState(1.5));
    });
  });

  describe('decodeFixedLengthBody', () => {
    test('多次输入应正确累加数据', () => {
      let state = createFixedLengthBodyState(10);

      state = decodeFixedLengthBody(state, Buffer.from('hello'));
      assert.equal(state.receivedBody, 5);
      assert.equal(state.finished, false);

      state = decodeFixedLengthBody(state, Buffer.from('world'));
      assert.equal(state.receivedBody, 10);
      assert.equal(state.finished, true);
      assert.deepEqual(Buffer.concat(state.chunks), Buffer.from('helloworld'));
    });

    test('当输入超出 Content-Length 时，应截断输入并将剩余部分存入 buffer', () => {
      const state = createFixedLengthBodyState(5);
      const input = Buffer.from('12345678'); // 超出 3 字节

      const nextState = decodeFixedLengthBody(state, input);

      assert.equal(nextState.finished, true);
      assert.equal(nextState.receivedBody, 8);
      // 验证 chunks 只包含前 5 个字节
      assert.deepEqual(Buffer.concat(nextState.chunks), Buffer.from('12345'));
      // 验证剩余的 3 个字节进入了 buffer
      assert.deepEqual(nextState.buffer, Buffer.from('678'));
    });

    test('在已完成的状态下继续解码应抛出错误', () => {
      const state = createFixedLengthBodyState(5);
      const nextState = decodeFixedLengthBody(state, Buffer.from('12345'));

      assert.throws(() => {
        decodeFixedLengthBody(nextState, Buffer.from('extra'));
      }, {
        name: 'DecodeHttpError',
        message: 'Content-Length parsing already finished',
      });
    });

    test('输入空 Buffer 时不应改变状态', () => {
      const state = createFixedLengthBodyState(10);
      const nextState = decodeFixedLengthBody(state, Buffer.alloc(0));
      assert.equal(nextState, state);
    });
  });

  describe('Helper Functions', () => {
    test('getProgress 应该正确计算进度', () => {
      const state = createFixedLengthBodyState(100);
      assert.equal(getProgress(state), 0);

      const nextState = decodeFixedLengthBody(state, Buffer.alloc(50));
      assert.equal(getProgress(nextState), 0.5);

      const finalState = decodeFixedLengthBody(nextState, Buffer.alloc(60));
      assert.equal(getProgress(finalState), 1); // 不应超过 1
    });

    test('getRemainingBytes 应该正确返回剩余字节数', () => {
      const state = createFixedLengthBodyState(100);
      assert.equal(getRemainingBytes(state), 100);

      const nextState = decodeFixedLengthBody(state, Buffer.alloc(30));
      assert.equal(getRemainingBytes(nextState), 70);

      const finalState = decodeFixedLengthBody(nextState, Buffer.alloc(80));
      assert.equal(getRemainingBytes(finalState), 0); // 不应为负数
    });
  });
});
