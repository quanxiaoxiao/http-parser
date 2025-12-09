import * as assert from 'node:assert';
import { describe, test } from 'node:test';

import { createChunkedState, parseChunked } from './parseChunked.js';

describe('createChunkedState', () => {
  test('should create initial state with correct defaults', () => {
    const state = createChunkedState();

    assert.strictEqual(state.phase, 'SIZE');
    assert.strictEqual(state.buffer.length, 0);
    assert.strictEqual(state.currentChunkSize, 0);
    assert.deepStrictEqual(state.bodyChunks, []);
    assert.deepStrictEqual(state.trailers, {});
    assert.strictEqual(state.finished, false);
  });
});

describe('parseChunked - basic functionality', () => {
  test('should parse a single chunk', () => {
    const state = createChunkedState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks.length, 1);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
  });

  test('should parse multiple chunks', () => {
    const state = createChunkedState();
    const input = Buffer.from('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks.length, 2);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
    assert.strictEqual(result.bodyChunks[1].toString(), ' world');
  });

  test('should handle chunk with extension', () => {
    const state = createChunkedState();
    const input = Buffer.from('5;name=value\r\nhello\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
  });

  test('should handle empty chunk (size 0)', () => {
    const state = createChunkedState();
    const input = Buffer.from('0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks.length, 0);
  });
});

describe('parseChunked - incremental parsing', () => {
  test('should handle data arriving in multiple buffers', () => {
    let state = createChunkedState();

    state = parseChunked(state, Buffer.from('5\r\n'));
    assert.strictEqual(state.phase, 'DATA');
    assert.strictEqual(state.finished, false);

    state = parseChunked(state, Buffer.from('hello'));
    assert.strictEqual(state.phase, 'CRLF');

    state = parseChunked(state, Buffer.from('\r\n0\r\n\r\n'));
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.bodyChunks[0].toString(), 'hello');
  });

  test('should handle partial chunk size', () => {
    let state = createChunkedState();

    state = parseChunked(state, Buffer.from('a'));
    assert.strictEqual(state.phase, 'SIZE');
    assert.strictEqual(state.finished, false);

    state = parseChunked(state, Buffer.from('\r\nhelloworld\r\n0\r\n\r\n'));
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.bodyChunks[0].toString(), 'helloworld');
  });

  test('should handle partial chunk data', () => {
    let state = createChunkedState();

    state = parseChunked(state, Buffer.from('a\r\nhello'));
    assert.strictEqual(state.phase, 'DATA');

    state = parseChunked(state, Buffer.from('world\r\n0\r\n\r\n'));
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.bodyChunks[0].toString(), 'helloworld');
  });
});

