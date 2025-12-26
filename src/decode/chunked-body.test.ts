import * as assert from 'node:assert';
import { describe, it, test } from 'node:test';

import { DecodeHttpError } from '../errors.js';
import { createChunkedBodyState, decodeChunkedBody } from './chunked-body.js';

describe('createChunkedBodyState', () => {
  test('should create initial state with correct defaults', () => {
    const state = createChunkedBodyState();

    assert.strictEqual(state.phase, 'SIZE');
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.currentChunkSize, 0);
    assert.deepStrictEqual(state.bodyChunks, []);
    assert.deepStrictEqual(state.trailers, {});
    assert.strictEqual(state.finished, false);
  });
});

describe('decodeChunkedBody - basic functionality', () => {
  test('should parse a single chunk', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks.length, 1);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
  });

  test('should parse multiple chunks', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks.length, 2);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
    assert.strictEqual(result.bodyChunks[1].toString(), ' world');
  });

  test('should handle chunk with extension', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5;name=value\r\nhello\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
  });

  test('should handle empty chunk (size 0)', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks.length, 0);
  });
});

describe('decodeChunkedBody - incremental parsing', () => {
  test('should handle data arriving in multiple buffers', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('5\r\n'));
    assert.strictEqual(state.phase, 'DATA');
    assert.strictEqual(state.finished, false);

    state = decodeChunkedBody(state, Buffer.from('hello'));
    assert.strictEqual(state.phase, 'CRLF');

    state = decodeChunkedBody(state, Buffer.from('\r\n0\r\n\r\n'));
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.bodyChunks[0].toString(), 'hello');
  });

  test('should handle partial chunk size', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a'));
    assert.strictEqual(state.phase, 'SIZE');
    assert.strictEqual(state.finished, false);

    state = decodeChunkedBody(state, Buffer.from('\r\nhelloworld\r\n0\r\n\r\n'));
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.bodyChunks[0].toString(), 'helloworld');
  });

  test('should handle partial chunk data', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('a\r\nhello'));
    assert.strictEqual(state.phase, 'DATA');

    state = decodeChunkedBody(state, Buffer.from('world\r\n0\r\n\r\n'));
    assert.strictEqual(state.finished, true);
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

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.trailers['x-trailer'], 'value');
    assert.strictEqual(result.trailers['another-header'], 'test');
  });

  test('should handle trailer with colon in value', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nX-Header: value:with:colons\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.trailers['x-header'], 'value:with:colons');
  });

  test('should handle no trailer headers', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.deepStrictEqual(result.trailers, {});
  });

  test('should handle trailer headers arriving incrementally', () => {
    let state = createChunkedBodyState();

    state = decodeChunkedBody(state, Buffer.from('0\r\nX-Trail'));
    assert.strictEqual(state.finished, false);

    state = decodeChunkedBody(state, Buffer.from('er: value\r\n\r\n'));
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.trailers['x-trailer'], 'value');
  });
});

describe('decodeChunkedBody - hex parsing', () => {
  test('should parse lowercase hex', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('a\r\n0123456789\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].toString(), '0123456789');
  });

  test('should parse uppercase hex', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('A\r\n0123456789\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].toString(), '0123456789');
  });

  test('should parse mixed case hex', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('1A\r\n' + 'x'.repeat(26) + '\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].length, 26);
  });

  test('should handle large chunk size', () => {
    const state = createChunkedBodyState();
    const data = 'x'.repeat(1000);
    const input = Buffer.from(`3e8\r\n${data}\r\n0\r\n\r\n`);

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].length, 1000);
  });
});

describe('decodeChunkedBody - error handling', () => {
  test('should throw on invalid chunk size (non-hex)', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('xyz\r\nhello\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      /Invalid hexadecimal chunk size/,
    );
  });

  test('should throw on negative chunk size', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('-5\r\nhello\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      /Negative chunk size not allowed/,
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

    assert.strictEqual(result.finished, false);
    assert.strictEqual(result.phase, 'SIZE');
  });

  test('should handle whitespace in chunk size with extension', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5  ;  ext=value  \r\nhello\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
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

    assert.strictEqual(result.finished, true);
    assert.deepStrictEqual(result.bodyChunks[0], binaryData);
  });

  test('should preserve multiple body chunks separately', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('3\r\nabc\r\n3\r\ndef\r\n3\r\nghi\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks.length, 3);
    assert.strictEqual(result.bodyChunks[0].toString(), 'abc');
    assert.strictEqual(result.bodyChunks[1].toString(), 'def');
    assert.strictEqual(result.bodyChunks[2].toString(), 'ghi');
  });

  test('should handle chunk size of exactly 1 byte', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('1\r\nx\r\n0\r\n\r\n');

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.finished, true);
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

    assert.strictEqual(state.finished, true);

    const fullBody = Buffer.concat(state.bodyChunks).toString();
    const json = JSON.parse(fullBody);
    assert.strictEqual(json.users.length, 2);
    assert.strictEqual(json.users[0].name, 'Alice');
  });
});

describe('createChunkedBodyState', () => {
  it('应该创建初始状态', () => {
    const state = createChunkedBodyState();
    assert.strictEqual(state.phase, 'SIZE');
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.currentChunkSize, 0);
    assert.strictEqual(state.bodyChunks.length, 0);
    assert.deepStrictEqual(state.trailers, {});
    assert.strictEqual(state.finished, false);
  });
});

