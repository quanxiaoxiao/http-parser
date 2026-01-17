import * as assert from 'node:assert';
import {
  describe, it,test,
} from 'node:test';

import type { HttpDecodeError } from '../errors.js';
import { HttpDecodeErrorCode } from '../errors.js';
import {
  createFixedLengthBodyState,
  decodeFixedLengthBody,
  FixedLengthBodyPhase,
  getProgress,
  getRemainingBytes,
} from './fixed-length-body.js';

describe('createFixedLengthBodyState', () => {
  test('should create state with valid content length', () => {
    const state = createFixedLengthBodyState(100);

    assert.strictEqual(state.remainingBytes, 100);
    assert.strictEqual(state.decodedBodyBytes, 0);
    assert.strictEqual(state.phase, FixedLengthBodyPhase.DATA);
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.chunks.length, 0);
  });

  test('should create finished state when content length is 0', () => {
    const state = createFixedLengthBodyState(0);

    assert.strictEqual(state.remainingBytes, 0);
    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
  });

  test('should throw error for negative content length', () => {
    assert.throws(
      () => createFixedLengthBodyState(-1),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid Content-Length'));
        return true;
      },
    );
  });

  test('should throw error for non-integer content length', () => {
    assert.throws(
      () => createFixedLengthBodyState(100.5),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid Content-Length'));
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

    assert.strictEqual(result.decodedBodyBytes, 10);
    assert.strictEqual(result.phase, FixedLengthBodyPhase.FINISHED);
    assert.strictEqual(result.buffer.toString(), '');
    assert.strictEqual(result.chunks.length, 1);
  });

  test('should parse multiple chunks', () => {
    let state = createFixedLengthBodyState(10);

    state = decodeFixedLengthBody(state, Buffer.from('12345'));
    assert.strictEqual(state.decodedBodyBytes, 5);
    assert.strictEqual(state.phase, FixedLengthBodyPhase.DATA);

    state = decodeFixedLengthBody(state, Buffer.from('67890'));
    assert.strictEqual(state.decodedBodyBytes, 10);
    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
    assert.strictEqual(state.buffer.toString(), '');
  });

  test('should handle empty chunks', () => {
    let state = createFixedLengthBodyState(5);

    state = decodeFixedLengthBody(state, Buffer.from(''));
    assert.strictEqual(state.decodedBodyBytes, 0);
    assert.strictEqual(state.phase, FixedLengthBodyPhase.DATA);
    assert.strictEqual(state.chunks.length, 0);

    state = decodeFixedLengthBody(state, Buffer.from('12345'));
    assert.strictEqual(state.decodedBodyBytes, 5);
    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
  });

  test('should more data than content length', () => {
    let state = createFixedLengthBodyState(5);
    const input = Buffer.from('1234567890');

    state = decodeFixedLengthBody(state, input);

    assert.strictEqual(state.decodedBodyBytes, 5);
    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
    assert.strictEqual(state.chunks[0].length, 5);
    assert.strictEqual(state.buffer.toString(), input.subarray(5).toString());
  });

  test('should throw error when parsing already finished state', () => {
    let state = createFixedLengthBodyState(5);
    state = decodeFixedLengthBody(state, Buffer.from('12345'));

    assert.throws(
      () => decodeFixedLengthBody(state, Buffer.from('more')),
      (err: Error) => {
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
    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
    assert.strictEqual(state.buffer.toString(), 'aa');
  });
});

describe('FixedLengthBody Decoder', () => {

  describe('createFixedLengthBodyState', () => {
    test('应该正确初始化状态', () => {
      const state = createFixedLengthBodyState(100);
      assert.equal(state.remainingBytes, 100);
      assert.equal(state.decodedBodyBytes, 0);
      assert.strictEqual(state.phase, FixedLengthBodyPhase.DATA);
      assert.equal(state.chunks.length, 0);
    });

    test('当 Content-Length 为 0 时，应立即标记为完成', () => {
      const state = createFixedLengthBodyState(0);
      assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
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
      assert.equal(state.decodedBodyBytes, 5);
      assert.strictEqual(state.phase, FixedLengthBodyPhase.DATA);

      state = decodeFixedLengthBody(state, Buffer.from('world'));
      assert.equal(state.decodedBodyBytes, 10);
      assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
      assert.deepEqual(Buffer.concat(state.chunks), Buffer.from('helloworld'));
    });

    test('当输入超出 Content-Length 时，应截断输入并将剩余部分存入 buffer', () => {
      const state = createFixedLengthBodyState(5);
      const input = Buffer.from('12345678'); // 超出 3 字节

      const nextState = decodeFixedLengthBody(state, input);

      assert.strictEqual(nextState.phase, FixedLengthBodyPhase.FINISHED);
      assert.equal(nextState.decodedBodyBytes, 5);
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

describe('createFixedLengthBodyState', () => {
  it('应该创建有效的初始状态（contentLength > 0）', () => {
    const state = createFixedLengthBodyState(100);

    assert.strictEqual(state.type, 'fixed');
    assert.strictEqual(state.phase, FixedLengthBodyPhase.DATA);
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.remainingBytes, 100);
    assert.strictEqual(state.decodedBodyBytes, 0);
    assert.deepStrictEqual(state.chunks, []);
  });

  it('应该创建已完成状态（contentLength = 0）', () => {
    const state = createFixedLengthBodyState(0);

    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
    assert.strictEqual(state.remainingBytes, 0);
    assert.strictEqual(state.decodedBodyBytes, 0);
  });

  it('应该使用自定义 limits', () => {
    const customLimits = { maxBodySize: 500 };
    const state = createFixedLengthBodyState(100, customLimits);

    assert.strictEqual(state.limits.maxBodySize, 500);
  });

  it('应该拒绝负数 contentLength', () => {
    assert.throws(
      () => createFixedLengthBodyState(-1),
      (err: HttpDecodeError) => {
        assert.strictEqual(err.code, HttpDecodeErrorCode.INVALID_CONTENT_LENGTH);
        assert.match(err.message, /Invalid Content-Length/);
        return true;
      },
    );
  });

  it('应该拒绝非整数 contentLength', () => {
    assert.throws(
      () => createFixedLengthBodyState(10.5),
      (err: HttpDecodeError) => {
        assert.strictEqual(err.code, HttpDecodeErrorCode.INVALID_CONTENT_LENGTH);
        return true;
      },
    );
  });

  it('应该拒绝超过限制的 contentLength', () => {
    const limits = { maxBodySize: 100 };

    assert.throws(
      () => createFixedLengthBodyState(200, limits),
      (err: HttpDecodeError) => {
        assert.strictEqual(err.code, HttpDecodeErrorCode.CONTENT_LENGTH_TOO_LARGE);
        assert.match(err.message, /exceeds limit/);
        return true;
      },
    );
  });
});

describe('decodeFixedLengthBody', () => {
  it('应该正确解码完整的数据', () => {
    const state = createFixedLengthBodyState(10);
    const input = Buffer.from('1234567890');

    const result = decodeFixedLengthBody(state, input);

    assert.strictEqual(result.phase, FixedLengthBodyPhase.FINISHED);
    assert.strictEqual(result.remainingBytes, 0);
    assert.strictEqual(result.decodedBodyBytes, 10);
    assert.strictEqual(result.buffer.length, 0);
    assert.strictEqual(result.chunks.length, 1);
    assert.deepStrictEqual(result.chunks[0], input);
  });

  it('应该正确处理分块数据', () => {
    let state = createFixedLengthBodyState(15);

    // 第一块：5 字节
    state = decodeFixedLengthBody(state, Buffer.from('12345'));
    assert.strictEqual(state.phase, FixedLengthBodyPhase.DATA);
    assert.strictEqual(state.remainingBytes, 10);
    assert.strictEqual(state.decodedBodyBytes, 5);
    assert.strictEqual(state.chunks.length, 1);

    // 第二块：7 字节
    state = decodeFixedLengthBody(state, Buffer.from('abcdefg'));
    assert.strictEqual(state.phase, FixedLengthBodyPhase.DATA);
    assert.strictEqual(state.remainingBytes, 3);
    assert.strictEqual(state.decodedBodyBytes, 12);
    assert.strictEqual(state.chunks.length, 2);

    // 第三块：3 字节（完成）
    state = decodeFixedLengthBody(state, Buffer.from('xyz'));
    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
    assert.strictEqual(state.remainingBytes, 0);
    assert.strictEqual(state.decodedBodyBytes, 15);
    assert.strictEqual(state.chunks.length, 3);
  });

  it('应该正确处理超出预期长度的数据', () => {
    const state = createFixedLengthBodyState(5);
    const input = Buffer.from('1234567890'); // 10 字节，但只需要 5 字节

    const result = decodeFixedLengthBody(state, input);

    assert.strictEqual(result.phase, FixedLengthBodyPhase.FINISHED);
    assert.strictEqual(result.remainingBytes, 0);
    assert.strictEqual(result.decodedBodyBytes, 5);
    assert.strictEqual(result.chunks.length, 1);
    assert.deepStrictEqual(result.chunks[0], Buffer.from('12345'));
    assert.deepStrictEqual(result.buffer, Buffer.from('67890'));
  });

  it('应该正确处理空输入', () => {
    const state = createFixedLengthBodyState(10);
    const result = decodeFixedLengthBody(state, Buffer.alloc(0));

    // 应该返回相同的状态（引用相等）
    assert.strictEqual(result, state);
  });

  it('应该拒绝在 FINISHED 阶段继续解码', () => {
    let state = createFixedLengthBodyState(5);
    state = decodeFixedLengthBody(state, Buffer.from('12345'));

    assert.throws(
      () => decodeFixedLengthBody(state, Buffer.from('extra')),
      /already finished/,
    );
  });

  it('应该正确处理零长度 body', () => {
    const state = createFixedLengthBodyState(0);

    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
    assert.throws(
      () => decodeFixedLengthBody(state, Buffer.from('data')),
      /already finished/,
    );
  });

  it('应该保持 chunks 数组可变性（添加数据时创建新数组）', () => {
    const state = createFixedLengthBodyState(10);
    const originalChunks = state.chunks;

    assert.strictEqual(originalChunks.length, 0);
    const result = decodeFixedLengthBody(state, Buffer.from('12345'));

    assert.strictEqual(originalChunks.length, 1);
    assert.strictEqual(result.chunks.length, 1);
  });

  it('应该处理边界情况：恰好填满', () => {
    let state = createFixedLengthBodyState(10);

    // 添加 10 字节，恰好填满
    state = decodeFixedLengthBody(state, Buffer.from('1234567890'));

    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);
    assert.strictEqual(state.remainingBytes, 0);
    assert.strictEqual(state.decodedBodyBytes, 10);
  });

  it('应该正确累积多个 chunks', () => {
    let state = createFixedLengthBodyState(20);

    state = decodeFixedLengthBody(state, Buffer.from('chunk1'));
    state = decodeFixedLengthBody(state, Buffer.from('chunk2'));
    state = decodeFixedLengthBody(state, Buffer.from('chunk3'));
    state = decodeFixedLengthBody(state, Buffer.from('end111'));

    assert.strictEqual(state.chunks.length, 4);
    assert.strictEqual(state.decodedBodyBytes, 20);

    // 验证可以正确组合所有 chunks
    const combined = Buffer.concat(state.chunks);
    assert.strictEqual(combined.length, 20);
    assert.strictEqual(combined.toString(), 'chunk1chunk2chunk3en');
  });
});

describe('集成测试', () => {
  it('应该处理真实的 HTTP body 场景', () => {
    // 模拟接收 JSON payload
    const jsonData = JSON.stringify({ name: 'test', value: 123 });
    const contentLength = Buffer.byteLength(jsonData);

    let state = createFixedLengthBodyState(contentLength);

    // 模拟分块接收
    const chunk1 = Buffer.from(jsonData.slice(0, 10));
    const chunk2 = Buffer.from(jsonData.slice(10, 20));
    const chunk3 = Buffer.from(jsonData.slice(20));

    state = decodeFixedLengthBody(state, chunk1);
    state = decodeFixedLengthBody(state, chunk2);
    state = decodeFixedLengthBody(state, chunk3);

    assert.strictEqual(state.phase, FixedLengthBodyPhase.FINISHED);

    // 验证可以正确重建原始数据
    const reconstructed = Buffer.concat(state.chunks).toString();
    assert.strictEqual(reconstructed, jsonData);
    assert.deepStrictEqual(JSON.parse(reconstructed), { name: 'test', value: 123 });
  });
});
