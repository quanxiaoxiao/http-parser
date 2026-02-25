import { Buffer } from 'node:buffer';

import {
  DecodeErrors,
  HttpDecodeError,
  HttpDecodeErrorCode,
} from './errors.js';
import { getHeaderValues } from '../headers/headers.js';
import {
  DEFAULT_CHUNKED_BODY_LIMITS,
  DEFAULT_FIXED_LENGTH_BODY_LIMITS,
  DEFAULT_HEADER_LIMITS,
  DEFAULT_START_LINE_LIMITS,
  HttpDecodeState,
} from '../specs.js';
import type {
  ChunkedBodyLimits,
  DecodeLineResult,
  FixedLengthBodyLimits,
  HeaderLimits,
  Headers,
  RequestStartLine,
  ResponseStartLine,
  StartLineLimits,
} from '../types.js';
import { parseInteger } from '../utils/number.js';
import {
  type ChunkedBodyStateData,
  createChunkedBodyState,
  decodeChunkedBody,
  isChunkedBodyFinished,
} from './chunked-body.js';
import {
  createFixedLengthBodyState,
  decodeFixedLengthBody,
  type FixedLengthBodyStateData,
  isFixedLengthBodyFinished,
} from './fixed-length-body.js';
import {
  createHeadersStateData,
  decodeHeaders,
  type HeadersStateData,
  isHeadersFinished,
} from './headers.js';
import { decodeHttpLine } from './http-line.js';
import {
  decodeRequestStartLine,
  decodeResponseStartLine,
} from './start-line.js';

const EMPTY_BUFFER = Buffer.alloc(0);

type BodyStrategy =
  | { type: 'chunked' }
  | { type: 'fixed'; length: number }
  | { type: 'close-delimited' }
  | { type: 'upgrade'; protocol?: string }
  | { type: 'none' };

interface HttpParserConfig {
  headerLimits: HeaderLimits;
  startLineLimits: StartLineLimits;
  chunkedBodylimits: ChunkedBodyLimits;
  fixedLengthBodyLimits: FixedLengthBodyLimits;
}

export type HttpDecodeEvent =
  | { type: 'phase-enter'; state: HttpDecodeState, reason?: string; value?: number; limits?: Record<string, number> }
  | { type: 'start-line-complete'; raw: string }
  | { type: 'start-line-parsed'; method?: string; path?: string; version: number; statusCode?: number; statusText?: string }
  | { type: 'header-line'; name: string; value: string; index: number; }
  | { type: 'headers-complete'; count: number }
  | { type: 'headers-normalized'; headers: Headers }
  | { type: 'body-data'; size: number; offset: number }
  | { type: 'body-complete'; totalSize: number }
  | { type: 'message-complete' };

