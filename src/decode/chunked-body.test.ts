import * as assert from 'node:assert';
import { describe, it, test } from 'node:test';

import { DecodeHttpError } from '../errors.js';
import { ChunkedBodyPhase, createChunkedBodyState, decodeChunkedBody } from './chunked-body.js';

describe('createChunkedBodyState', () => {
  test('should create initial state with correct defaults', () => {
    const state = createChunkedBodyState();

    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.currentChunkSize, 0);
    assert.deepStrictEqual(state.bodyChunks, []);
    assert.deepStrictEqual(state.trailers, {});
  });
});

describe('decodeChunkedBody - basic functionality', () => {
  test('should parse a single chunk', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks.length, 1);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
  });

  test('should parse multiple chunks', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks.length, 2);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
    assert.strictEqual(result.bodyChunks[1].toString(), ' world');
  });

  test('should handle chunk with extension', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5;name=value\r\nhello\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
  });

  test('should handle empty chunk (size 0)', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks.length, 0);
  });
});

describe('decodeChunkedBody - incremental parsing', () => {
  test('should handle data arriving in multiple buffers', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('5\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);

    state = decodeChunkedBody(state, Buffer.from('hello'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.CRLF);

    state = decodeChunkedBody(state, Buffer.from('\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.bodyChunks[0].toString(), 'hello');
  });

  test('should handle partial chunk size', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);

    state = decodeChunkedBody(state, Buffer.from('\r\nhelloworld\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.bodyChunks[0].toString(), 'helloworld');
  });

  test('should handle partial chunk data', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a\r\nhello'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);

    state = decodeChunkedBody(state, Buffer.from('world\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.bodyChunks[0].toString(), 'helloworld');
  });
});

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

describe('decodeChunkedBody - hex parsing', () => {
  test('should parse lowercase hex', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('a\r\n0123456789\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks[0].toString(), '0123456789');
  });

  test('should parse uppercase hex', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('A\r\n0123456789\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks[0].toString(), '0123456789');
  });

  test('should parse mixed case hex', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('1A\r\n' + 'x'.repeat(26) + '\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks[0].length, 26);
  });

  test('should handle large chunk size', () => {
    const state = createChunkedBodyState();
    const data = 'x'.repeat(1000);
    const input = Buffer.from(`3e8\r\n${data}\r\n0\r\n\r\n`);

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks[0].length, 1000);
  });
});

describe('decodeChunkedBody - error handling', () => {
  test('should throw on invalid chunk size (non-hex)', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('xyz\r\nhello\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  test('should throw on negative chunk size', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('-5\r\nhello\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  test('should throw on missing CRLF after chunk data', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhelloXX');

    assert.throws(
      () => decodeChunkedBody(state, input),
      /Missing CRLF after chunk/,
    );
  });

  test('should throw when parsing after finished', () => {
    let state = createChunkedBodyState();
    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.throws(
      () => decodeChunkedBody(state, Buffer.from('5\r\nhello\r\n')),
      /already finished/,
    );
  });

  test('should throw on invalid trailer header format', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nInvalidHeader\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      /Invalid trailer header/,
    );
  });

  test('should throw on empty header name in trailer', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\n: value\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      /Invalid trailer header/,
    );
  });
});

describe('decodeChunkedBody - edge cases', () => {
  test('should handle empty input', () => {
    const state = createChunkedBodyState();
    const result = decodeChunkedBody(state, Buffer.from(''));

    assert.strictEqual(result.phase, ChunkedBodyPhase.SIZE);
  });

  test('should handle whitespace in chunk size with extension', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5  ;  ext=value  \r\nhello\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
  });

  test('should handle binary data in chunks', () => {
    const state = createChunkedBodyState();
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    const input = Buffer.concat([
      Buffer.from('5\r\n'),
      binaryData,
      Buffer.from('\r\n0\r\n\r\n'),
    ]);

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.deepStrictEqual(result.bodyChunks[0], binaryData);
  });

  test('should preserve multiple body chunks separately', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('3\r\nabc\r\n3\r\ndef\r\n3\r\nghi\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks.length, 3);
    assert.strictEqual(result.bodyChunks[0].toString(), 'abc');
    assert.strictEqual(result.bodyChunks[1].toString(), 'def');
    assert.strictEqual(result.bodyChunks[2].toString(), 'ghi');
  });

  test('should handle chunk size of exactly 1 byte', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('1\r\nx\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks[0].toString(), 'x');
  });
});

