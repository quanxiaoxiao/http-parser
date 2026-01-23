/* eslint no-use-before-define: 0 */
import type { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createRequestState,
  createResponseState,
  decodeRequest,
  decodeResponse,
  type HttpRequestState,
  type HttpResponseState,
  isMessageFinished,
} from './decode/message.js';
import validateHeaders from './utils/validateHeaders.js';
import { validateRequestCookie } from './utils/validateRequestCookie.js';

interface ProcessFileResult {
  success: boolean;
  filePath: string;
  errorMessage?: string;
}

interface ProcessOptions {
  concurrency?: number;
  fileExtensions?: string[];
}

interface ProcessOptions {
  concurrency?: number;
  fileExtensions?: string[];
}

function shouldProcessFile(filePath: string, extensions?: string[]): boolean {
  if (!extensions || extensions.length === 0) {
    return true;
  }
  const extension = path.extname(filePath).toLowerCase();
  return extensions.includes(extension);
}

function processHttpRequest(chunk: Buffer): HttpRequestState {
  const state: HttpRequestState = createRequestState();
  return decodeRequest(state, chunk);
}

function procssHttpResponse(chunk: Buffer): HttpResponseState {
  const state: HttpResponseState = createResponseState();
  return decodeResponse(state, chunk);
}

async function processFile(filePath: string, options: ProcessOptions): Promise<ProcessFileResult>{
  if (!shouldProcessFile(filePath, options.fileExtensions)) {
    return {
      success: true,
      filePath,
      errorMessage: 'Skipped: file extension not matched',
    };
  }
  const httpBuf = await fs.readFile(filePath);
  const requestState: HttpRequestState = processHttpRequest(httpBuf);
  if (!isMessageFinished(requestState)) {
    return {
      success: false,
      filePath,
      errorMessage: requestState.error?.message ?? 'parse response uncomplete',
    };
  }

  if (requestState.parsing.body) {
    console.log(requestState.events);
  }

  const responseState: HttpResponseState = procssHttpResponse(requestState.buffer);

  return {
    success: !!responseState.error,
    filePath,
    errorMessage: responseState.error?.message ?? '',
  };
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

async function processDirectory(
  dirPath: string,
  options: ProcessOptions,
): Promise<ProcessFileResult[]> {
  const { concurrency = 10 } = options;
  const entries = await fs.readdir(dirPath);
  const fullPaths = entries.map((entry) => path.resolve(dirPath, entry));

  const results = await processConcurrently(
    fullPaths,
    async (pathname: string) => processPath(pathname, options),
    concurrency,
  );
  return results.flat();
}

async function processPath (pathname: string, options: ProcessOptions): Promise<ProcessFileResult | ProcessFileResult[]> {
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

async function processHttpFiles(
  pathname: string,
  options: ProcessOptions = {},
): Promise<ProcessFileResult[]> {
  const result = await processPath(pathname, options);
  return Array.isArray(result) ? result : [result];
}

const returnValue = await processHttpFiles(path.resolve('/Users/huzhedong/mylib/http-utils/_data'));
// const ret = await processHttpFiles(path.resolve('/Users/huzhedong/mylib/http-utils/_data/01/66442ac107c67a1322721b'));

console.log(returnValue);
