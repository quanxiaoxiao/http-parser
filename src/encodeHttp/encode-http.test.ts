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

test('encodeHttpRequest - 基本的 GET 请求', async () => {
  const request = {
    startLine: {
      method: 'GET',
      path: '/api/users',
      version: '1.1'
    },
    headers: {
      'host': 'example.com',
      'User-Agent': 'test-client'
    }
  };

  const chunks = [];
  for await (const chunk of encodeHttpRequest(request)) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks).toString();
  assert.ok(result.includes('GET /api/users HTTP/1.1'));
  assert.ok(result.includes('Host: example.com'));
  assert.ok(result.includes('User-Agent: test-client'));
});

test('encodeHttpRequest - 带字符串 body 的 POST 请求', async () => {
  const request = {
    startLine: {
      method: 'POST',
      path: '/api/data',
      version: '1.1'
    },
    headers: {
      'host': 'example.com',
      'content-Type': 'application/json'
    },
    body: '{"name":"test"}'
  };

  const chunks = [];
  for await (const chunk of encodeHttpRequest(request)) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks).toString();
  assert.ok(result.includes('POST /api/data HTTP/1.1'));
  assert.ok(result.includes('{"name":"test"}'));
});

test('encodeHttpRequest - 带 Buffer body 的请求', async () => {
  const bodyBuffer = Buffer.from('binary data');
  const request = {
    startLine: {
      method: 'PUT',
      path: '/upload',
    },
    headers: {
      'host': 'example.com'
    },
    body: bodyBuffer
  };

  const chunks = [];
  for await (const chunk of encodeHttpRequest(request)) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks);
  assert.ok(result.includes(bodyBuffer));
});

test('encodeHttpRequest - 带 AsyncIterable body 的请求', async () => {
  async function* generateBody() {
    yield Buffer.from('chunk1');
    yield Buffer.from('chunk2');
    yield Buffer.from('chunk3');
  }

  const request = {
    startLine: {
      method: 'POST',
      path: '/stream',
    },
    headers: {
      'host': 'example.com'
    },
    body: generateBody()
  };

  const chunks = [];
  for await (const chunk of encodeHttpRequest(request)) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks).toString();
  assert.ok(result.includes('POST /stream HTTP/1.1'));
  // 应该包含分块编码的内容
  assert.ok(result.includes('chunk1'));
  assert.ok(result.includes('chunk2'));
  assert.ok(result.includes('chunk3'));
});

test('encodeHttpRequest - 没有 body 的请求', async () => {
  const request = {
    startLine: {
      method: 'DELETE',
      path: '/api/resource/123',
    },
    headers: {
      'host': 'example.com'
    }
  };

  const chunks = [];
  for await (const chunk of encodeHttpRequest(request)) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks).toString();
  assert.ok(result.includes('DELETE /api/resource/123 HTTP/1.1'));
  assert.ok(result.includes('Host: example.com'));
});

test('encodeHttpRequest - 移除 hop-by-hop headers', async () => {
  const request = {
    startLine: {
      method: 'GET',
      path: '/',
    },
    headers: {
      'host': 'example.com',
      'connection': 'keep-alive',
      'keep-alive': 'timeout=5'
    }
  };

  const chunks = [];
  for await (const chunk of encodeHttpRequest(request)) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks).toString();
  // Connection 和 Keep-Alive 应该被移除
  assert.ok(!result.includes('Connection:'));
  assert.ok(!result.includes('Keep-Alive:'));
});

test('encodeHttpRequest - 应用 framing headers', async () => {
  const request = {
    startLine: {
      method: 'POST',
      path: '/data',
    },
    headers: {
      'host': 'example.com'
    },
    body: 'test body'
  };

  const chunks = [];
  for await (const chunk of encodeHttpRequest(request)) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks).toString();
  // 应该添加 Content-Length header
  assert.ok(result.includes('Content-Length:'));
});

test('encodeHttpRequest - 处理空字符串 body', async () => {
  const request = {
    startLine: {
      method: 'POST',
      path: '/empty',
    },
    headers: {
      'host': 'example.com'
    },
    body: ''
  };

  const chunks = [];
  for await (const chunk of encodeHttpRequest(request)) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks).toString();
  assert.ok(result.includes('POST /empty HTTP/1.1'));
});

test('encodeHttpRequest - 验证输出格式正确', async () => {
  const request = {
    startLine: {
      method: 'GET',
      path: '/test',
    },
    headers: {
      'host': 'example.com',
      'accept': 'application/json'
    }
  };

  const chunks = [];
  for await (const chunk of encodeHttpRequest(request)) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks).toString();
  
  // 验证请求行
  assert.ok(result.startsWith('GET /test HTTP/1.1'));
  
  // 验证 headers 格式
  const lines = result.split('\r\n');
  assert.ok(lines.length >= 2);
  assert.ok(lines.some(line => line.includes('Host:')));
  assert.ok(lines.some(line => line.includes('Accept:')));
});
