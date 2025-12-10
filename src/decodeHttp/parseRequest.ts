import { Buffer } from 'node:buffer';

import { type RequestStartLine } from './parseRequestLine.js';

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
