import * as assert from 'node:assert';
import {
  describe, it, test,
} from 'node:test';

import { HttpDecodeErrorCode } from '../errors.js';
import {
  ChunkedBodyPhase,
  createChunkedBodyState,
  decodeChunkedBody,
} from './chunked-body.js';

describe('decodeChunkedBody - trailer headers', () => {
  test('should parse trailer headers', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from(
      '5\r\nhello\r\n0\r\nX-Trailer: value\r\nAnother-Header: test\r\n\r\n',
    );

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.trailers['x-trailer'], 'value');
    assert.strictEqual(result.trailers['another-header'], 'test');
  });

  test('should handle trailer with colon in value', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nX-Header: value:with:colons\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.trailers['x-header'], 'value:with:colons');
  });

  test('should handle no trailer headers', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.deepStrictEqual(result.trailers, {});
  });

  test('should handle trailer headers arriving incrementally', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('0\r\nX-Trail'));

    state = decodeChunkedBody(state, Buffer.from('er: value\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.trailers['x-trailer'], 'value');
  });
});

describe('decodeChunkedBody - Trailer 处理', () => {
  it('应该解析trailer headers', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from(
      '5\r\nhello\r\n0\r\nX-Trailer: value\r\n\r\n',
    );
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.trailers['x-trailer'], 'value');
  });

  it('应该解析多个trailer headers', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from(
      '5\r\nhello\r\n0\r\n' +
      'X-Trailer-1: value1\r\n' +
      'X-Trailer-2: value2\r\n' +
      '\r\n',
    );
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.trailers['x-trailer-1'], 'value1');
    assert.strictEqual(result.trailers['x-trailer-2'], 'value2');
  });

  it('应该合并相同key的trailer headers', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from(
      '5\r\nhello\r\n0\r\n' +
      'X-Trailer: value1\r\n' +
      'X-Trailer: value2\r\n' +
      '\r\n',
    );
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.trailers['x-trailer'], 'value1, value2');
  });

  it('应该处理没有trailer的情况', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.deepStrictEqual(result.trailers, {});
  });

  it('应该在trailer header缺少冒号时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\nInvalidHeader\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在trailer header key为空时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n: value\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });
});

describe('decodeChunkedBody - Trailer Headers', () => {
  it('应该解析单个 trailer header', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\nX-Trailer: value\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.trailers['x-trailer'], 'value');
  });

  it('应该解析多个 trailer headers', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from(
      '5\r\nhello\r\n0\r\n' +
      'X-Trailer-1: value1\r\n' +
      'X-Trailer-2: value2\r\n' +
      '\r\n',
    );
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.trailers['x-trailer-1'], 'value1');
    assert.strictEqual(result.trailers['x-trailer-2'], 'value2');
  });

  it('应该合并相同名称的 trailer headers', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from(
      '0\r\n' +
      'Set-Cookie: cookie1\r\n' +
      'Set-Cookie: cookie2\r\n' +
      'Set-Cookie: cookie3\r\n' +
      '\r\n',
    );
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.trailers['set-cookie'], 'cookie1, cookie2, cookie3');
  });

  it('应该处理 header 值中的冒号', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nX-Header: value:with:colons\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.trailers['x-header'], 'value:with:colons');
  });

  it('应该处理带前后空格的 header 值', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nX-Header:   value with spaces   \r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.trailers['x-header'], 'value with spaces');
  });

  it('应该处理空 trailer 值', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nX-Empty:\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.trailers['x-empty'], '');
  });

  it('应该处理分片接收的 trailer', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('0\r\nX-Trail'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.TRAILER);

    state = decodeChunkedBody(state, Buffer.from('er: value\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.trailers['x-trailer'], 'value');
  });

  it('应该处理无 trailer 的情况', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.deepStrictEqual(result.trailers, {});
  });

  it('应该在 trailer header 缺少冒号时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nInvalidHeader\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在 trailer header key 为空时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\n: value\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该处理多行 trailer header 值（如果支持）', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nX-Long: value1\r\n good:value2\r\n\r\n');

    const result = decodeChunkedBody(state, input);
    assert.ok(result.trailers['x-long']);
  });
});

describe('decodeChunkedBody - 带认证信息的 trailer', () => {
  it('应该处理带认证信息的 trailer', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from(
      '5\r\nhello\r\n0\r\n' +
      'X-Checksum: abc123def456\r\n' +
      'X-Signature: RSA-SHA256-base64-encoded-signature\r\n' +
      '\r\n',
    );
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.trailers['x-checksum'], 'abc123def456');
    assert.ok(result.trailers['x-signature']);
  });
});