function isBodyFinished(state: ChunkedBodyStateData | FixedLengthBodyStateData): boolean {
  if (state.type === 'fixed') {
    return isFixedLengthBodyFinished(state as FixedLengthBodyStateData);
  }
  return isChunkedBodyFinished(state as ChunkedBodyStateData);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addEvent(state: HttpState, event: HttpDecodeEvent): void {
  state.events.push(event);
}

function forkState(previous: HttpState): HttpState {
  return {
    ...previous,
    events: [],
  };
}

function moveRemainingBuffer<T extends { buffer: Buffer }>(
  from: T,
  to: { buffer: Buffer },
) {
  to.buffer = from.buffer;
  from.buffer = EMPTY_BUFFER;
}

function transition(state: HttpState, next: HttpDecodeState): void {
  if (state.state === next) {
    return;
  }
  state.state = next;
  addEvent(state, {
    type: 'phase-enter',
    state: next,
  });
  if (next === HttpDecodeState.FINISHED) {
    addEvent(state, {
      type: 'message-complete',
    });
  }
}

function handleTransferEncoding(
  transferEncodingValues: string[],
  contentLengthValues: string[] | undefined,
): BodyStrategy {
  if (transferEncodingValues.length > 1) {
    throw DecodeErrors.multipleTransferEncoding();
  }

  const encoding = transferEncodingValues[0]!.toLowerCase();

  if (encoding !== 'chunked') {
    throw DecodeErrors.unsupportedTransferEncoding(encoding);
  }

  if (contentLengthValues?.length) {
    throw DecodeErrors.contentLengthWithTransferEncoding();
  }

  return { type: 'chunked' };
}

function validateContentLength(length: number | null): asserts length is number {
  if (length == null || length < 0) {
    throw DecodeErrors.invalidContentLengthHeader();
  }

  if (!Number.isSafeInteger(length)) {
    throw DecodeErrors.contentLengthOverflow();
  }
}

function handleContentLength(contentLengthValues: string[]): BodyStrategy {
  if (contentLengthValues.length !== 1) {
    throw DecodeErrors.multipleContentLengthHeaders();
  }

  const length = parseInteger(contentLengthValues[0] as string);

  validateContentLength(length);

  if (length === 0) {
    return { type: 'none' };
  }

  return {
    type: 'fixed',
    length,
  };
}

export function decideBodyStrategy(state: HttpState): BodyStrategy {
  const headersState = state.parsing.headers;
  if (!headersState) {
    throw new Error('decideBodyStrategy called before headers parsed');
  }

  const { headers } = headersState;
  const contentLengthValues = getHeaderValues(headers, 'content-length');
  const transferEncodingValues = getHeaderValues(headers, 'transfer-encoding');

  // const isRequest = state.messageType === 'request';
  const isResponse = state.messageType === 'response';

  if (isResponse) {
    const startLine = state.parsing.startLine as ResponseStartLine;
    const statusCode = startLine.statusCode!;
    if (statusCode === 101) {
      return { type: 'upgrade' };
    }
  }

  if (transferEncodingValues?.length) {
    return handleTransferEncoding(transferEncodingValues, contentLengthValues);
  }

  if (contentLengthValues?.length) {
    return handleContentLength(contentLengthValues);
  }

  if (isResponse) {
    return { type: 'close-delimited' };
  }
  return { type: 'none' };
}

type StartLineMap = {
  request: RequestStartLine;
  response: ResponseStartLine;
};

export interface HttpState<T extends 'request' | 'response' = 'request' | 'response'> {
  readonly messageType: T;
  readonly config: HttpParserConfig;
  state: HttpDecodeState;
  buffer: Buffer;
  error?: Error,
  parsing: {
    startLine: StartLineMap[T] | null;
    headers: HeadersStateData | null;
    body: ChunkedBodyStateData | FixedLengthBodyStateData | null;
  },
  events: HttpDecodeEvent[];
}

export type HttpRequestState = HttpState<'request'>;
export type HttpResponseState = HttpState<'response'>;

export function createHttpState(messageType: 'request' | 'response'): HttpState {
  return {
    messageType,
    state: HttpDecodeState.START_LINE,
    config: {
      headerLimits: DEFAULT_HEADER_LIMITS,
      startLineLimits: DEFAULT_START_LINE_LIMITS,
      chunkedBodylimits: DEFAULT_CHUNKED_BODY_LIMITS,
      fixedLengthBodyLimits: DEFAULT_FIXED_LENGTH_BODY_LIMITS,
    },
    buffer: EMPTY_BUFFER,
    parsing: {
      startLine: null,
      headers: null,
      body: null,
    },
    events: [],
  };
};

export function createRequestState(): HttpRequestState {
  return createHttpState('request') as HttpRequestState;
}

export function createResponseState(): HttpResponseState {
  return createHttpState('response') as HttpResponseState;
}

function handleStartLineState(state: HttpState): void {
  const parseLineFunction = state.messageType === 'request'
    ? decodeRequestStartLine
    : decodeResponseStartLine;
  let lineResult: DecodeLineResult | null;
  try {
    lineResult = decodeHttpLine(state.buffer, 0, { maxLineLength: state.config.startLineLimits.maxStartLineBytes });
  } catch (error) {
    if (error instanceof HttpDecodeError) {
      if (error.code === HttpDecodeErrorCode.LINE_TOO_LARGE) {
        throw DecodeErrors.startLineTooLarge();
      }
      throw error;
    }
    throw DecodeErrors.httpParseFailedAtState('start-line', formatError(error));
  }

  if (!lineResult) {
    return;
  }

  const lineBuf = lineResult.line;
  const startLine = parseLineFunction(lineBuf.toString(), state.config.startLineLimits);
  state.parsing.startLine = startLine;
  state.buffer = state.buffer.subarray(lineResult.bytesConsumed);

  addEvent(state, {
    type: 'start-line-complete',
    raw: startLine.raw!,
  });

  if (state.messageType === 'request') {
    const requestStartLine = state.parsing.startLine as RequestStartLine;
    addEvent(state, {
      type: 'start-line-parsed',
      version: requestStartLine.version!,
      path: requestStartLine.path!,
      method: requestStartLine.method!,
    });
  } else {
    const responseStartLine = state.parsing.startLine as ResponseStartLine;
    addEvent(state, {
      type: 'start-line-parsed',
      version: responseStartLine.version!,
      statusCode: responseStartLine.statusCode!,
      statusText: responseStartLine.statusText!,
    });
  }

  transition(state, HttpDecodeState.HEADERS);
}

function handleHeadersStateData(state: HttpState): void {
  state.parsing.headers ??= createHeadersStateData(state.config.headerLimits);
  const previousLineCount = state.parsing.headers.rawHeaders.length;
  state.parsing.headers = decodeHeaders(state.parsing.headers, state.buffer);

  for (let index = previousLineCount; index < state.parsing.headers.rawHeaders.length; index++) {
    const headerLine = state.parsing.headers.rawHeaders[index]!;

    addEvent(state, {
      type: 'header-line',
      name: headerLine[0],
      value: headerLine[1],
      index,
    });
  }

  if (!isHeadersFinished(state.parsing.headers)) {
    state.buffer = EMPTY_BUFFER;
    return;
  }

  addEvent(state, {
    type: 'headers-complete',
    count: state.parsing.headers.rawHeaders.length,
  });

  addEvent(state, {
    type: 'headers-normalized',
    headers: state.parsing.headers.headers,
  });

  const bodyStrategy = decideBodyStrategy(state);
  switch (bodyStrategy.type) {
    case 'chunked': {
      state.parsing.body = createChunkedBodyState(state.config.chunkedBodylimits);
      transition(state, HttpDecodeState.BODY_CHUNKED);
      break;
    }
    case 'fixed': {
      state.parsing.body = createFixedLengthBodyState(bodyStrategy.length, state.config.fixedLengthBodyLimits);
      transition(state, HttpDecodeState.BODY_FIXED_LENGTH);
      break;
    }
    default: {
      transition(state, HttpDecodeState.FINISHED);
    }
  }
  moveRemainingBuffer(state.parsing.headers, state);
}

function handleBodyState<T extends ChunkedBodyStateData | FixedLengthBodyStateData>(
  state: HttpState,
  parser: (bodyState: T, buffer: Buffer) => T,
): void {
  const bodyState = parser(
    state.parsing.body as T,
    state.buffer,
  );

  const previousSize = state.parsing.body!.decodedBodyBytes;
  const consumed = bodyState.decodedBodyBytes - previousSize;
  if (consumed > 0) {
    addEvent(state, {
      type: 'body-data',
      size: consumed,
      offset: previousSize,
    });
  }
  if (!isBodyFinished(bodyState)) {
    state.buffer = EMPTY_BUFFER;
    state.parsing.body = bodyState;
    return;
  }

  addEvent(state, {
    type: 'body-complete',
    totalSize: bodyState.decodedBodyBytes,
  });

  state.parsing.body = bodyState;
  moveRemainingBuffer(state.parsing.body, state);
  transition(state, HttpDecodeState.FINISHED);
}

const PHASE_HANDLERS: Record<HttpDecodeState, (state: HttpState) => void> = {
  [HttpDecodeState.START_LINE]: handleStartLineState,
  [HttpDecodeState.HEADERS]: handleHeadersStateData,
  [HttpDecodeState.BODY_CHUNKED]: (state) => handleBodyState(state, decodeChunkedBody),
  [HttpDecodeState.BODY_FIXED_LENGTH]: (state) => handleBodyState(state, decodeFixedLengthBody),
  [HttpDecodeState.BODY_CLOSE_DELIMITED]: () => {
    throw DecodeErrors.bodyCloseDelimitedNotImplemented();
  },
  [HttpDecodeState.UPGRADE]: () => {
    throw DecodeErrors.upgradeProtocolNotImplemented();
  },
  [HttpDecodeState.FINISHED]: () => {},
};

function runStateMachine(state: HttpState): void {
  while (state.state !== HttpDecodeState.FINISHED) {
    const previous = state.state;
    PHASE_HANDLERS[state.state](state);
    if (state.state === previous) {
      break;
    }
  }
}

function decodeHttp(
  previous: HttpState,
  input: Buffer,
): HttpState {
  if (previous.state === HttpDecodeState.FINISHED) {
    throw new Error('Decoding already finished');
  }

  if (previous.error) {
    throw new Error(`Decoding encountered error: "${previous.error.message}"`);
  }

  const next: HttpState = forkState(previous);
  if (input.length > 0) {
    next.buffer = Buffer.concat([next.buffer, input]);
  }

  try {
    runStateMachine(next);
  } catch (error) {
    next.error = error instanceof HttpDecodeError
      ? error
      : DecodeErrors.internalError(error instanceof Error ? error.message : String(error));
    next.state = HttpDecodeState.FINISHED;
  }

  return next;
}

export function decodeRequest(
  previous: HttpRequestState | null,
  input: Buffer,
): HttpRequestState {
  const previousState = previous ?? createRequestState();
  return decodeHttp(previousState, input) as HttpRequestState;
}

export function decodeResponse(
  previous: HttpResponseState | null,
  input: Buffer,
): HttpResponseState {
  const previousState = previous ?? createResponseState();
  return decodeHttp(previousState, input) as HttpResponseState;
}

export function isMessageFinished(state: HttpState) {
  return state.state === HttpDecodeState.FINISHED;
}
