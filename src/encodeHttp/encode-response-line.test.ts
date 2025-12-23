import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { encodeResponseLine } from './encode-response-line.js';

describe('encodeResponseLine', () => {
  it('should encode default 200 OK response', () => {
    const result = encodeResponseLine();
    assert.strictEqual(result.toString(), 'HTTP/1.1 200 OK');
  });

  it('should encode 200 OK response explicitly', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 200,
      statusText: 'OK',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 200 OK');
  });

  it('should encode 404 Not Found response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 404,
      statusText: 'Not Found',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 404 Not Found');
  });

  it('should encode 500 Internal Server Error response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 500,
      statusText: 'Internal Server Error',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 500 Internal Server Error');
  });

  it('should use default status text when not provided', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 201,
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 201 Created');
  });

  it('should use default status text for 404', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 404,
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 404 Not Found');
  });

  it('should handle HTTP/1.0 version', () => {
    const result = encodeResponseLine({
      version: 1.0,
      statusCode: 200,
      statusText: 'OK',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.0 200 OK');
  });

  it('should handle HTTP/2.0 version', () => {
    const result = encodeResponseLine({
      version: 2.0,
      statusCode: 200,
      statusText: 'OK',
    });
    assert.strictEqual(result.toString(), 'HTTP/2.0 200 OK');
  });

  it('should handle string version', () => {
    const result = encodeResponseLine({
      version: 'HTTP/1.1',
      statusCode: 200,
      statusText: 'OK',
    });
    assert.strictEqual(result.toString(), 'HTTP/HTTP/1.1 200 OK');
  });

  it('should encode 201 Created response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 201,
      statusText: 'Created',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 201 Created');
  });

  it('should encode 204 No Content response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 204,
      statusText: 'No Content',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 204 No Content');
  });

  it('should encode 301 Moved Permanently response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 301,
      statusText: 'Moved Permanently',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 301 Moved Permanently');
  });

  it('should encode 302 Found response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 302,
      statusText: 'Found',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 302 Found');
  });

  it('should encode 304 Not Modified response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 304,
      statusText: 'Not Modified',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 304 Not Modified');
  });

  it('should encode 400 Bad Request response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 400,
      statusText: 'Bad Request',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 400 Bad Request');
  });

  it('should encode 401 Unauthorized response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 401,
      statusText: 'Unauthorized',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 401 Unauthorized');
  });

  it('should encode 403 Forbidden response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 403,
      statusText: 'Forbidden',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 403 Forbidden');
  });

  it('should encode 429 Too Many Requests response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 429,
      statusText: 'Too Many Requests',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 429 Too Many Requests');
  });

  it('should encode 502 Bad Gateway response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 502,
      statusText: 'Bad Gateway',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 502 Bad Gateway');
  });

  it('should encode 503 Service Unavailable response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 503,
      statusText: 'Service Unavailable',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 503 Service Unavailable');
  });

  it('should handle custom status text', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 200,
      statusText: 'Custom Success Message',
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 200 Custom Success Message');
  });

  it('should handle unknown status code without text', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 999,
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 999 Unknown');
  });

  it('should return a Buffer instance', () => {
    const result = encodeResponseLine();
    assert.ok(Buffer.isBuffer(result));
  });

  it('should encode 418 I\'m a teapot response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 418,
    });
    assert.match(result.toString(), /^HTTP\/1.1 418/);
  });

  it('should encode 100 Continue response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 100,
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 100 Continue');
  });

  it('should encode 101 Switching Protocols response', () => {
    const result = encodeResponseLine({
      version: 1.1,
      statusCode: 101,
    });
    assert.strictEqual(result.toString(), 'HTTP/1.1 101 Switching Protocols');
  });
});
