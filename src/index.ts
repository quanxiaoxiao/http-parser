import { encodeHttpRequest } from './encodeHttp/encode-http.js';

async function exampleSimpleGet() {
  const request = encodeHttpRequest({
    startLine: {
      method: 'GET',
      path: '/api/users',
    },
    headers: {
      Host: 'example.com',
      'User-Agent': 'MyClient/1.0',
    },
    // 没有 body
  });

  // 收集所有数据块
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const fullRequest = Buffer.concat(chunks);
  console.log(fullRequest.toString());
}

async function examplePostWithString() {
  const request = encodeHttpRequest({
    startLine: {
      method: 'POST',
      path: '/api/users',
    },
    headers: {
      Host: 'example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'John', age: 30 }),
  });

  for await (const chunk of request) {
    // 直接发送到 socket
    // socket.write(chunk);
    console.log(chunk.toString());
  }
}

async function examplePostWithBuffer() {
  const bodyData = Buffer.from('Hello World', 'utf-8');

  const request = encodeHttpRequest({
    startLine: {
      method: 'POST',
      path: '/api/data',
    },
    headers: {
      Host: 'example.com',
      'Content-Type': 'text/plain',
    },
    body: bodyData,
  });

  for await (const chunk of request) {
    console.log(chunk.toString());
  }
}

async function exampleStreamUpload() {
  async function* generateData(): AsyncIterable<Buffer> {
    yield Buffer.from('chunk1');
    await new Promise(resolve => setTimeout(resolve, 1000));
    yield Buffer.from('chunk2');
    await new Promise(resolve => setTimeout(resolve, 1000));
    yield Buffer.from('chunk3');
  }

  const request = encodeHttpRequest({
    startLine: {
      method: 'POST',
      path: '/api/upload',
    },
    headers: {
      Host: 'example.com',
      'Transfer-Encoding': 'chunked',
    },
    body: generateData(),
  });

  for await (const chunk of request) {
    console.log(chunk.toString());
  }
}

await exampleSimpleGet();
await examplePostWithString();
await examplePostWithBuffer();
await exampleStreamUpload();
