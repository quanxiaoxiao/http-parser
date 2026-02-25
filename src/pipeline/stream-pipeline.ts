import fs from 'node:fs';

import {
  type HttpRequestState,
  type HttpResponseState,
  isMessageFinished,
} from './decode/message.js';
import {
  createPipelineState,
  getHttpState,
  type PipelineState,
  pushRequest,
  pushResponse,
} from './decode/pipeline.js';

async function streamProcessFile(filePath: string) {
  const readStream = fs.createReadStream(filePath);

  // 创建 pipeline 状态
  let requestState: PipelineState<HttpRequestState> = createPipelineState();
  let responseState: PipelineState<HttpResponseState> = createPipelineState();

  // 使用 stream 的方式逐 chunk 推入 pipeline
  readStream.on('data', (chunk: Buffer) => {
    requestState = pushRequest(requestState, chunk);
  });

  await new Promise<void>((resolve, reject) => {
    readStream.on('end', () => resolve());
    readStream.on('error', reject);
  });

  const requestHttpState = getHttpState(requestState)!;

  if (!requestState.httpState || !isMessageFinished(requestState.httpState)) {
    console.log('Request incomplete or error:', requestHttpState.error?.message);
    return;
  }

  console.log('Request parsed events:', requestHttpState.events);

  // 处理 response
  responseState = pushResponse(responseState, requestHttpState.buffer);
  const resHttpState = getHttpState(responseState)!;

  console.log('Response events:', resHttpState.events);
  console.log('Response error:', resHttpState.error?.message ?? 'none');
}

const testFile = '/Users/huzhedong/mylib/http-utils/_data/example.http';
await streamProcessFile(testFile);
