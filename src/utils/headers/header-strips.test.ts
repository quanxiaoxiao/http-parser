import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  stripHopByHopHeaders,
  stripFramingHeaders,
  sanitizeHeaders,
} from './header-strips.js';

describe('stripHopByHopHeaders', () => {
  it('should remove all hop-by-hop headers', () => {
    const headers = {
      'connection': 'keep-alive',
      'transfer-encoding': 'chunked',
      'content-length': '123',
      'upgrade': 'websocket',
      'keep-alive': 'timeout=5',
      'proxy-authorization': 'Bearer token',
      'host': 'example.com',
      'user-agent': 'test',
    };

    stripHopByHopHeaders(headers);

    assert.strictEqual(headers.connection, undefined);
    assert.strictEqual(headers['transfer-encoding'], undefined);
    assert.strictEqual(headers['content-length'], undefined);
    assert.strictEqual(headers.upgrade, undefined);
    assert.strictEqual(headers['keep-alive'], undefined);
    assert.strictEqual(headers['proxy-authorization'], undefined);
    assert.strictEqual(headers.host, 'example.com');
    assert.strictEqual(headers['user-agent'], 'test');
  });

  it('should handle empty headers object', () => {
    const headers = {};
    stripHopByHopHeaders(headers);
    assert.deepStrictEqual(headers, {});
  });

  it('should not fail when hop-by-hop headers are not present', () => {
    const headers = {
      'host': 'example.com',
      'accept': 'application/json',
    };

    stripHopByHopHeaders(headers);

    assert.strictEqual(headers.host, 'example.com');
    assert.strictEqual(headers.accept, 'application/json');
  });
});

describe('stripFramingHeaders', () => {
  it('should remove all framing headers', () => {
    const headers = {
      'content-length': '456',
      'transfer-encoding': 'gzip',
      'content-encoding': 'gzip',
      'content-type': 'application/json',
      'content-range': 'bytes 200-1000/67589',
      'host': 'example.com',
      'accept': '*/*',
    };

    stripFramingHeaders(headers);

    assert.strictEqual(headers['content-length'], undefined);
    assert.strictEqual(headers['transfer-encoding'], undefined);
    assert.strictEqual(headers['content-encoding'], undefined);
    assert.strictEqual(headers['content-type'], undefined);
    assert.strictEqual(headers['content-range'], undefined);
    assert.strictEqual(headers.host, 'example.com');
    assert.strictEqual(headers.accept, '*/*');
  });

  it('should handle empty headers object', () => {
    const headers = {};
    stripFramingHeaders(headers);
    assert.deepStrictEqual(headers, {});
  });

  it('should not fail when framing headers are not present', () => {
    const headers = {
      'authorization': 'Bearer token',
      'x-custom-header': 'value',
    };

    stripFramingHeaders(headers);

    assert.strictEqual(headers.authorization, 'Bearer token');
    assert.strictEqual(headers['x-custom-header'], 'value');
  });
});

describe('sanitizeHeaders', () => {
  it('should strip hop-by-hop headers when connection header is present', () => {
    const headers = {
      'connection': 'keep-alive',
      'keep-alive': 'timeout=5',
      'transfer-encoding': 'chunked',
      'host': 'example.com',
    };

    sanitizeHeaders(headers);

    assert.strictEqual(headers.connection, undefined);
    assert.strictEqual(headers['keep-alive'], undefined);
    assert.strictEqual(headers['transfer-encoding'], undefined);
    assert.strictEqual(headers.host, 'example.com');
  });

  it('should handle connection header with custom values', () => {
    const headers = {
      'connection': 'close, x-custom-header',
      'x-custom-header': 'some-value',
      'content-type': 'text/html',
    };

    sanitizeHeaders(headers);

    assert.strictEqual(headers.connection, undefined);
    assert.strictEqual(headers['x-custom-header'], undefined);
    assert.strictEqual(headers['content-type'], 'text/html');
  });

  it('should not modify headers when connection header is absent', () => {
    const headers = {
      'host': 'example.com',
      'user-agent': 'test-agent',
    };

    const originalHeaders = { ...headers };
    sanitizeHeaders(headers);

    assert.deepStrictEqual(headers, originalHeaders);
  });

  it('should handle empty headers object', () => {
    const headers = {};
    sanitizeHeaders(headers);
    assert.deepStrictEqual(headers, {});
  });

  it('should handle array values for connection header', () => {
    const headers = {
      'connection': ['keep-alive', 'upgrade'],
      'keep-alive': 'timeout=5',
      'upgrade': 'websocket',
      'host': 'example.com',
    };

    sanitizeHeaders(headers);

    assert.strictEqual(headers.connection, undefined);
    assert.strictEqual(headers['keep-alive'], undefined);
    assert.strictEqual(headers.upgrade, undefined);
    assert.strictEqual(headers.host, 'example.com');
  });
});
