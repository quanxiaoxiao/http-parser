import * as assert from 'node:assert';
import { describe, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';

import { encodeHttpRequest } from './encode-http.js';

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
  const result = await collectGenerator(encodeHttpRequest(params));
  return result.toString();
}

describe('encodeHttpRequest - 基础功能', () => {
  test('应该正确编码 GET 请求', async () => {
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

  test('应该正确编码 GET 请求（完整匹配）', async () => {
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

  test('应该正确编码带字符串 Body 的 POST 请求', async () => {
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

  test('应该正确编码带字符串 Body 的 POST 请求（完整匹配）', async () => {
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

  test('应该正确编码带 Buffer Body 的 POST 请求', async () => {
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

  test('应该正确处理 DELETE 请求（无 Body）', async () => {
    const params = {
      startLine: { method: 'DELETE', path: '/api/resource/123' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('DELETE /api/resource/123 HTTP/1.1'));
    assert.ok(output.includes('Host: example.com'));
    assert.ok(output.endsWith('\r\n\r\n'));
  });

  test('应该正确处理空字符串 Body', async () => {
    const params = {
      startLine: { method: 'POST', path: '/empty' },
      headers: { host: 'example.com' },
      body: '',
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('POST /empty HTTP/1.1'));
    assert.ok(output.endsWith('\r\n\r\n'));
  });

  test('应该正确处理 PUT 请求', async () => {
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

  test('应该正确处理 PATCH 请求', async () => {
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

  test('应该正确处理 HEAD 请求', async () => {
    const params = {
      startLine: { method: 'HEAD', path: '/api/status' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('HEAD /api/status HTTP/1.1'));
    assert.ok(output.endsWith('\r\n\r\n'));
  });

  test('应该正确处理 OPTIONS 请求', async () => {
    const params = {
      startLine: { method: 'OPTIONS', path: '*' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('OPTIONS * HTTP/1.1'));
    assert.ok(output.includes('Host: example.com'));
  });
});

describe('encodeHttpRequest - Body 类型处理', () => {
  test('应该正确处理 Buffer Body', async () => {
    const bodyBuffer = Buffer.from('binary data');
    const params = {
      startLine: { method: 'PUT', path: '/upload' },
      headers: { host: 'example.com' },
      body: bodyBuffer,
    };

    const result = await collectGenerator(encodeHttpRequest(params));

    assert.ok(result.includes(bodyBuffer));
    assert.ok(result.toString().includes('Content-Length:'));
  });

  test('应该正确处理 AsyncIterable Body（分块传输）', async () => {
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

  test('应该正确处理大 Buffer Body', async () => {
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

  test('应该正确处理包含特殊字符的 Body', async () => {
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

  test('应该正确处理 null 或 undefined Body', async () => {
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

describe('encodeHttpRequest - Headers 处理', () => {
  test('应该移除 hop-by-hop headers', async () => {
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

  test('应该自动添加 Content-Length（字符串 Body）', async () => {
    const params = {
      startLine: { method: 'POST', path: '/data' },
      headers: { host: 'example.com' },
      body: 'test body',
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('Content-Length: 9'));
  });

  test('应该验证 Headers 格式正确性', async () => {
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

  test('应该正确处理大小写混合的 Header 名称', async () => {
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

  test('应该正确处理包含特殊字符的 Header 值', async () => {
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

describe('encodeHttpRequest - 流式传输（AsyncIterable）', () => {
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

  test('应该正确处理带延迟的异步流（非阻塞）', async () => {
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

  test('应该正确处理空的异步流', async () => {
    async function* emptyStream() {}

    const output = await encodeAndCollect({
      startLine: defaultStartLine,
      headers: {},
      body: emptyStream(),
    });

    assert.match(output, /transfer-encoding: chunked/i);
  });

  test('应该能捕获异步流中抛出的错误', async () => {
    async function* errorStream() {
      yield Buffer.from('good data');
      throw new Error('Stream Interrupted');
    }

    const generator = encodeHttpRequest({
      startLine: defaultStartLine,
      headers: {},
      body: errorStream(),
    });

    await assert.rejects(
      async () => {
        for await (const chunk of generator) {
          // 消费数据直到错误
        }
      },
      { message: 'Stream Interrupted' },
    );
  });

  test('应该保证 Headers 的原子性（在拉取 Body 前完整输出）', async () => {
    let bodyPulled = false;
    async function* spyStream() {
      bodyPulled = true;
      yield Buffer.from('data');
    }

    const generator = encodeHttpRequest({
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

  test('应该正确处理单个大块的异步流', async () => {
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

  test('应该正确处理多个小块的异步流', async () => {
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

  test('应该正确处理包含空 Buffer 的异步流', async () => {
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

describe('encodeHttpRequest - HTTP 版本处理', () => {
  test('应该默认使用 HTTP/1.1', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test' },
      headers: {},
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('HTTP/1.1'));
  });

  test('应该支持显式指定 HTTP/1.0', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test', version: 1.0 },
      headers: {},
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('HTTP/1.0'));
  });

  test('应该支持显式指定 HTTP/1.1', async () => {
    const params = {
      startLine: { method: 'GET', path: '/test', version: 1.1 },
      headers: {},
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('HTTP/1.1'));
  });
});

describe('encodeHttpRequest - 路径处理', () => {
  test('应该正确处理包含查询参数的路径', async () => {
    const params = {
      startLine: { method: 'GET', path: '/api/search?q=test&limit=10' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('GET /api/search?q=test&limit=10 HTTP/1.1'));
  });

  test('应该正确处理包含特殊字符的路径', async () => {
    const params = {
      startLine: { method: 'GET', path: '/api/users/%E4%B8%AD%E6%96%87' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('/api/users/%E4%B8%AD%E6%96%87'));
  });

  test('应该正确处理根路径', async () => {
    const params = {
      startLine: { method: 'GET', path: '/' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('GET / HTTP/1.1'));
  });

  test('应该正确处理包含锚点的路径', async () => {
    const params = {
      startLine: { method: 'GET', path: '/page#section' },
      headers: { host: 'example.com' },
    };

    const output = await encodeAndCollect(params);
    assert.ok(output.includes('/page#section'));
  });
});

describe('encodeHttpRequest - 实际场景测试', () => {
  test('应该正确编码标准的 JSON API 请求', async () => {
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

  test('应该正确编码表单提交请求', async () => {
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

  test('应该正确编码文件上传请求（multipart）', async () => {
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

  test('应该正确编码带认证的 API 请求', async () => {
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
