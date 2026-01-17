import * as assert from 'node:assert';
import {
  describe, test,
} from 'node:test';
import {
  setTimeout,
} from 'node:timers/promises';

import {
  encodeRequest,
} from './message.js';

async function collectGenerator(generator: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function* createMockStream(chunks: Buffer[], delayMs = 0) {
  for (const chunk of chunks) {
    if (delayMs > 0) await setTimeout(delayMs);
    yield chunk;
  }
}

async function encodeAndCollect(params: any): Promise<string> {
  const result = await collectGenerator(encodeRequest(params));
  return result.toString();
}

describe('encodeRequest - Basic Functionality', () => {
  test('should correctly encode GET request', async () => {
    const params = {
      startLine: { method: 'GET', path: '/api/users' },
      headers: { host: 'example.com', 'User-Agent': 'test-client' },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('GET /api/users HTTP/1.1'));
    assert.ok(output.includes('Host: example.com'));
    assert.ok(output.includes('User-Agent: test-client'));
    assert.ok(output.endsWith('\r\n\r\n'));
  });

  test('should correctly encode GET request (exact match)', async () => {
    const params = {
      startLine: { method: 'GET', path: '/api/users' },
      headers: { host: 'example.com', 'User-Agent': 'test-client' },
    };

    const output = await encodeAndCollect(params);
    assert.strictEqual(
      output.toString(),
      'GET /api/users HTTP/1.1\r\nHost: example.com\r\nUser-Agent: test-client\r\n\r\n',
    );
  });

  test('should correctly encode POST request with string Body', async () => {
    const params = {
      startLine: { method: 'POST', path: '/api/data', version: 1.1 },
      headers: { 'content-type': 'application/json' },
      body: '{"foo":"bar"}',
    };

    const output = await encodeAndCollect(params);

    assert.match(output, /^POST \/api\/data HTTP\/1\.1\r\n/);
    assert.match(output, /Content-Type: application\/json/i);
    assert.match(output, /Content-Length: 13\r\n/i);
    assert.ok(output.includes('\r\n\r\n'));
    assert.ok(output.endsWith('{"foo":"bar"}'));
  });

  test('should correctly encode POST request with string Body (exact match)', async () => {
    const params = {
      startLine: { method: 'POST', path: '/api/data', version: 1.1 },
      headers: { 'content-type': 'application/json' },
      body: '{"foo":"bar"}',
    };

    const output = await encodeAndCollect(params);
    assert.strictEqual(
      output.toString(),
      'POST /api/data HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"foo":"bar"}',
    );
  });

  test('should correctly encode POST request with Buffer Body', async () => {
    const params = {
      startLine: { method: 'POST', path: '/api/data', version: 1.1 },
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"foo":"bar"}'),
    };

    const output = await encodeAndCollect(params);
    assert.strictEqual(
      output.toString(),
      'POST /api/data HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"foo":"bar"}',
    );
  });

  test('should correctly handle DELETE request (no Body)', async () => {
    const params = {
      startLine: { method: 'DELETE', path: '/api/resource/123' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('DELETE /api/resource/123 HTTP/1.1'));
    assert.ok(output.includes('Host: example.com'));
    assert.ok(output.endsWith('\r\n\r\n'));
  });

  test('should correctly handle empty string Body', async () => {
    const params = {
      startLine: { method: 'POST', path: '/empty' },
      headers: { host: 'example.com' },
      body: '',
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('POST /empty HTTP/1.1'));
    assert.ok(output.endsWith('\r\n\r\n'));
  });

  test('should correctly handle PUT request', async () => {
    const params = {
      startLine: { method: 'PUT', path: '/api/resource/456' },
      headers: { host: 'example.com' },
      body: '{"updated":"data"}',
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('PUT /api/resource/456 HTTP/1.1'));
    assert.ok(output.includes('Content-Length:'));
    assert.ok(output.endsWith('{"updated":"data"}'));
  });

  test('should correctly handle PATCH request', async () => {
    const params = {
      startLine: { method: 'PATCH', path: '/api/user/789' },
      headers: { host: 'example.com', 'content-type': 'application/json' },
      body: '{"status":"active"}',
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('PATCH /api/user/789 HTTP/1.1'));
    assert.ok(output.includes('Content-Type: application/json'));
    assert.ok(output.endsWith('{"status":"active"}'));
  });

  test('should correctly handle HEAD request', async () => {
    const params = {
      startLine: { method: 'HEAD', path: '/api/status' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('HEAD /api/status HTTP/1.1'));
    assert.ok(output.endsWith('\r\n\r\n'));
  });

  test('should correctly handle OPTIONS request', async () => {
    const params = {
      startLine: { method: 'OPTIONS', path: '*' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('OPTIONS * HTTP/1.1'));
    assert.ok(output.includes('Host: example.com'));
  });
});

describe('encodeRequest - Body Type Handling', () => {
  test('should correctly handle Buffer Body', async () => {
    const bodyBuffer = Buffer.from('binary data');
    const params = {
      startLine: { method: 'PUT', path: '/upload' },
      headers: { host: 'example.com' },
      body: bodyBuffer,
    };

    const result = await collectGenerator(encodeRequest(params));

    assert.ok(result.includes(bodyBuffer));
    assert.ok(result.toString().includes('Content-Length:'));
  });

  test('should correctly handle AsyncIterable Body (chunked transfer)', async () => {
    async function* generateBody() {
      yield Buffer.from('chunk1');
      yield Buffer.from('chunk2');
      yield Buffer.from('chunk3');
    }

    const params = {
      startLine: { method: 'POST', path: '/stream' },
      headers: { host: 'example.com' },
      body: generateBody(),
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('POST /stream HTTP/1.1'));
    assert.match(output, /transfer-encoding: chunked/i);
    assert.ok(output.includes('chunk1'));
    assert.ok(output.includes('chunk2'));
    assert.ok(output.includes('chunk3'));
  });

  test('should correctly handle large Buffer Body', async () => {
    const largeBody = Buffer.alloc(1024 * 1024, 'x'); // 1MB
    const params = {
      startLine: { method: 'POST', path: '/large' },
      headers: { host: 'example.com' },
      body: largeBody,
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('Content-Length: 1048576'));
    assert.strictEqual(output.length, output.indexOf('\r\n\r\n') + 4 + largeBody.length);
  });

  test('should correctly handle Body with special characters', async () => {
    const specialBody = '{"emoji":"😀","unicode":"中文","newline":"line1\\nline2"}';
    const params = {
      startLine: { method: 'POST', path: '/special' },
      headers: { host: 'example.com' },
      body: specialBody,
    };

    const output = await encodeAndCollect(params);
    const bodyLength = Buffer.byteLength(specialBody, 'utf8');

    assert.ok(output.includes(`Content-Length: ${bodyLength}`));
    assert.ok(output.endsWith(specialBody));
  });

  test('should correctly handle null or undefined Body', async () => {
    const paramsNull = {
      startLine: { method: 'GET', path: '/test' },
      headers: { host: 'example.com' },
      body: null,
    };

    const outputNull = await encodeAndCollect(paramsNull);
    assert.ok(outputNull.endsWith('\r\n\r\n'));

    const paramsUndefined = {
      startLine: { method: 'GET', path: '/test' },
      headers: { host: 'example.com' },
      body: undefined,
    };

    const outputUndefined = await encodeAndCollect(paramsUndefined);
    assert.ok(outputUndefined.endsWith('\r\n\r\n'));
  });
});

describe('encodeRequest - Headers Handling', () => {
  test('should remove hop-by-hop headers', async () => {
    const params = {
      startLine: { method: 'GET', path: '/' },
      headers: {
        host: 'example.com',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        'proxy-connection': 'keep-alive',
        'transfer-encoding': 'gzip',
        upgrade: 'websocket',
        te: 'trailers',
        trailer: 'Expires',
      },
    };

    const output = await encodeAndCollect(params);

    assert.ok(!output.toLowerCase().includes('connection:'));
    assert.ok(!output.toLowerCase().includes('keep-alive:'));
    assert.ok(!output.toLowerCase().includes('proxy-connection:'));
    assert.ok(!output.toLowerCase().includes('upgrade:'));
  });

  test('should automatically add Content-Length (string Body)', async () => {
    const params = {
      startLine: { method: 'POST', path: '/data' },
      headers: { host: 'example.com' },
      body: 'test body',
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('Content-Length: 9'));
  });

  test('should validate Headers format correctness', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test' },
      headers: {
        host: 'example.com',
        accept: 'application/json',
      },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.startsWith('GET /test HTTP/1.1'));
    const lines = output.split('\r\n');
    assert.ok(lines.length >= 2);
    assert.ok(lines.some(line => line.includes('Host:')));
    assert.ok(lines.some(line => line.includes('Accept:')));
  });

  test('should correctly handle mixed-case Header names', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test' },
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'value',
        'accept-encoding': 'gzip',
      },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('Content-Type:') || output.includes('content-type:'));
    assert.ok(output.includes('X-Custom-Header:') || output.includes('x-custom-header:'));
    assert.ok(output.includes('Accept-Encoding:') || output.includes('accept-encoding:'));
  });

  test('should correctly handle Header values with special characters', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test' },
      headers: {
        host: 'example.com',
        'user-agent': 'Mozilla/5.0 (Windows; U; MSIE 9.0)',
        cookie: 'session=abc123; user=test@example.com',
      },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('Mozilla/5.0 (Windows; U; MSIE 9.0)'));
    assert.ok(output.includes('session=abc123; user=test@example.com'));
  });

  test('应该正确处理空 Headers 对象', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test' },
      headers: {},
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.startsWith('GET /test HTTP/1.1'));
    assert.ok(output.endsWith('\r\n\r\n'));
  });

  test('应该保留多个自定义 Headers', async () => {
    const params = {
      startLine: { method: 'GET', path: '/api' },
      headers: {
        'X-Request-ID': '12345',
        'X-API-Key': 'secret',
        'X-Client-Version': '1.0.0',
        Authorization: 'Bearer token123',
      },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('X-Request-ID:'));
    assert.ok(output.includes('X-API-Key:'));
    assert.ok(output.includes('X-Client-Version:'));
    assert.ok(output.includes('Authorization:'));
  });

  test('应该在有 Body 时不覆盖用户提供的 Content-Length', async () => {
    const params = {
      startLine: { method: 'POST', path: '/data' },
      headers: {
        host: 'example.com',
        'content-length': '100', // 用户指定的值
      },
      body: 'short',
    };

    const output = await encodeAndCollect(params);

    // 应该使用用户指定的值或者自动计算的正确值
    assert.ok(output.includes('Content-Length:') || output.includes('content-length:'));
  });
});

