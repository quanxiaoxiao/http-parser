import { type ContentLengthState } from './decodeHttp/parseContentLength.js';
import { createRequestState, parseRequest,type RequestState } from './decodeHttp/parseRequest.js';

function demoContentLength() {
  console.log('--- Demo A: 解析 Content-Length 请求 ---');

  let state: RequestState = createRequestState();

  const rawRequest =
    'POST /api/data HTTP/1.1\r\n' +
    'Host: example.com\r\n' +
    'Content-Length: 5\r\n' +
    '\r\n' +
    '{"a":"xxxx"}';

  const requestBuffer = Buffer.from(rawRequest, 'utf-8');

  const chunk1 = requestBuffer.subarray(0, requestBuffer.length - 20);
  console.log(`\n[Chunk 1: ${chunk1.length} bytes]`);

  state = parseRequest(state, chunk1);

  console.log(`Phase after Chunk 1: ${state.phase}`); // HEADERS -> BODY_CONTENT_LENGTH
  console.log(`Finished after Chunk 1: ${state.finished}`); // false

  const chunk2 = requestBuffer.subarray(requestBuffer.length - 20);
  console.log(`\n[Chunk 2: ${chunk2.length} bytes]`);

  state = parseRequest(state, chunk2);

  console.log(`Phase after Chunk 2: ${state.phase}`); // BODY_CONTENT_LENGTH (但 finished 为 true)
  console.log(`Finished after Chunk 2: ${state.finished}`); // true

  console.log('\n--- 解析结果 ---');
  console.log('Start Line:', state.startLine);
  console.log('Method:', state.startLine?.method); // POST
  console.log('Content-Length Body Data:', (state.bodyState as ContentLengthState)); // {"a":1}
}

demoContentLength();
