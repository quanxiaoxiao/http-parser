import { open } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';

import { encodeHttpRequest } from './encode/message.js';

async function exampleStreamUpload() {
  async function* generateData(): AsyncIterable<Buffer> {
    const file = await open(path.join(process.cwd(), 'package-lock.json'));
    for await (const chunk of file.readableWebStream()) {
      yield chunk;
      await setTimeout(1000);
    }
    await file.close();
  }

  const request = encodeHttpRequest({
    startLine: {
      method: 'POST',
      path: '/api/upload',
    },
    headers: {
      Host: 'example.com',
    },
    body: generateData(),
  });

  for await (const chunk of request) {
    console.log(chunk.toString());
  }
}

await exampleStreamUpload();