describe('decodeChunkedBody', () => {
  describe('基本功能', () => {
    it('应该解析单个chunk', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.bodyChunks.length, 1);
      assert.strictEqual(result.bodyChunks[0]?.toString(), 'hello');
    });

    it('应该解析多个chunks', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.bodyChunks.length, 2);
      assert.strictEqual(result.bodyChunks[0]?.toString(), 'hello');
      assert.strictEqual(result.bodyChunks[1]?.toString(), ' world');
    });

    it('应该处理分块接收的数据', () => {
      let state = createChunkedBodyState();

      // 第一块：chunk size
      state = decodeChunkedBody(state, Buffer.from('5\r\n'));
      assert.strictEqual(state.phase, 'DATA');
      assert.strictEqual(state.currentChunkSize, 5);

      // 第二块：chunk data
      state = decodeChunkedBody(state, Buffer.from('hello\r\n'));
      assert.strictEqual(state.phase, 'SIZE');
      assert.strictEqual(state.bodyChunks[0]?.toString(), 'hello');

      // 第三块：结束
      state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));
      assert.strictEqual(state.finished, true);
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
        (err: Error) => {
          return err instanceof DecodeHttpError &&
                 err.message.includes('Invalid hexadecimal chunk size');
        },
      );
    });

    it('应该在chunk size为负数时抛出错误', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('-5\r\nhello\r\n0\r\n\r\n');

      assert.throws(
        () => decodeChunkedBody(state, input),
        (err: Error) => {
          return err instanceof DecodeHttpError &&
                 err.message.includes('Negative chunk size');
        },
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

      assert.strictEqual(result.finished, true);
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

      assert.strictEqual(result.finished, true);
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

  describe('onChunk 回调', () => {
    it('应该在解析chunk时调用onChunk回调', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');
      const chunks: Buffer[] = [];

      const result = decodeChunkedBody(state, input, (chunk) => {
        chunks.push(chunk);
      });

      assert.strictEqual(chunks.length, 1);
      assert.strictEqual(chunks[0]?.toString(), 'hello');
      assert.strictEqual(result.bodyChunks.length, 0);
    });

    it('应该对多个chunks调用onChunk回调', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n');
      const chunks: Buffer[] = [];

      decodeChunkedBody(state, input, (chunk) => {
        chunks.push(chunk);
      });

      assert.strictEqual(chunks.length, 2);
      assert.strictEqual(chunks[0]?.toString(), 'hello');
      assert.strictEqual(chunks[1]?.toString(), ' world');
    });
  });

  describe('边界情况', () => {
    it('应该处理空chunk (size 0)', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('0\r\n\r\n');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.bodyChunks.length, 0);
    });

    it('应该在已完成的状态下抛出错误', () => {
      let state = createChunkedBodyState();
      state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

      assert.throws(
        () => decodeChunkedBody(state, Buffer.from('5\r\nhello\r\n')),
        (err: Error) => {
          return err instanceof DecodeHttpError &&
                 err.message.includes('already finished');
        },
      );
    });

    it('应该处理部分接收的chunk size', () => {
      const state = createChunkedBodyState();
      const result = decodeChunkedBody(state, Buffer.from('5'));

      assert.strictEqual(result.phase, 'SIZE');
      assert.strictEqual(result.finished, false);
    });

    it('应该处理部分接收的chunk data', () => {
      let state = createChunkedBodyState();
      state = decodeChunkedBody(state, Buffer.from('5\r\nhel'));

      assert.strictEqual(state.phase, 'DATA');
      assert.strictEqual(state.currentChunkSize, 5);
      assert.strictEqual(state.buffer.toString(), 'hel');
    });

    it('应该保留未处理的buffer数据', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n0\r\n\r\nextra data');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.buffer.toString(), 'extra data');
    });

    it('应该保留未处理的buffer数据, 有trailer的情况', () => {
      const state = createChunkedBodyState();
      const input = Buffer.from('5\r\nhello\r\n0\r\nname:xxx\r\n\r\nextra data');
      const result = decodeChunkedBody(state, input);

      assert.strictEqual(result.finished, true);
      assert.strictEqual(result.buffer.toString(), 'extra data');
      assert.strictEqual(result.trailers.name, 'xxx');
    });
  });

  describe('状态机转换', () => {
    it('应该正确转换状态: SIZE -> DATA -> CRLF -> SIZE -> TRAILER', () => {
      let state = createChunkedBodyState();
      assert.strictEqual(state.phase, 'SIZE');

      state = decodeChunkedBody(state, Buffer.from('5\r\n'));
      assert.strictEqual(state.phase, 'DATA');

      state = decodeChunkedBody(state, Buffer.from('hello'));
      assert.strictEqual(state.phase, 'CRLF');

      state = decodeChunkedBody(state, Buffer.from('\r\n'));
      assert.strictEqual(state.phase, 'SIZE');

      state = decodeChunkedBody(state, Buffer.from('0\r\n'));
      assert.strictEqual(state.finished, false);
      assert.strictEqual(state.phase, 'TRAILER');

      state = decodeChunkedBody(state, Buffer.from('\r\n'));
      assert.strictEqual(state.finished, true);
    });
  });
});
