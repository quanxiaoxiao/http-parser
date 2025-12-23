import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { encodeRequestLine } from './encode-request-line.js';

describe('encodeRequestLine', () => {
  it('should encode default GET request', () => {
    const result = encodeRequestLine();
    assert.strictEqual(result.toString(), 'GET / HTTP/1.1');
  });

  it('should encode only set path', () => {
    const result = encodeRequestLine({ path: '/api' });
    assert.strictEqual(result.toString(), 'GET /api HTTP/1.1');
  });

  it('should encode only set method', () => {
    const result = encodeRequestLine({ method: 'post' });
    assert.strictEqual(result.toString(), 'POST / HTTP/1.1');
  });

  it('should encode GET request with custom path', () => {
    const result = encodeRequestLine({
      method: 'GET',
      path: '/api/users',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'GET /api/users HTTP/1.1');
  });

  it('should encode POST request', () => {
    const result = encodeRequestLine({
      method: 'POST',
      path: '/api/login',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'POST /api/login HTTP/1.1');
  });

  it('should encode PUT request', () => {
    const result = encodeRequestLine({
      method: 'PUT',
      path: '/api/users/123',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'PUT /api/users/123 HTTP/1.1');
  });

  it('should encode DELETE request', () => {
    const result = encodeRequestLine({
      method: 'DELETE',
      path: '/api/users/123',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'DELETE /api/users/123 HTTP/1.1');
  });

  it('should handle HTTP/1.0 version', () => {
    const result = encodeRequestLine({
      method: 'GET',
      path: '/',
      version: 1.0,
    });
    assert.strictEqual(result.toString(), 'GET / HTTP/1.0');
  });

  it('should handle HTTP/2.0 version', () => {
    const result = encodeRequestLine({
      method: 'GET',
      path: '/',
      version: 2.0,
    });
    assert.strictEqual(result.toString(), 'GET / HTTP/2.0');
  });

  it('should handle string version', () => {
    const result = encodeRequestLine({
      method: 'GET',
      path: '/',
      version: 'HTTP/1.1',
    });
    assert.strictEqual(result.toString(), 'GET / HTTP/HTTP/1.1');
  });

  it('should default path to / when not provided', () => {
    const result = encodeRequestLine({
      method: 'GET',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'GET / HTTP/1.1');
  });

  it('should handle path with query parameters', () => {
    const result = encodeRequestLine({
      method: 'GET',
      path: '/api/users?id=123&name=test',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'GET /api/users?id=123&name=test HTTP/1.1');
  });

  it('should handle path with hash', () => {
    const result = encodeRequestLine({
      method: 'GET',
      path: '/page#section',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'GET /page#section HTTP/1.1');
  });

  it('should return a Buffer instance', () => {
    const result = encodeRequestLine();
    assert.ok(Buffer.isBuffer(result));
  });

  it('should handle PATCH method', () => {
    const result = encodeRequestLine({
      method: 'PATCH',
      path: '/api/users/123',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'PATCH /api/users/123 HTTP/1.1');
  });

  it('should handle OPTIONS method', () => {
    const result = encodeRequestLine({
      method: 'OPTIONS',
      path: '*',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'OPTIONS * HTTP/1.1');
  });

  it('should handle HEAD method', () => {
    const result = encodeRequestLine({
      method: 'HEAD',
      path: '/api/users',
      version: 1.1,
    });
    assert.strictEqual(result.toString(), 'HEAD /api/users HTTP/1.1');
  });
});