describe('parseChunked - trailer headers', () => {
  test('should parse trailer headers', () => {
    const state = createChunkedState();
    const input = Buffer.from(
      '5\r\nhello\r\n0\r\nX-Trailer: value\r\nAnother-Header: test\r\n\r\n',
    );

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.trailers['x-trailer'], 'value');
    assert.strictEqual(result.trailers['another-header'], 'test');
  });

  test('should handle trailer with colon in value', () => {
    const state = createChunkedState();
    const input = Buffer.from('0\r\nX-Header: value:with:colons\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.trailers['x-header'], 'value:with:colons');
  });

  test('should handle no trailer headers', () => {
    const state = createChunkedState();
    const input = Buffer.from('5\r\nhello\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.deepStrictEqual(result.trailers, {});
  });

  test('should handle trailer headers arriving incrementally', () => {
    let state = createChunkedState();

    state = parseChunked(state, Buffer.from('0\r\nX-Trail'));
    assert.strictEqual(state.finished, false);

    state = parseChunked(state, Buffer.from('er: value\r\n\r\n'));
    assert.strictEqual(state.finished, true);
    assert.strictEqual(state.trailers['x-trailer'], 'value');
  });
});

describe('parseChunked - hex parsing', () => {
  test('should parse lowercase hex', () => {
    const state = createChunkedState();
    const input = Buffer.from('a\r\n0123456789\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].toString(), '0123456789');
  });

  test('should parse uppercase hex', () => {
    const state = createChunkedState();
    const input = Buffer.from('A\r\n0123456789\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].toString(), '0123456789');
  });

  test('should parse mixed case hex', () => {
    const state = createChunkedState();
    const input = Buffer.from('1A\r\n' + 'x'.repeat(26) + '\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].length, 26);
  });

  test('should handle large chunk size', () => {
    const state = createChunkedState();
    const data = 'x'.repeat(1000);
    const input = Buffer.from(`3e8\r\n${data}\r\n0\r\n\r\n`);

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].length, 1000);
  });
});

describe('parseChunked - error handling', () => {
  test('should throw on invalid chunk size (non-hex)', () => {
    const state = createChunkedState();
    const input = Buffer.from('xyz\r\nhello\r\n');

    assert.throws(
      () => parseChunked(state, input),
      /Invalid chunk size/,
    );
  });

  test('should throw on negative chunk size', () => {
    const state = createChunkedState();
    const input = Buffer.from('-5\r\nhello\r\n');

    assert.throws(
      () => parseChunked(state, input),
      /Invalid chunk size/,
    );
  });

  test('should throw on missing CRLF after chunk data', () => {
    const state = createChunkedState();
    const input = Buffer.from('5\r\nhelloXX');

    assert.throws(
      () => parseChunked(state, input),
      /Missing CRLF after chunk/,
    );
  });

  test('should throw when parsing after finished', () => {
    let state = createChunkedState();
    state = parseChunked(state, Buffer.from('0\r\n\r\n'));

    assert.throws(
      () => parseChunked(state, Buffer.from('5\r\nhello\r\n')),
      /already finished/,
    );
  });

  test('should throw on invalid trailer header format', () => {
    const state = createChunkedState();
    const input = Buffer.from('0\r\nInvalidHeader\r\n\r\n');

    assert.throws(
      () => parseChunked(state, input),
      /Invalid trailer header/,
    );
  });

  test('should throw on empty header name in trailer', () => {
    const state = createChunkedState();
    const input = Buffer.from('0\r\n: value\r\n\r\n');

    assert.throws(
      () => parseChunked(state, input),
      /Invalid trailer header/,
    );
  });
});

describe('parseChunked - edge cases', () => {
  test('should handle empty input', () => {
    const state = createChunkedState();
    const result = parseChunked(state, Buffer.from(''));

    assert.strictEqual(result.finished, false);
    assert.strictEqual(result.phase, 'SIZE');
  });

  test('should handle whitespace in chunk size with extension', () => {
    const state = createChunkedState();
    const input = Buffer.from('5  ;  ext=value  \r\nhello\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].toString(), 'hello');
  });

  test('should handle binary data in chunks', () => {
    const state = createChunkedState();
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    const input = Buffer.concat([
      Buffer.from('5\r\n'),
      binaryData,
      Buffer.from('\r\n0\r\n\r\n'),
    ]);

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.deepStrictEqual(result.bodyChunks[0], binaryData);
  });

  test('should preserve multiple body chunks separately', () => {
    const state = createChunkedState();
    const input = Buffer.from('3\r\nabc\r\n3\r\ndef\r\n3\r\nghi\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks.length, 3);
    assert.strictEqual(result.bodyChunks[0].toString(), 'abc');
    assert.strictEqual(result.bodyChunks[1].toString(), 'def');
    assert.strictEqual(result.bodyChunks[2].toString(), 'ghi');
  });

  test('should handle chunk size of exactly 1 byte', () => {
    const state = createChunkedState();
    const input = Buffer.from('1\r\nx\r\n0\r\n\r\n');

    const result = parseChunked(state, input);

    assert.strictEqual(result.finished, true);
    assert.strictEqual(result.bodyChunks[0].toString(), 'x');
  });
});

describe('parseChunked - real-world scenarios', () => {
  test('should handle streaming JSON response', () => {
    let state = createChunkedState();

    const chunk1 = '{"users":[';
    const chunk2 = '{"id":1,"name":"Alice"},';
    const chunk3 = '{"id":2,"name":"Bob"}';
    const chunk4 = ']}';

    state = parseChunked(state, Buffer.from(`${chunk1.length.toString(16)}\r\n${chunk1}\r\n`));
    state = parseChunked(state, Buffer.from(`${chunk2.length.toString(16)}\r\n${chunk2}\r\n`));
    state = parseChunked(state, Buffer.from(`${chunk3.length.toString(16)}\r\n${chunk3}\r\n`));
    state = parseChunked(state, Buffer.from(`${chunk4.length.toString(16)}\r\n${chunk4}\r\n`));
    state = parseChunked(state, Buffer.from('0\r\n\r\n'));

    assert.strictEqual(state.finished, true);

    const fullBody = Buffer.concat(state.bodyChunks).toString();
    const json = JSON.parse(fullBody);
    assert.strictEqual(json.users.length, 2);
    assert.strictEqual(json.users[0].name, 'Alice');
  });
});
