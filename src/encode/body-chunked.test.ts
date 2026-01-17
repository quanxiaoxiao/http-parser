import * as assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import {
  encodeChunked,
  encodeChunkedBuffer,
  encodeChunkedStream,
} from './body-chunked.js';

describe('Chunked Encoding', () => {
  describe('encodeChunkedBuffer', () => {
    it('should encode empty buffer', () => {
      const result = encodeChunkedBuffer(Buffer.alloc(0));
      const expected = Buffer.from('0\r\n\r\n');
      assert.deepStrictEqual(result, expected);
    });

    it('should encode small buffer (single chunk)', () => {
      const data = Buffer.from('Hello, World!');
      const result = encodeChunkedBuffer(data);

      const expected = Buffer.from('d\r\nHello, World!\r\n0\r\n\r\n');
      assert.deepStrictEqual(result, expected);
    });

    it('should encode buffer with custom chunk size', () => {
      const data = Buffer.from('0123456789'); // 10 bytes
      const result = encodeChunkedBuffer(data, { chunkSize: 4 });

      const expected = Buffer.concat([
        Buffer.from('4\r\n0123\r\n'),
        Buffer.from('4\r\n4567\r\n'),
        Buffer.from('2\r\n89\r\n'),
        Buffer.from('0\r\n\r\n'),
      ]);
      assert.deepStrictEqual(result, expected);
    });

    it('should encode large buffer with default chunk size', () => {
      const data = Buffer.alloc(10000, 'a');
      const result = encodeChunkedBuffer(data);

      assert.ok(result.length > data.length);
      assert.ok(result.toString().includes('2000')); // 8192 in hex
      assert.ok(result.toString().endsWith('0\r\n\r\n'));
    });

    it('should encode buffer with trailer headers', () => {
      const data = Buffer.from('test');
      const trailers = {
        'X-Checksum': 'abc123',
        'X-Size': '4',
      };
      const result = encodeChunkedBuffer(data, { trailers });

      const resultStr = result.toString();
      assert.ok(resultStr.includes('4\r\ntest\r\n'));
      assert.ok(resultStr.includes('X-Checksum: abc123'));
      assert.ok(resultStr.includes('X-Size: 4'));
      assert.ok(resultStr.endsWith('\r\n\r\n'));
    });

    it('should handle exact chunk size boundary', () => {
      const data = Buffer.alloc(8192, 'x');
      const result = encodeChunkedBuffer(data, { chunkSize: 8192 });

      const expected = Buffer.concat([
        Buffer.from('2000\r\n'), // 8192 in hex
        data,
        Buffer.from('\r\n'),
        Buffer.from('0\r\n\r\n'),
      ]);
      assert.deepStrictEqual(result, expected);
    });
  });

  describe('encodeChunkedStream', async () => {
    it('should encode empty stream', async () => {
      async function* emptyStream() {
        // Empty generator
      }

      const chunks: Buffer[] = [];
      for await (const chunk of encodeChunkedStream(emptyStream())) {
        chunks.push(chunk);
      }

      const result = Buffer.concat(chunks);
      assert.deepStrictEqual(result, Buffer.from('0\r\n\r\n'));
    });

    it('should encode single chunk stream', async () => {
      async function* singleChunkStream() {
        yield Buffer.from('Hello');
      }

      const chunks: Buffer[] = [];
      for await (const chunk of encodeChunkedStream(singleChunkStream())) {
        chunks.push(chunk);
      }

      const result = Buffer.concat(chunks);
      const expected = Buffer.from('5\r\nHello\r\n0\r\n\r\n');
      assert.deepStrictEqual(result, expected);
    });

    it('should encode multiple chunks stream', async () => {
      async function* multiChunkStream() {
        yield Buffer.from('Hello');
        yield Buffer.from('World');
      }

      const chunks: Buffer[] = [];
      for await (const chunk of encodeChunkedStream(multiChunkStream())) {
        chunks.push(chunk);
      }

      const result = Buffer.concat(chunks);
      const expected = Buffer.from('5\r\nHello\r\n5\r\nWorld\r\n0\r\n\r\n');
      assert.deepStrictEqual(result, expected);
    });

    it('should skip empty chunks in stream', async () => {
      async function* streamWithEmpty() {
        yield Buffer.from('A');
        yield Buffer.alloc(0);
        yield Buffer.from('B');
        yield Buffer.alloc(0);
      }

      const chunks: Buffer[] = [];
      for await (const chunk of encodeChunkedStream(streamWithEmpty())) {
        chunks.push(chunk);
      }

      const result = Buffer.concat(chunks);
      const expected = Buffer.from('1\r\nA\r\n1\r\nB\r\n0\r\n\r\n');
      assert.deepStrictEqual(result, expected);
    });

    it('should split large chunks in stream', async () => {
      async function* largeChunkStream() {
        yield Buffer.alloc(10000, 'x');
      }

      const chunks: Buffer[] = [];
      for await (const chunk of encodeChunkedStream(largeChunkStream(), {
        chunkSize: 4096,
      })) {
        chunks.push(chunk);
      }

      const result = Buffer.concat(chunks);
      assert.ok(result.length > 10000);
      assert.ok(result.toString().includes('1000')); // 4096 in hex
    });

    it('should encode stream with trailers', async () => {
      async function* simpleStream() {
        yield Buffer.from('data');
      }

      const trailers = { 'X-Final': 'done' };
      const chunks: Buffer[] = [];

      for await (const chunk of encodeChunkedStream(simpleStream(), { trailers })) {
        chunks.push(chunk);
      }

      const result = Buffer.concat(chunks).toString();
      assert.ok(result.includes('4\r\ndata\r\n'));
      assert.ok(result.includes('X-Final: done'));
      assert.ok(result.endsWith('\r\n\r\n'));
    });
  });

  describe('encodeChunked (overloaded)', () => {
    it('should handle Buffer input', () => {
      const data = Buffer.from('test');
      const result = encodeChunked(data);

      assert.ok(Buffer.isBuffer(result));
      assert.deepStrictEqual(result, Buffer.from('4\r\ntest\r\n0\r\n\r\n'));
    });

    it('should handle AsyncIterable input', async () => {
      async function* stream() {
        yield Buffer.from('async');
      }

      const result = encodeChunked(stream());
      assert.ok(Symbol.asyncIterator in result);

      const chunks: Buffer[] = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }

      const combined = Buffer.concat(chunks);
      assert.deepStrictEqual(combined, Buffer.from('5\r\nasync\r\n0\r\n\r\n'));
    });

    it('should pass options to Buffer encoding', () => {
      const data = Buffer.from('12345678');
      const result = encodeChunked(data, { chunkSize: 3 });

      const resultStr = result.toString();
      assert.ok(resultStr.includes('3\r\n123\r\n'));
      assert.ok(resultStr.includes('3\r\n456\r\n'));
      assert.ok(resultStr.includes('2\r\n78\r\n'));
    });

    it('should pass options to stream encoding', async () => {
      async function* stream() {
        yield Buffer.from('streaming');
      }

      const trailers = { 'X-Test': 'value' };
      const result = encodeChunked(stream(), { trailers });

      const chunks: Buffer[] = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }

      const combined = Buffer.concat(chunks).toString();
      assert.ok(combined.includes('X-Test: value'));
    });
  });

  describe('Edge cases', () => {
    it('should handle single byte buffer', () => {
      const data = Buffer.from('x');
      const result = encodeChunkedBuffer(data);
      assert.deepStrictEqual(result, Buffer.from('1\r\nx\r\n0\r\n\r\n'));
    });

    it('should handle very large hex size', () => {
      const data = Buffer.alloc(1000000, 'a'); // ~1MB
      const result = encodeChunkedBuffer(data);

      // Should contain hex representation of large numbers
      assert.ok(result.length > data.length);
      assert.ok(result.toString().endsWith('0\r\n\r\n'));
    });

    it('should handle multiple trailer headers', () => {
      const data = Buffer.from('x');
      const trailers = {
        'Header-1': 'value1',
        'Header-2': 'value2',
        'Header-3': 'value3',
      };

      const result = encodeChunkedBuffer(data, { trailers }).toString();
      assert.ok(result.includes('Header-1: value1'));
      assert.ok(result.includes('Header-2: value2'));
      assert.ok(result.includes('Header-3: value3'));
    });

    it('should handle chunk size of 1', () => {
      const data = Buffer.from('abc');
      const result = encodeChunkedBuffer(data, { chunkSize: 1 });

      const expected = Buffer.from('1\r\na\r\n1\r\nb\r\n1\r\nc\r\n0\r\n\r\n');
      assert.deepStrictEqual(result, expected);
    });

    it('should handle empty trailers object', () => {
      const data = Buffer.from('test');
      const result = encodeChunkedBuffer(data, { trailers: {} });

      // Should be same as no trailers
      const expected = Buffer.from('4\r\ntest\r\n0\r\n\r\n');
      assert.deepStrictEqual(result, expected);
    });
  });
});