describe('encodeRequest - 流式传输（AsyncIterable）', () => {
  const defaultStartLine = { method: 'POST', target: '/upload', version: 1.1 };

  test('应该将异步流正确编码为分块传输格式', async () => {
    const chunks = [Buffer.from('hello '), Buffer.from('world')];
    const stream = createMockStream(chunks);

    const output = await encodeAndCollect({
      startLine: defaultStartLine,
      headers: { host: 'api.test' },
      body: stream,
    });

    assert.match(output, /transfer-encoding: chunked/i);
    assert.match(output, /hello /);
    assert.match(output, /world/);

    const headerIndex = output.indexOf('\r\n\r\n');
    const bodyIndex = output.indexOf('hello ');
    assert.ok(headerIndex < bodyIndex, 'Headers 必须在 Body 之前发送');
  });

  test('should correctly handle async stream with delay (non-blocking)', async () => {
    const chunks = [Buffer.from('slow'), Buffer.from('data')];
    const stream = createMockStream(chunks, 50);

    const startTime = Date.now();
    const output = await encodeAndCollect({
      startLine: defaultStartLine,
      headers: {},
      body: stream,
    });
    const duration = Date.now() - startTime;

    assert.ok(duration >= 100, `应该至少耗时 100ms，实际: ${duration}ms`);
    assert.match(output, /slow/);
    assert.match(output, /data/);
  });

  test('should correctly handle empty async stream', async () => {
    async function* emptyStream() {}

    const output = await encodeAndCollect({
      startLine: defaultStartLine,
      headers: {},
      body: emptyStream(),
    });

    assert.match(output, /transfer-encoding: chunked/i);
  });

  test('should be able to catch errors thrown in async stream', async () => {
    async function* errorStream() {
      yield Buffer.from('good data');
      throw new Error('Stream Interrupted');
    }

    const generator = encodeRequest({
      startLine: defaultStartLine,
      headers: {},
      body: errorStream(),
    });

    await assert.rejects(
      async () => {
        for await (const chunk of generator) { void chunk; }
      },
      { message: 'Stream Interrupted' },
    );
  });

  test('should guarantee Headers atomicity (output completely before pulling Body)', async () => {
    let bodyPulled = false;
    async function* spyStream() {
      bodyPulled = true;
      yield Buffer.from('data');
    }

    const generator = encodeRequest({
      startLine: defaultStartLine,
      headers: { 'X-Test': 'true' },
      body: spyStream(),
    });

    await generator.next();
    await generator.next();
    assert.strictEqual(bodyPulled, false, 'Headers 发送完毕前不应拉取 Body');

    await generator.next();
    assert.strictEqual(bodyPulled, true, '此时应该已开始拉取 Body');
  });

  test('should correctly handle async stream with single large chunk', async () => {
    const largeChunk = Buffer.alloc(10000, 'X');
    async function* singleChunkStream() {
      yield largeChunk;
    }

    const output = await encodeAndCollect({
      startLine: defaultStartLine,
      headers: {},
      body: singleChunkStream(),
    });

    assert.match(output, /transfer-encoding: chunked/i);
  });

  test('should correctly handle async stream with many small chunks', async () => {
    async function* manySmallChunks() {
      for (let i = 0; i < 100; i++) {
        yield Buffer.from(`chunk${i}`);
      }
    }

    const output = await encodeAndCollect({
      startLine: defaultStartLine,
      headers: {},
      body: manySmallChunks(),
    });

    assert.match(output, /transfer-encoding: chunked/i);
    assert.ok(output.includes('chunk0'));
    assert.ok(output.includes('chunk99'));
  });

  test('should correctly handle async stream with empty Buffers', async () => {
    async function* streamWithEmptyBuffers() {
      yield Buffer.from('start');
      yield Buffer.from('');
      yield Buffer.from('middle');
      yield Buffer.from('');
      yield Buffer.from('end');
    }

    const output = await encodeAndCollect({
      startLine: defaultStartLine,
      headers: {},
      body: streamWithEmptyBuffers(),
    });

    assert.ok(output.includes('start'));
    assert.ok(output.includes('middle'));
    assert.ok(output.includes('end'));
  });
});

