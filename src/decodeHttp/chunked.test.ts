import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  createChunkedState,
  parseChunked,
} from './chunked.js';

// helper
const body = (state) => Buffer.concat(state.bodyChunks).toString();

it('chunked: simple 2-chunk decode', () => {
  let s = createChunkedState();

  s = parseChunked(s, Buffer.from('4\r\nWiki\r\n'));
  s = parseChunked(s, Buffer.from('5\r\npedia\r\n'));
  s = parseChunked(s, Buffer.from('0\r\n'));

  assert.equal(s.finished, false);
  assert.equal(body(s), 'Wikipedia');
  s = parseChunked(s, Buffer.from('\r\n'));
  assert.equal(s.finished, true);
  assert.deepEqual(s.trailers, {});
});

describe('chunked: with trailer headers', () => {
  let s = createChunkedState();

  s = parseChunked(s, Buffer.from('4\r\nWiki\r\n'));
  s = parseChunked(s, Buffer.from('5\r\npedia\r\n'));
  s = parseChunked(s, Buffer.from('0\r\n'));
  s = parseChunked(s, Buffer.from('Expires: Wed\r\nServer: X\r\n\r\n'));

  assert.equal(s.finished, true);
  assert.equal(body(s), 'Wikipedia');
  assert.deepEqual(s.trailers, {
    expires: 'Wed',
    server: 'X',
  });
});

describe('chunked: invalid chunk size', () => {
  const s = createChunkedState();

  assert.throws(() => {
    parseChunked(s, Buffer.from('ZZZ\r\nAA\r\n'));
  }, /Invalid chunk size/);
});

describe('chunked: missing CRLF after chunk data', () => {
  let s = createChunkedState();

  s = parseChunked(s, Buffer.from('4\r\nWiki')); // DATA 完整
  assert.throws(() => {
    parseChunked(s, Buffer.from('X\r\n')); // 应该是 \r\n 现在变成 "X\r\n"
  }, /Missing CRLF/);
});

describe('chunked: random fragment input (socket style)', () => {
  const chunks = [
    '4\r\nWi',
    'ki\r\n5\r',
    '\nped',
    'ia\r\n0\r',
    '\nExpires: Wed, 21 Oct\r\n\r\n',
  ];

  let s = createChunkedState();
  for (const part of chunks) {
    s = parseChunked(s, Buffer.from(part));
  }

  assert.equal(s.finished, true);
  assert.equal(body(s), 'Wikipedia');
  assert.equal(s.trailers.expires, 'Wed, 21 Oct');
});
