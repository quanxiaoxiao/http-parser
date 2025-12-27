import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';

import { decodeRequest } from './decode/message.js';
import { encodeRequest } from './encode/message.js';

async function exampleStreamUpload() {
  async function* generateData(): AsyncIterable<Buffer> {
    const file = await open(path.join(process.cwd(), 'package-lock.json'));
    for await (const chunk of file.readableWebStream()) {
      yield chunk;
      await setTimeout(100);
    }
    await file.close();
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
  assert.strictEqual(Buffer.concat(requestState!.bodyState!.bodyChunks).toString(), readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf-8'));
}

await exampleStreamUpload();