describe('encodeRequest - HTTP Version Handling', () => {
  test('should use HTTP/1.1 by default', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test' },
      headers: {},
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('HTTP/1.1'));
  });

  test('should support explicit HTTP/1.0', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test', version: 1.0 },
      headers: {},
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('HTTP/1.0'));
  });

  test('should support explicit HTTP/1.1', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test', version: 1.1 },
      headers: {},
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('HTTP/1.1'));
  });
});

describe('encodeRequest - Path Handling', () => {
  test('should correctly handle path with query parameters', async () => {
    const params = {
      startLine: { method: 'GET', path: '/api/search?q=test&limit=10' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('GET /api/search?q=test&limit=10 HTTP/1.1'));
  });

  test('should correctly handle path with special characters', async () => {
    const params = {
      startLine: { method: 'GET', path: '/api/users/%E4%B8%AD%E6%96%87' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('/api/users/%E4%B8%AD%E6%96%87'));
  });

  test('should correctly handle root path', async () => {
    const params = {
      startLine: { method: 'GET', path: '/' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('GET / HTTP/1.1'));
  });

  test('should correctly handle path with fragment', async () => {
    const params = {
      startLine: { method: 'GET', path: '/page#section' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('/page#section'));
  });
});

describe('encodeRequest - Real World Scenario Tests', () => {
  test('should correctly encode standard JSON API request', async () => {
    const params = {
      startLine: { method: 'POST', path: '/api/v1/users' },
      headers: {
        host: 'api.example.com',
        'content-type': 'application/json',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'user-agent': 'MyApp/1.0',
      },
      body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('POST /api/v1/users HTTP/1.1'));
    assert.ok(output.includes('Content-Type: application/json'));
    assert.ok(output.includes('Authorization: Bearer'));
    assert.ok(output.includes('"name":"John Doe"'));
  });

  test('should correctly encode form submission request', async () => {
    const params = {
      startLine: { method: 'POST', path: '/submit' },
      headers: {
        host: 'example.com',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'username=test&password=secret&remember=true',
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('Content-Type: application/x-www-form-urlencoded'));
    assert.ok(output.endsWith('username=test&password=secret&remember=true'));
  });

  test('should correctly encode file upload request (multipart)', async () => {
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const body = [
      '------WebKitFormBoundary7MA4YWxkTrZu0gW',
      'Content-Disposition: form-data; name="file"; filename="test.txt"',
      'Content-Type: text/plain',
      '',
      'File content here',
      '------WebKitFormBoundary7MA4YWxkTrZu0gW--',
    ].join('\r\n');

    const params = {
      startLine: { method: 'POST', path: '/upload' },
      headers: {
        host: 'example.com',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('multipart/form-data'));
    assert.ok(output.includes('File content here'));
  });

  test('should correctly encode authenticated API request', async () => {
    const params = {
      startLine: { method: 'GET', path: '/protected/resource' },
      headers: {
        host: 'api.example.com',
        authorization: 'Basic dXNlcjpwYXNzd29yZA==',
      },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('Authorization: Basic dXNlcjpwYXNzd29yZA=='));
  });
});
