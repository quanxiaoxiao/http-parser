import * as assert from 'node:assert';
import {
  describe, it, test,
} from 'node:test';

import {
  ChunkedBodyPhase,
  createChunkedBodyState,
  decodeChunkedBody,
} from './chunked-body.js';

describe('decodeChunkedBody - incremental parsing', () => {
  test('should handle data arriving in multiple buffers', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('5\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);

    state = decodeChunkedBody(state, Buffer.from('hello'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.CRLF);

    state = decodeChunkedBody(state, Buffer.from('\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks[0].toString(), 'hello');
  });

  test('should handle partial chunk size', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);

    state = decodeChunkedBody(state, Buffer.from('\r\nhelloworld\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks[0].toString(), 'helloworld');
  });

  test('should handle partial chunk data', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a\r\nhello'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);

    state = decodeChunkedBody(state, Buffer.from('world\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks[0].toString(), 'helloworld');
  });
});

describe('decodeChunkedBody - 分片接收数据', () => {
  it('应该处理分片接收的 chunk size', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('5'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);

    state = decodeChunkedBody(state, Buffer.from('\r\nhello\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks[0]?.toString(), 'hello');
  });

  it('应该处理分片接收的 chunk data', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a\r\nhello'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
    assert.strictEqual(state.remainingChunkBytes, 10);
    assert.strictEqual(state.buffer.toString(), 'hello');

    state = decodeChunkedBody(state, Buffer.from('world\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks[0]?.toString(), 'helloworld');
  });

  it('应该处理分片接收的 CRLF', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('5\r\nhello\r'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.CRLF);

    state = decodeChunkedBody(state, Buffer.from('\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
  });

  it('应该处理完整状态机转换', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('5\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);

    state = decodeChunkedBody(state, Buffer.from('hello'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.CRLF);

    state = decodeChunkedBody(state, Buffer.from('\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);

    state = decodeChunkedBody(state, Buffer.from('0\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.TRAILER);

    state = decodeChunkedBody(state, Buffer.from('\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
  });

  it('应该处理跨多次调用的 chunk data', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a\r\n01234'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
    assert.strictEqual(state.chunks.length, 0);

    state = decodeChunkedBody(state, Buffer.from('56789\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks[0].toString(), '0123456789');
  });
});

describe('ChunkedBodyDecoder - 处理分片数据', () => {
  it('应该解码单个简单的 chunk', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nHello\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.decodedBodyBytes, 5);
    assert.strictEqual(result.chunks.length, 1);
    assert.strictEqual(result.chunks[0].toString(), 'Hello');
  });

  it('应该解码多个 chunks', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nHello\r\n6\r\n World\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.decodedBodyBytes, 11);
    assert.strictEqual(result.chunks.length, 2);
    assert.strictEqual(result.chunks[0].toString(), 'Hello');
    assert.strictEqual(result.chunks[1].toString(), ' World');
  });

  it('应该处理分片数据', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('5\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
    assert.strictEqual(state.remainingChunkBytes, 5);

    state = decodeChunkedBody(state, Buffer.from('Hello\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);
    assert.strictEqual(state.chunks.length, 1);

    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
  });

  it('应该处理部分数据缓冲', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('5'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);

    state = decodeChunkedBody(state, Buffer.from('\r\nHello\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
  });

  it('应该处理 chunk data 跨越多次调用', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('A\r\n01234'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
    assert.strictEqual(state.chunks.length, 0);

    state = decodeChunkedBody(state, Buffer.from('56789\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks[0].toString(), '0123456789');
  });
});