describe('decodeChunkedBody - real-world scenarios', () => {
  test('should handle streaming JSON response', () => {
    let state = createChunkedBodyState();

    const chunk1 = '{"users":[';
    const chunk2 = '{"id":1,"name":"Alice"},';
    const chunk3 = '{"id":2,"name":"Bob"}';
    const chunk4 = ']}';

    state = decodeChunkedBody(state, Buffer.from(`${chunk1.length.toString(16)}\r\n${chunk1}\r\n`));
    state = decodeChunkedBody(state, Buffer.from(`${chunk2.length.toString(16)}\r\n${chunk2}\r\n`));
    state = decodeChunkedBody(state, Buffer.from(`${chunk3.length.toString(16)}\r\n${chunk3}\r\n`));
    state = decodeChunkedBody(state, Buffer.from(`${chunk4.length.toString(16)}\r\n${chunk4}\r\n`));
    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);

    const fullBody = Buffer.concat(state.bodyChunks).toString();
    const json = JSON.parse(fullBody);
    assert.strictEqual(json.users.length, 2);
    assert.strictEqual(json.users[0].name, 'Alice');
  });
});

describe('createChunkedBodyState', () => {
  it('应该创建初始状态', () => {
    const state = createChunkedBodyState();
    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.currentChunkSize, 0);
    assert.strictEqual(state.bodyChunks.length, 0);
    assert.deepStrictEqual(state.trailers, {});
  });
});

describe('decodeChunkedBody', () => {
  describe('基本功能', () => {
    it('应该解析单个chunk', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.bodyChunks.length, 1);
      assert.strictEqual(result.bodyChunks[0]?.toString(), 'hello');
    });

    it('应该解析多个chunks', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.bodyChunks.length, 2);
      assert.strictEqual(result.bodyChunks[0]?.toString(), 'hello');
      assert.strictEqual(result.bodyChunks[1]?.toString(), ' world');
    });

    it('应该处理分块接收的数据', () => {
      let state = createChunkedBodyState();

      // 第一块：chunk size
      state = decodeChunkedBody(state, Buffer.from('5\r\n'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
      assert.strictEqual(state.currentChunkSize, 5);

      // 第二块：chunk data
      state = decodeChunkedBody(state, Buffer.from('hello\r\n'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);
      assert.strictEqual(state.bodyChunks[0]?.toString(), 'hello');

      // 第三块：结束
      state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    });
  });

  describe('chunk size 解析', () => {
    it('应该解析十六进制chunk size', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('a\r\n0123456789\r\n0\r\n\r\n');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.bodyChunks[0]?.length, 10);
    });

    it('应该解析带扩展的chunk size', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5;name=value\r\nhello\r\n0\r\n\r\n');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.bodyChunks[0]?.toString(), 'hello');
    });

    it('应该处理大写十六进制', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('A\r\n0123456789\r\n0\r\n\r\n');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.bodyChunks[0]?.length, 10);
    });

    it('应该在chunk size为空时抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('\r\nhello\r\n0\r\n\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
        (err: Error) => {
          return err instanceof DecodeHttpError &&
                 err.message.includes('Empty chunk size line');
        },
      );
    });

    it('应该在chunk size无效时抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('xyz\r\nhello\r\n0\r\n\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
      );
    });

    it('应该在chunk size为负数时抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('-5\r\nhello\r\n0\r\n\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
      );
    });
  });

  describe('CRLF 验证', () => {
    it('应该在chunk data后缺少CRLF时抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhelloXX0\r\n\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
        (err: Error) => {
          return err instanceof DecodeHttpError &&
                 err.message.includes('Missing CRLF after chunk data');
        },
      );
    });
  });

  describe('Trailer 处理', () => {
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
        (err: Error) => {
          return err instanceof DecodeHttpError &&
                 err.message.includes('missing colon');
        },
      );
    });

    it('应该在trailer header key为空时抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n0\r\n: value\r\n\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
        (err: Error) => {
          return err instanceof DecodeHttpError &&
                 err.message.includes('Invalid trailer header');
        },
      );
    });
  });

  describe('边界情况', () => {
    it('应该处理空chunk (size 0)', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('0\r\n\r\n');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.bodyChunks.length, 0);
    });

    it('应该在已完成的状态下抛出错误', () => {
      let state = createChunkedBodyState();
      state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

      assert.throws(
        () => decodeChunkedBody(state, Buffer.from('5\r\nhello\r\n')),
        (err: Error) => {
          return err.message.includes('already finished');
        },
      );
    });

    it('应该处理部分接收的chunk size', () => {
      const state = createChunkedBodyState();
      const result = decodeChunkedBody(state, Buffer.from('5'));

      assert.strictEqual(result.phase, ChunkedBodyPhase.SIZE);
    });

    it('应该处理部分接收的chunk data', () => {
      let state = createChunkedBodyState();
      state = decodeChunkedBody(state, Buffer.from('5\r\nhel'));

      assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
      assert.strictEqual(state.currentChunkSize, 5);
      assert.strictEqual(state.buffer.toString(), 'hel');
    });

    it('应该保留未处理的buffer数据', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n0\r\n\r\nextra data');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.buffer.toString(), 'extra data');
    });

    it('应该保留未处理的buffer数据, 有trailer的情况', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n0\r\nname:xxx\r\n\r\nextra data');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.buffer.toString(), 'extra data');
      assert.strictEqual(result.trailers.name, 'xxx');
    });
  });

  describe('状态机转换', () => {
    it('应该正确转换状态: SIZE -> DATA -> CRLF -> SIZE -> TRAILER', () => {
      let state = createChunkedBodyState();
      assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);

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
  });
});

