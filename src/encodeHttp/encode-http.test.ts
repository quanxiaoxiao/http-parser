import * as assert from 'node:assert';
import { test, describe } from 'node:test';

import { encodeHttpRequest } from './encode-http.js';

async function collectGenerator(generator: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

describe('encodeHttpRequest', () => {
  test('应该正确编码带有字符串 Body 的请求', async () => {
    const params = {
      startLine: { method: 'POST', path: '/api/data', version: 1.1 },
      headers: { 'content-type': 'application/json' },
      body: '{"foo":"bar"}',
    };

    const generator = encodeHttpRequest(params);
    const result = await collectGenerator(generator);
    const output = result.toString();

    assert.match(output, /^POST \/api\/data HTTP\/1\.1\r\n/);
    assert.match(output, /Content-Type: application\/json/i);
    assert.match(output, /Content-Length: 13\r\n/i);
    assert.match(output, /\r\n\r\n/);
    assert.ok(output.endsWith('{"foo":"bar"}'));
  });

  test('应该正确处理没有 Body 的 GET 请求', async () => {
    const params = {
      startLine: { method: 'GET', path: '/' },
      headers: { 'host': 'localhost' }
    };

    const generator = encodeHttpRequest(params);
    const chunks: Buffer[] = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    const output = Buffer.concat(chunks).toString();
    assert.match(output, /^GET \/ HTTP\/1\.1\r\n/);
    assert.match(output, /Host: localhost/);
    assert.ok(output.endsWith('\r\n\r\n'));
  });

});
