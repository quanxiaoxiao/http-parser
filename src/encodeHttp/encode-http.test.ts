import * as assert from 'node:assert';
import { describe,test } from 'node:test';
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
      headers: { host: 'localhost' },
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
      version: '1.1',
    },
    headers: {
      host: 'example.com',
      'User-Agent': 'test-client',
    },
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
      version: '1.1',
    },
    headers: {
      host: 'example.com',
      'content-Type': 'application/json',
    },
    body: '{"name":"test"}',
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
      host: 'example.com',
    },
    body: bodyBuffer,
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
      host: 'example.com',
    },
    body: generateBody(),
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
      host: 'example.com',
    },
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
      host: 'example.com',
      connection: 'keep-alive',
      'keep-alive': 'timeout=5',
    },
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
      host: 'example.com',
    },
    body: 'test body',
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
      host: 'example.com',
    },
    body: '',
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
      host: 'example.com',
      accept: 'application/json',
    },
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

describe('encodeHttpRequest - AsyncIterable (Stream) 专项测试', () => {

  const defaultStartLine = { method: 'POST', target: '/upload', version: 1.1 };

  test('应该将异步流正确编码为分块传输格式', async () => {
    const chunks = [
      Buffer.from('hello '),
      Buffer.from('world'),
    ];
    const stream = createMockStream(chunks);

    const generator = encodeHttpRequest({
      startLine: defaultStartLine,
      headers: { host: 'api.test' },
      body: stream,
    });

    const parts: Buffer[] = [];
    for await (const chunk of generator) {
      parts.push(chunk);
    }

    const fullOutput = Buffer.concat(parts).toString();

    // 1. 验证必须包含 Transfer-Encoding: chunked (由 applyFramingHeaders 触发)
    assert.match(fullOutput, /transfer-encoding: chunked/i);

    // 2. 验证 Body 内容是否按顺序到达
    assert.match(fullOutput, /hello /);
    assert.match(fullOutput, /world/);

    // 3. 验证结构：Header 块应该在 Body 块之前产出
    const headerIndex = fullOutput.indexOf('\r\n\r\n');
    const bodyIndex = fullOutput.indexOf('hello ');
    assert.ok(headerIndex < bodyIndex, 'Header 必须在 Body 之前发送');
  });

  test('处理带有延迟的异步流，确保非阻塞', async () => {
    const chunks = [Buffer.from('slow'), Buffer.from('data')];
    // 每个 chunk 延迟 50ms
    const stream = createMockStream(chunks, 50);

    const startTime = Date.now();
    const generator = encodeHttpRequest({
      startLine: defaultStartLine,
      headers: {},
      body: stream,
    });

    let receivedBody = '';
    for await (const chunk of generator) {
      receivedBody += chunk.toString();
    }
    const duration = Date.now() - startTime;

    assert.ok(duration >= 100, `应该至少耗时 100ms，实际耗时: ${duration}ms`);
    assert.match(receivedBody, /slow/);
    assert.match(receivedBody, /data/);
  });

  test('当异步流为空时，依然应该发送正确的 Header', async () => {
    async function* emptyStream() {}

    const generator = encodeHttpRequest({
      startLine: defaultStartLine,
      headers: {},
      body: emptyStream(),
    });

    const parts: Buffer[] = [];
    for await (const chunk of generator) {
      parts.push(chunk);
    }

    const fullOutput = Buffer.concat(parts).toString();

    // 即使 body 为空，只要它是 AsyncIterable，通常也会被标记为 chunked
    assert.match(fullOutput, /transfer-encoding: chunked/i);
  });

  test('当上游异步流抛出错误时，Generator 应该能捕获异常', async () => {
    async function* errorStream() {
      yield Buffer.from('good data');
      throw new Error('Stream Interrupted');
    }

    const generator = encodeHttpRequest({
      startLine: defaultStartLine,
      headers: {},
      body: errorStream(),
    });

    try {
      for await (const chunk of generator) {
        // 可能会收到一部分数据
      }
      assert.fail('应该抛出上游流的错误');
    } catch (err: any) {
      assert.strictEqual(err.message, 'Stream Interrupted');
    }
  });

  test('验证 Headers 产出的原子性', async () => {
    // 这是一个关键测试：确保在开始拉取 Body 之前，Headers 已经全部 yield 出来了
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

    // 第一次和第二次 yield 应该是请求行和 Headers
    const firstYield = await generator.next();
    const secondYield = await generator.next();

    assert.strictEqual(bodyPulled, false, '在 Headers 发送完毕前不应拉取 Body 数据');

    // 第三次开始才是 Body
    await generator.next();
    assert.strictEqual(bodyPulled, true, '此时应该已经开始拉取 Body');
  });

});
