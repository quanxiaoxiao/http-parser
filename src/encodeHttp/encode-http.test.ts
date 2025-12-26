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
      startLine: { method: 'GET', path: '/api/users', version: '1.1' },
      headers: { host: 'example.com', 'User-Agent': 'test-client' },
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('GET /api/users HTTP/1.1'));
    assert.ok(output.includes('Host: example.com'));
    assert.ok(output.includes('User-Agent: test-client'));
    assert.ok(output.endsWith('\r\n\r\n'));
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

  test('应该正确编码带字符串 Body 的 POST 请求2', async () => {
    const params = {
      startLine: { method: 'POST', path: '/api/data', version: 1.1 },
      headers: { 'content-type': 'application/json' },
      body: '{"foo":"bar"}',
    };

    const output = await encodeAndCollect(params);
    assert.strictEqual(output.toString(), 'POST /api/data HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"foo":"bar"}');
  });

  test('应该正确编码带字符串 Body 的 POST 请求3', async () => {
    const params = {
      startLine: { method: 'POST', path: '/api/data', version: 1.1 },
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"foo":"bar"}'),
    };

    const output = await encodeAndCollect(params);
    assert.strictEqual(output.toString(), 'POST /api/data HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"foo":"bar"}');
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
});

describe('encodeHttpRequest - Headers 处理', () => {
  test('应该移除 hop-by-hop headers', async () => {
    const params = {
      startLine: { method: 'GET', path: '/' },
      headers: {
        host: 'example.com',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
      },
    };

    const output = await encodeAndCollect(params);

    assert.ok(!output.includes('Connection:'));
    assert.ok(!output.includes('Keep-Alive:'));
  });

  test('应该自动添加 Content-Length（字符串 Body）', async () => {
    const params = {
      startLine: { method: 'POST', path: '/data' },
      headers: { host: 'example.com' },
      body: 'test body',
    };

    const output = await encodeAndCollect(params);

    assert.ok(output.includes('Content-Length:'));
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
});