describe('ChunkedBodyDecoder', () => {
  describe('createChunkedBodyState', () => {
    it('应该创建初始状态', () => {
      const state = createChunkedBodyState();

      assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);
      assert.strictEqual(state.buffer.length, 0);
      assert.strictEqual(state.decodedBodyBytes, 0);
      assert.strictEqual(state.currentChunkSize, 0);
      assert.deepStrictEqual(state.bodyChunks, []);
      assert.deepStrictEqual(state.trailers, {});
    });
  });

  describe('decodeChunkedBody', () => {
    it('应该解码单个简单的 chunk', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nHello\r\n0\r\n\r\n');

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.decodedBodyBytes, 5);
      assert.strictEqual(result.bodyChunks.length, 1);
      assert.strictEqual(result.bodyChunks[0].toString(), 'Hello');
    });

    it('应该解码多个 chunks', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nHello\r\n6\r\n World\r\n0\r\n\r\n');

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.decodedBodyBytes, 11);
      assert.strictEqual(result.bodyChunks.length, 2);
      assert.strictEqual(result.bodyChunks[0].toString(), 'Hello');
      assert.strictEqual(result.bodyChunks[1].toString(), ' World');
    });

    it('应该处理分片数据', () => {
      let state = createChunkedBodyState();

      // 第一片：chunk size
      state = decodeChunkedBody(state, Buffer.from('5\r\n'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
      assert.strictEqual(state.currentChunkSize, 5);

      // 第二片：chunk data
      state = decodeChunkedBody(state, Buffer.from('Hello\r\n'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);
      assert.strictEqual(state.bodyChunks.length, 1);

      // 第三片：终止 chunk
      state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    });

    it('应该处理部分数据缓冲', () => {
      let state = createChunkedBodyState();

      // 只发送 chunk size 的一部分
      state = decodeChunkedBody(state, Buffer.from('5'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);

      // 发送剩余部分
      state = decodeChunkedBody(state, Buffer.from('\r\nHello\r\n0\r\n\r\n'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    });

    it('应该解析带扩展的 chunk size', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5;name=value\r\nHello\r\n0\r\n\r\n');

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.bodyChunks[0].toString(), 'Hello');
    });

    it('应该解析 trailer headers', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from(
        '5\r\nHello\r\n0\r\nX-Trailer: value\r\nX-Custom: test\r\n\r\n',
      );

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.trailers['x-trailer'], 'value');
      assert.strictEqual(result.trailers['x-custom'], 'test');
    });

    it('应该合并相同名称的 trailer headers', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from(
        '0\r\nSet-Cookie: cookie1\r\nSet-Cookie: cookie2\r\n\r\n',
      );

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.trailers['set-cookie'], 'cookie1, cookie2');
    });

    it('应该处理大写的十六进制 chunk size', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('A\r\n0123456789\r\n0\r\n\r\n');

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.decodedBodyBytes, 10);
      assert.strictEqual(result.bodyChunks[0].toString(), '0123456789');
    });

    it('应该处理混合大小写的十六进制', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('aB\r\n' + 'x'.repeat(171) + '\r\n0\r\n\r\n');

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.decodedBodyBytes, 171); // 0xAB = 171
    });

    it('应该在已完成的状态上抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('0\r\n\r\n');

      const result = decodeChunkedBody(state, input);
      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);

      assert.throws(
        () => decodeChunkedBody(result, Buffer.from('5\r\n')),
      );
    });

    it('应该在无效的 chunk size 时抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('invalid\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
        DecodeHttpError,
      );
    });

    it('应该在空 chunk size 时抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
        DecodeHttpError,
      );
    });

    it('应该在缺少 CRLF 时抛出错误', () => {
      const state = createChunkedBodyState();
      const result = decodeChunkedBody(state, Buffer.from('5\r\nHello'));

      // 继续发送数据但没有 CRLF
      assert.throws(
        () => decodeChunkedBody(result, Buffer.from('XX')),
        DecodeHttpError,
      );
    });

    it('应该处理零长度 chunk（无数据）', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('0\r\n\r\n');

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.decodedBodyBytes, 0);
      assert.strictEqual(result.bodyChunks.length, 0);
    });

    it('应该处理无 trailer 的终止 chunk', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nHello\r\n0\r\n\r\n');

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.deepStrictEqual(result.trailers, {});
    });

    it('应该在无效的 trailer header 格式时抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('0\r\nInvalidHeader\r\n\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
        DecodeHttpError,
      );
    });

    it('应该处理带空格的 trailer header 值', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from(
        '0\r\nX-Header:   value with spaces   \r\n\r\n',
      );

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.trailers['x-header'], 'value with spaces');
    });

    it('应该处理非常大的 chunk', () => {
      const state = createChunkedBodyState();
      const size = 10000;
      const data = 'x'.repeat(size);
      const input = Buffer.from(`${size.toString(16)}\r\n${data}\r\n0\r\n\r\n`);

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.decodedBodyBytes, size);
      assert.strictEqual(result.bodyChunks[0].length, size);
    });

    it('应该累计多个 chunk 的总大小', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from(
        '3\r\nabc\r\n4\r\ndefg\r\n2\r\nhi\r\n0\r\n\r\n',
      );

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.decodedBodyBytes, 9); // 3 + 4 + 2
      assert.strictEqual(result.bodyChunks.length, 3);
    });

    it('应该保持二进制数据的完整性', () => {
      const state = createChunkedBodyState();
      const binaryData = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01]);
      const input = Buffer.concat([
        Buffer.from('5\r\n'),
        binaryData,
        Buffer.from('\r\n0\r\n\r\n'),
      ]);

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.deepStrictEqual(result.bodyChunks[0], binaryData);
    });

    it('应该处理 chunk data 跨越多次调用', () => {
      let state = createChunkedBodyState();

      state = decodeChunkedBody(state, Buffer.from('A\r\n01234'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
      assert.strictEqual(state.bodyChunks.length, 0);

      state = decodeChunkedBody(state, Buffer.from('56789\r\n0\r\n\r\n'));
      assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(state.bodyChunks[0].toString(), '0123456789');
    });
  });

  describe('边界条件', () => {
    it('应该处理最小有效 chunk (1 字节)', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('1\r\nA\r\n0\r\n\r\n');

      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(result.bodyChunks[0].toString(), 'A');
    });

    it('应该处理空 buffer 输入', () => {
      const state = createChunkedBodyState();

      const result = decodeChunkedBody(state, Buffer.alloc(0));

      assert.strictEqual(result.phase, ChunkedBodyPhase.SIZE);
    });

    it('应该在负数 chunk size 时抛出错误', () => {
      const state = createChunkedBodyState();
      // -1 的十六进制补码表示
      const input = Buffer.from('-1\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
        DecodeHttpError,
      );
    });
  });

  describe('性能和内存', () => {
    it('应该高效处理多个小 chunks', () => {
      let state = createChunkedBodyState();

      // 100 个小 chunks
      for (let i = 0; i < 100; i++) {
        state = decodeChunkedBody(state, Buffer.from('1\r\nX\r\n'));
      }

      state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

      assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
      assert.strictEqual(state.bodyChunks.length, 100);
      assert.strictEqual(state.decodedBodyBytes, 100);
    });
  });
});

