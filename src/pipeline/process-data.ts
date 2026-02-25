/* processHttpFilesPipe.ts */
import type { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type HttpRequestState,
  type HttpResponseState,
} from '../decode/message.js';
import {
  createPipelineState,
  getHttpState,
  isFinished,
  pipe,
  type PipelineState,
  pushRequest,
  pushResponse,
} from '../decode/pipeline.js';

interface ProcessFileResult {
  success: boolean;
  filePath: string;
  errorMessage?: string;
}

interface ProcessOptions {
  concurrency?: number;
  fileExtensions?: string[];
}

function shouldProcessFile(filePath: string, extensions?: string[]): boolean {
  if (!extensions || extensions.length === 0) return true;
  const extension = path.extname(filePath).toLowerCase();
  return extensions.includes(extension);
}

function decodeRequestStep(state: PipelineState<HttpRequestState>, chunk: Buffer) {
  return pushRequest(state, chunk);
}

function decodeResponseStep(state: PipelineState<HttpResponseState>, chunk: Buffer) {
  return pushResponse(state, chunk);
}

function ensureRequestFinished(state: PipelineState<HttpRequestState>) {
  const httpState = getHttpState(state);
  if (!httpState || !isFinished(state)) {
    return {
      ...state,
      httpState: {
        ...httpState,
        messageType: 'request',
        error: new Error('Request not finished'),
      } as HttpRequestState,
    };
  }
  return state;
}

function finalizeResult(filePath: string, state: PipelineState<HttpResponseState>): ProcessFileResult {
  const httpState = getHttpState(state);
  return {
    success: !httpState?.error,
    filePath,
    errorMessage: httpState?.error?.message ?? '',
  };
}

function logEvents<T extends HttpRequestState | HttpResponseState>(state: PipelineState<T>): PipelineState<T> {
  const httpState = getHttpState(state);
  if (httpState?.events.length) {
    for (const event of httpState.events) {
      console.log(`[${httpState.constructor.name}] Event:`, event);
    }
  }
  return state;
}

async function processFile(filePath: string, options: ProcessOptions): Promise<ProcessFileResult> {
  if (!shouldProcessFile(filePath, options.fileExtensions)) {
    return {
      success: true,
      filePath,
      errorMessage: 'Skipped: file extension not matched',
    };
  }

  const buffer = await fs.readFile(filePath);

  const requestPipeline = pipe<HttpRequestState>(
    (state) => decodeRequestStep(state, buffer),
    logEvents,
    ensureRequestFinished,
    logEvents,
  )(createPipelineState<HttpRequestState>());

  const requestState = getHttpState(requestPipeline)!;

  if (requestState.error) {
    return {
      success: false,
      filePath,
      errorMessage: requestState.error.message,
    };
  }

  const responsePipeline = pipe<HttpResponseState>(
    (state) => decodeResponseStep(state, requestState.buffer),
    logEvents,
  )(createPipelineState<HttpResponseState>());

  return finalizeResult(filePath, responsePipeline);
}

async function processConcurrently<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 10,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

async function processDirectory(directionPath: string, options: ProcessOptions): Promise<ProcessFileResult[]> {
  const { concurrency = 10 } = options;
  const entries = await fs.readdir(directionPath);
  const fullPaths = entries.map((entry) => path.resolve(directionPath, entry));

  const results = await processConcurrently(
    fullPaths,
    async (pathname: string) => processPath(pathname, options),
    concurrency,
  );

  return results.flat();
}

async function processPath(pathname: string, options: ProcessOptions): Promise<ProcessFileResult | ProcessFileResult[]> {
  const stats = await fs.stat(pathname);

  if (stats.isDirectory()) {
    return processDirectory(pathname, options);
  }

  if (!shouldProcessFile(pathname, options.fileExtensions)) {
    return {
      success: false,
      filePath: pathname,
      errorMessage: 'Skipped: file extension not matched',
    };
  }

  return processFile(pathname, options);
}

export async function processHttpFiles(pathname: string, options: ProcessOptions = {}): Promise<ProcessFileResult[]> {
  const result = await processPath(pathname, options);
  return Array.isArray(result) ? result : [result];
}

const targetDirection = path.resolve('/Users/huzhedong/mylib/http-utils/_data');

const results = await processHttpFiles(targetDirection, {
  concurrency: 5,
  // fileExtensions: ['.http', '.txt'],
  fileExtensions: [],
});

console.log('------ All results ------');
console.log(results);
