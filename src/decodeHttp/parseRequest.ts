import { Buffer } from 'node:buffer';

import { type RequestStartLine } from './parseRequestLine.js';

/*
┌──────────────────────────────┐
│ Start-Line                   │  ← GET /path HTTP/1.1
├──────────────────────────────┤
│ Headers                      │  ← Host, UA, Accept, ...
├──────────────────────────────┤
│ (空行)                       │
├──────────────────────────────┤
│ Body (可选)                  │  ← JSON / Form / File
├──────────────────────────────┤
│ Trailer Headers (可选)       │  ← chunked 的情况
└──────────────────────────────┘
*/

type RequestPhase = 'STARTLINE' | 'HEADERS' | 'CRLF' | 'BODY';

export interface RequestState {
  phase: RequestPhase;
  buffer: Buffer;
  finished: boolean;
  startLine: RequestStartLine | null;
}

export function createRequestState(): RequestState {
  return {
    phase: 'STARTLINE',
    buffer: Buffer.alloc(0),
    finished: false,
    startLine: null,
  };
}