describe('createChunkedBodyState', () => {
  it('应该创建初始状态', () => {
    const state = createChunkedBodyState();

    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.decodedBodyBytes, 0);
    assert.strictEqual(state.currentChunkSize, 0);
    assert.deepStrictEqual(state.bodyChunks, []);
    assert.deepStrictEqual(state.trailers, {});
  });
});

describe('decodeChunkedBody - 基本功能', () => {
  it('应该解析单个 chunk', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.decodedBodyBytes, 5);
    assert.strictEqual(result.bodyChunks.length, 1);
    assert.strictEqual(result.bodyChunks[0]?.toString(), 'hello');
  });

  it('应该解析多个 chunks', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.decodedBodyBytes, 11);
    assert.strictEqual(result.bodyChunks.length, 2);
    assert.strictEqual(result.bodyChunks[0]?.toString(), 'hello');
    assert.strictEqual(result.bodyChunks[1]?.toString(), ' world');
  });

  it('应该处理零长度 chunk', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.decodedBodyBytes, 0);
    assert.strictEqual(result.bodyChunks.length, 0);
  });

  it('应该累计多个 chunk 的总大小', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('3\r\nabc\r\n4\r\ndefg\r\n2\r\nhi\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.decodedBodyBytes, 9);
    assert.strictEqual(result.bodyChunks.length, 3);
  });

  it('应该保持各个 chunk 独立', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('3\r\nabc\r\n3\r\ndef\r\n3\r\nghi\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.bodyChunks.length, 3);
    assert.strictEqual(result.bodyChunks[0].toString(), 'abc');
    assert.strictEqual(result.bodyChunks[1].toString(), 'def');
    assert.strictEqual(result.bodyChunks[2].toString(), 'ghi');
  });
});

