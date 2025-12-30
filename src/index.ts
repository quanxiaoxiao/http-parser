import * as assert from 'node:assert';
import { setTimeout } from 'node:timers/promises';

import { decodeRequest } from './decode/message.js';
import { encodeRequest } from './encode/message.js';

async function example1() {
  const request = encodeRequest({
    startLine: {
      method: 'POST',
      path: '/api/test1',
    },
    headers: {
      Host: 'example.com',
    },
    body: Buffer.from('aaa'),
  });

  let requestState = null;

  for await (const chunk of request) {
    requestState = decodeRequest(requestState, chunk);
  }
  assert.ok(requestState!.finished);
  assert.strictEqual(requestState!.startLine!.raw, 'POST /api/test1 HTTP/1.1');
  assert.deepStrictEqual(requestState!.headersState!.headers, { host: 'example.com', 'content-length': '3' });
  assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), 'aaa');
}

async function example2() {
  const request = encodeRequest({
    startLine: {
      method: 'GET',
      path: '/api/test2',
    },
    headers: {
      Host: 'example.com',
    },
    body: 'bbb',
  });

  let requestState = null;

  for await (const chunk of request) {
    requestState = decodeRequest(requestState, chunk);
  }
  assert.ok(requestState!.finished);
  assert.strictEqual(requestState!.startLine!.raw, 'GET /api/test2 HTTP/1.1');
  assert.deepStrictEqual(requestState!.headersState!.headers, { host: 'example.com', 'content-length': '3' });
  assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), 'bbb');
}

async function example3() {
  const request = encodeRequest({
    startLine: {
      method: 'GET',
      path: '/api/test3',
    },
    headers: {
      Host: 'example.com',
    },
  });

  let requestState = null;

  for await (const chunk of request) {
    requestState = decodeRequest(requestState, chunk);
  }
  assert.ok(requestState!.finished);
  assert.strictEqual(requestState!.startLine!.raw, 'GET /api/test3 HTTP/1.1');
  assert.deepStrictEqual(requestState!.headersState!.headers, { host: 'example.com' });
  assert.strictEqual(requestState!.bodyState, null);
}

async function example4() {
  async function* generateData(): AsyncIterable<Buffer> {
    await setTimeout(100);
    yield Buffer.from('111');
    await setTimeout(100);
    yield Buffer.from('222');
  }

  const request = encodeRequest({
    startLine: {
      method: 'POST',
      path: '/api/upload',
    },
    headers: {
      Host: 'example.com',
    },
    body: generateData(),
  });

  let requestState = null;

  for await (const chunk of request) {
    requestState = decodeRequest(requestState, chunk);
  }
  assert.ok(requestState!.finished);
  assert.strictEqual(requestState!.startLine!.raw, 'POST /api/upload HTTP/1.1');
  assert.deepStrictEqual(requestState!.headersState!.headers, { host: 'example.com', 'transfer-encoding': 'chunked' });
  assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), '111222');
}

await example1();
await example2();
await example3();
await example4();
