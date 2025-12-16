/* eslint no-use-before-define: 0 */
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createRequestState,
  createResponseState,
  type HttpRequestState,
  type HttpResponseState,
  parseRequest,
  parseResponse,
} from './decodeHttp/parseHttp.js';
import validateHeaders from './utils/validateHeaders.js';

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
  const ext = path.extname(filePath).toLowerCase();
  return extensions.includes(ext);
}

function processHttpRequest(chunk: Buffer): HttpRequestState {
  const state: HttpRequestState = createRequestState();
  return parseRequest(state, chunk, {
    onHeadersComplete: (headers) => {
      const errors = validateHeaders(headers);
      errors.forEach((errorItem) => {
        if (errorItem.header !== 'authorization') {
          console.log(errorItem);
        }
      });
    },
  });
}

function procssHttpResponse(chunk: Buffer): HttpResponseState {
  const state: HttpResponseState = createResponseState();
  return parseResponse(state, chunk, {
    onHeadersComplete: (headers) => {
      const errors = validateHeaders(headers);
      errors.forEach((errorItem) => {
        if (errorItem.header !== 'authorization') {
          console.log(errorItem);
        }
      });
    },
  });
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
  if (!requestState.finished) {
    return {
      success: false,
      filePath,
      errorMessage: requestState.error?.message ?? 'parse response uncomplete',
    };
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
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
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
    (pathname: string) => processPath(pathname, options),
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

const ret = await processHttpFiles(path.resolve('/Users/huzhedong/mylib/http-utils/_data'));
// const ret = await processHttpFiles(path.resolve('/Users/huzhedong/mylib/http-utils/_data/01/66442ac107c67a1322721b'));

console.log(ret);