describe('decodeChunkedBody - 分片接收数据', () => {
  it('应该处理分片接收的 chunk size', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('5'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);

    state = decodeChunkedBody(state, Buffer.from('\r\nhello\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.bodyChunks[0]?.toString(), 'hello');
  });

  it('应该处理分片接收的 chunk data', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a\r\nhello'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
    assert.strictEqual(state.currentChunkSize, 10);
    assert.strictEqual(state.buffer.toString(), 'hello');

    state = decodeChunkedBody(state, Buffer.from('world\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.bodyChunks[0]?.toString(), 'helloworld');
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

    // SIZE -> DATA
    state = decodeChunkedBody(state, Buffer.from('5\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);

    // DATA -> CRLF
    state = decodeChunkedBody(state, Buffer.from('hello'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.CRLF);

    // CRLF -> SIZE
    state = decodeChunkedBody(state, Buffer.from('\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.SIZE);

    // SIZE -> TRAILER (last chunk)
    state = decodeChunkedBody(state, Buffer.from('0\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.TRAILER);

    // TRAILER -> finished
    state = decodeChunkedBody(state, Buffer.from('\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
  });

  it('应该处理跨多次调用的 chunk data', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a\r\n01234'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
    assert.strictEqual(state.bodyChunks.length, 0);

    state = decodeChunkedBody(state, Buffer.from('56789\r\n0\r\n\r\n'));
    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.bodyChunks[0].toString(), '0123456789');
  });
});

describe('decodeChunkedBody - Chunk Size 解析', () => {
  it('应该解析小写十六进制', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('a\r\n0123456789\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.bodyChunks[0]?.length, 10);
  });

  it('应该解析大写十六进制', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('A\r\n0123456789\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.bodyChunks[0]?.length, 10);
  });

  it('应该解析混合大小写十六进制', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('aB\r\n' + 'x'.repeat(171) + '\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.decodedBodyBytes, 171); // 0xAB = 171
  });

  it('应该处理大型 chunk', () => {
    const state = createChunkedBodyState();
    const size = 10000;
    const data = 'x'.repeat(size);
    const input = Buffer.from(`${size.toString(16)}\r\n${data}\r\n0\r\n\r\n`);
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.decodedBodyBytes, size);
  });

  it('应该解析带扩展的 chunk size', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5;name=value\r\nhello\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.bodyChunks[0]?.toString(), 'hello');
  });

  it('应该处理带空格和多个扩展的 chunk size', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5  ;  ext1=val1  ;  ext2=val2  \r\nhello\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.bodyChunks[0]?.toString(), 'hello');
  });

  it('应该在空 chunk size 时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('\r\nhello\r\n0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      (err: Error) => {
        return err instanceof DecodeHttpError &&
               err.message.includes('Empty chunk size line');
      },
    );
  });

  it('应该在无效的十六进制字符时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('xyz\r\nhello\r\n0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      DecodeHttpError,
    );
  });

  it('应该在负数 chunk size 时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('-5\r\nhello\r\n0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      DecodeHttpError,
    );
  });

  it('应该在超大 chunk size 时能够处理', () => {
    const state = createChunkedBodyState();
    // 测试 0xFFFFFF (16777215 字节)
    const input = Buffer.from('ffffff\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.DATA);
    assert.strictEqual(result.currentChunkSize, 16777215);
  });
});

describe('decodeChunkedBody - CRLF 验证', () => {
  it('应该在 chunk data 后缺少 CRLF 时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhelloXX0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      (err: Error) => {
        return err instanceof DecodeHttpError &&
               err.message.includes('Missing CRLF after chunk data');
      },
    );
  });

  it('应该在只有 CR 没有 LF 时抛出错误', () => {
    const state = createChunkedBodyState();
    const result = decodeChunkedBody(state, Buffer.from('5\r\nhello\r'));

    assert.throws(
      () => decodeChunkedBody(result, Buffer.from('X')),
      (err: Error) => {
        return err instanceof DecodeHttpError &&
               err.message.includes('Missing CRLF');
      },
    );
  });

  it('应该正确处理包含 \\r 或 \\n 的数据', () => {
    const state = createChunkedBodyState();
    const data = 'line1\rline2\nline3\r\n';
    const input = Buffer.from(`${data.length.toString(16)}\r\n${data}\r\n0\r\n\r\n`);
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks[0]?.toString(), data);
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
      (err: Error) => {
        return err instanceof DecodeHttpError &&
               err.message.includes('missing colon');
      },
    );
  });

  it('应该在 trailer header key 为空时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\n: value\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      (err: Error) => {
        return err instanceof DecodeHttpError &&
               err.message.includes('Invalid trailer header');
      },
    );
  });

  it('应该处理多行 trailer header 值（如果支持）', () => {
    // HTTP/1.1 允许折叠的 header，但现代实现通常不支持
    // 这个测试用于确认行为
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nX-Long: value1\r\n value2\r\n\r\n');

    // 期望抛出错误或正确处理，取决于实现
    try {
      const result = decodeChunkedBody(state, input);
      // 如果支持折叠，检查结果
      assert.ok(result.trailers['x-long']);
    } catch (err) {
      // 如果不支持，应该抛出错误
      assert.ok(err instanceof DecodeHttpError);
    }
  });
});

describe('decodeChunkedBody - 二进制数据处理', () => {
  it('应该保持二进制数据的完整性', () => {
    const state = createChunkedBodyState();
    const binaryData = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01, 0xfe]);
    const input = Buffer.concat([
      Buffer.from('6\r\n'),
      binaryData,
      Buffer.from('\r\n0\r\n\r\n'),
    ]);
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.deepStrictEqual(result.bodyChunks[0], binaryData);
  });

  it('应该处理包含空字节的数据', () => {
    const state = createChunkedBodyState();
    const data = Buffer.from([0x48, 0x00, 0x69, 0x00]); // "H\0i\0"
    const input = Buffer.concat([
      Buffer.from('4\r\n'),
      data,
      Buffer.from('\r\n0\r\n\r\n'),
    ]);
    const result = decodeChunkedBody(state, input);

    assert.deepStrictEqual(result.bodyChunks[0], data);
  });

  it('应该处理全零数据', () => {
    const state = createChunkedBodyState();
    const data = Buffer.alloc(10, 0);
    const input = Buffer.concat([
      Buffer.from('a\r\n'),
      data,
      Buffer.from('\r\n0\r\n\r\n'),
    ]);
    const result = decodeChunkedBody(state, input);

    assert.deepStrictEqual(result.bodyChunks[0], data);
  });
});

describe('decodeChunkedBody - 边界情况', () => {
  it('应该处理最小有效 chunk (1 字节)', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('1\r\nA\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.bodyChunks[0].toString(), 'A');
  });

  it('应该处理空 buffer 输入', () => {
    const state = createChunkedBodyState();
    const result = decodeChunkedBody(state, Buffer.alloc(0));

    assert.strictEqual(result.phase, ChunkedBodyPhase.SIZE);
  });

  it('应该在已完成的状态上抛出错误', () => {
    let state = createChunkedBodyState();
    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.throws(
      () => decodeChunkedBody(state, Buffer.from('5\r\nhello\r\n')),
      (err: Error) => {
        return err.message.includes('already finished');
      },
    );
  });

  it('应该保留未处理的 buffer 数据（无 trailer）', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\nextra data');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.buffer.toString(), 'extra data');
  });

  it('应该保留未处理的 buffer 数据（有 trailer）', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\nX-Name: value\r\n\r\nextra data');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.buffer.toString(), 'extra data');
    assert.strictEqual(result.trailers['x-name'], 'value');
  });

  it('应该处理只有 chunk size 没有 CRLF 的情况', () => {
    const state = createChunkedBodyState();
    const result = decodeChunkedBody(state, Buffer.from('5'));

    assert.strictEqual(result.phase, ChunkedBodyPhase.SIZE);
    assert.strictEqual(result.buffer.toString(), '5');
  });

  it('应该处理只有部分 chunk data 的情况', () => {
    let state = createChunkedBodyState();
    state = decodeChunkedBody(state, Buffer.from('5\r\nhel'));

    assert.strictEqual(state.phase, ChunkedBodyPhase.DATA);
    assert.strictEqual(state.currentChunkSize, 5);
    assert.strictEqual(state.buffer.toString(), 'hel');
  });
});

describe('decodeChunkedBody - 性能和压力测试', () => {
  it('应该高效处理多个小 chunks', () => {
    let state = createChunkedBodyState();

    for (let i = 0; i < 100; i++) {
      state = decodeChunkedBody(state, Buffer.from('1\r\nX\r\n'));
    }

    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.bodyChunks.length, 100);
    assert.strictEqual(state.decodedBodyBytes, 100);
  });

  it('应该处理极多的 trailer headers', () => {
    const state = createChunkedBodyState();
    let trailerStr = '0\r\n';

    for (let i = 0; i < 50; i++) {
      trailerStr += `X-Header-${i}: value${i}\r\n`;
    }
    trailerStr += '\r\n';

    const result = decodeChunkedBody(state, Buffer.from(trailerStr));

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(Object.keys(result.trailers).length, 50);
  });

  it('应该处理超长的 header 值', () => {
    const state = createChunkedBodyState();
    const longValue = 'x'.repeat(10000);
    const input = Buffer.from(`0\r\nX-Long: ${longValue}\r\n\r\n`);
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.trailers['x-long'], longValue);
  });
});

describe('decodeChunkedBody - 真实场景模拟', () => {
  it('应该处理流式 JSON 响应', () => {
    let state = createChunkedBodyState();

    const chunks = [
      '{"users":[',
      '{"id":1,"name":"Alice"},',
      '{"id":2,"name":"Bob"}',
      ']}',
    ];

    for (const chunk of chunks) {
      const hex = chunk.length.toString(16);
      state = decodeChunkedBody(state, Buffer.from(`${hex}\r\n${chunk}\r\n`));
    }

    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);

    const fullBody = Buffer.concat(state.bodyChunks).toString();
    const json = JSON.parse(fullBody);
    assert.strictEqual(json.users.length, 2);
    assert.strictEqual(json.users[0].name, 'Alice');
  });

  it('应该处理图片数据传输', () => {
    let state = createChunkedBodyState();

    // 模拟图片数据分块传输
    const chunk1 = Buffer.alloc(1024, 0xff);
    const chunk2 = Buffer.alloc(1024, 0xaa);
    const chunk3 = Buffer.alloc(512, 0x55);

    state = decodeChunkedBody(state, Buffer.concat([
      Buffer.from('400\r\n'),
      chunk1,
      Buffer.from('\r\n'),
    ]));

    state = decodeChunkedBody(state, Buffer.concat([
      Buffer.from('400\r\n'),
      chunk2,
      Buffer.from('\r\n'),
    ]));

    state = decodeChunkedBody(state, Buffer.concat([
      Buffer.from('200\r\n'),
      chunk3,
      Buffer.from('\r\n0\r\n\r\n'),
    ]));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.decodedBodyBytes, 2560);
  });

  it('应该处理 SSE (Server-Sent Events) 格式', () => {
    let state = createChunkedBodyState();

    const events = [
      'data: message 1\n\n',
      'data: message 2\n\n',
      'data: message 3\n\n',
    ];

    for (const event of events) {
      const hex = event.length.toString(16);
      state = decodeChunkedBody(state, Buffer.from(`${hex}\r\n${event}\r\n`));
    }

    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.bodyChunks.length, 3);
  });

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
