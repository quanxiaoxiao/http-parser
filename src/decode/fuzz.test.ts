import { describe, it, test } from 'node:test';
import assert from 'node:assert';
import {
  createRequestState,
  createResponseState,
  decodeRequest,
  decodeResponse,
} from './message.js';
import { createChunkedBodyState, decodeChunkedBody } from './chunked-body.js';
import { createFixedLengthBodyState, decodeFixedLengthBody } from './fixed-length-body.js';
import { createHeadersState, decodeHeaders } from './headers.js';
import { decodeRequestStartLine, decodeResponseStartLine } from './start-line.js';
import { decodeHeaderLine } from './headers.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const VALID_PATHS = ['/', '/foo', '/bar/baz', '/test?query=1', '/api/v1/users'];
const VALID_VERSIONS = ['HTTP/1.0', 'HTTP/1.1'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAsciiString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \t!@#$%^&*()_+-=[]{}|;\':",.<>/?`~';
  let result = '';
  for (let i = 0; i < length; i++) {
    const charCode = chars.charCodeAt(randomInt(0, chars.length - 1));
    result += String.fromCharCode(charCode);
  }
  return result;
}

function randomValidMethod(): string {
  return HTTP_METHODS[randomInt(0, HTTP_METHODS.length - 1)];
}

function randomValidPath(): string {
  return VALID_PATHS[randomInt(0, VALID_PATHS.length - 1)];
}

function randomValidVersion(): string {
  return VALID_VERSIONS[randomInt(0, VALID_VERSIONS.length - 1)];
}

function generateRandomHeaderName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  const length = randomInt(1, 50);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[randomInt(0, chars.length - 1)];
  }
  return result;
}

function generateRandomHeaderValue(): string {
  return randomAsciiString(randomInt(0, 200));
}

function generateValidRequestLine(): string {
  return `${randomValidMethod()} ${randomValidPath()} ${randomValidVersion()}\r\n`;
}

function generateValidResponseLine(): string {
  const statusCode = randomInt(100, 599);
  const reasonPhrase = randomAsciiString(randomInt(0, 50));
  return `HTTP/1.1 ${statusCode} ${reasonPhrase}\r\n`;
}

function generateValidHeaderLine(): string {
  const name = generateRandomHeaderName();
  const value = generateRandomHeaderValue();
  return `${name}: ${value}\r\n`;
}

function generateChunkedBody(): Buffer {
  const chunks: Buffer[] = [];
  const numChunks = randomInt(0, 10);

  for (let i = 0; i < numChunks; i++) {
    const size = randomInt(0, 1000);
    const data = Buffer.from(randomAsciiString(size));
    chunks.push(Buffer.from(`${size.toString(16)}\r\n`));
    chunks.push(data);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from('0\r\n\r\n'));
  return Buffer.concat(chunks);
}

function generateFixedLengthBody(contentLength: number): Buffer {
  return Buffer.from(randomAsciiString(contentLength));
}

function generateValidRequest(): Buffer {
  const parts: Buffer[] = [];
  parts.push(Buffer.from(generateValidRequestLine()));

  const numHeaders = randomInt(0, 10);
  for (let i = 0; i < numHeaders; i++) {
    parts.push(Buffer.from(generateValidHeaderLine()));
  }
  parts.push(Buffer.from('\r\n'));

  return Buffer.concat(parts);
}

function generateValidResponse(): Buffer {
  const parts: Buffer[] = [];
  parts.push(Buffer.from(generateValidResponseLine()));

  const numHeaders = randomInt(0, 10);
  for (let i = 0; i < numHeaders; i++) {
    parts.push(Buffer.from(generateValidHeaderLine()));
  }
  parts.push(Buffer.from('\r\n'));

  return Buffer.concat(parts);
}

function generateRandomBuffer(maxSize: number): Buffer {
  const size = randomInt(0, maxSize);
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    buffer[i] = randomInt(0, 255);
  }
  return buffer;
}

describe('Fuzz Testing - Start Line', () => {
  test('should not crash on random request start line data', () => {
    for (let i = 0; i < 1000; i++) {
      const str = randomAsciiString(randomInt(0, 200));
      try {
        decodeRequestStartLine(str);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });

  test('should not crash on random response start line data', () => {
    for (let i = 0; i < 1000; i++) {
      const str = randomAsciiString(randomInt(0, 200));
      try {
        decodeResponseStartLine(str);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });
});

describe('Fuzz Testing - Header Line', () => {
  test('should not crash on random header line data', () => {
    for (let i = 0; i < 1000; i++) {
      const data = generateRandomBuffer(1000);
      try {
        decodeHeaderLine(data, {
          maxHeaderNameBytes: 256,
          maxHeaderValueBytes: 8192,
          maxHeaderLineBytes: 8192 + 256 + 1,
          maxHeaderCount: 100,
          maxHeaderBytes: 32768,
        });
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });

  test('should not crash on random headers data', () => {
    for (let i = 0; i < 500; i++) {
      const input = generateRandomBuffer(2000);
      const state = createHeadersState();
      try {
        decodeHeaders(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });
});

describe('Fuzz Testing - Chunked Body', () => {
  test('should not crash on random chunked body data', () => {
    for (let i = 0; i < 500; i++) {
      const input = generateRandomBuffer(5000);
      const state = createChunkedBodyState();
      try {
        decodeChunkedBody(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });
});

describe('Fuzz Testing - Fixed Length Body', () => {
  test('should not crash on random fixed length body data', () => {
    for (let i = 0; i < 500; i++) {
      const contentLength = randomInt(0, 10000);
      const input = generateFixedLengthBody(contentLength);
      const state = createFixedLengthBodyState(contentLength);
      try {
        decodeFixedLengthBody(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });
});

describe('Fuzz Testing - Complete Request', () => {
  test('should not crash on random request data', () => {
    for (let i = 0; i < 500; i++) {
      const input = generateRandomBuffer(5000);
      const state = createRequestState();
      try {
        decodeRequest(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });
});

describe('Fuzz Testing - Complete Response', () => {
  test('should not crash on random response data', () => {
    for (let i = 0; i < 500; i++) {
      const input = generateRandomBuffer(5000);
      const state = createResponseState();
      try {
        decodeResponse(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });
});

describe('Fuzz Testing - Incremental Parsing', () => {
  test('should handle incrementally split request data', () => {
    for (let i = 0; i < 200; i++) {
      const validRequest = generateValidRequest();
      const randomData = generateRandomBuffer(randomInt(0, 1000));
      const combined = Buffer.concat([validRequest, randomData]);

      const chunkSize = randomInt(1, 100);
      let state = createRequestState();

      for (let offset = 0; offset < combined.length; offset += chunkSize) {
        const chunk = combined.slice(offset, Math.min(offset + chunkSize, combined.length));
        try {
          state = decodeRequest(state, chunk);
          if (state.state === 'finished') break;
        } catch (error) {
          break;
        }
      }
    }
  });

  test('should handle incrementally split response data', () => {
    for (let i = 0; i < 200; i++) {
      const validResponse = generateValidResponse();
      const randomData = generateRandomBuffer(randomInt(0, 1000));
      const combined = Buffer.concat([validResponse, randomData]);

      const chunkSize = randomInt(1, 100);
      let state = createResponseState();

      for (let offset = 0; offset < combined.length; offset += chunkSize) {
        const chunk = combined.slice(offset, Math.min(offset + chunkSize, combined.length));
        try {
          state = decodeResponse(state, chunk);
          if (state.state === 'finished') break;
        } catch (error) {
          break;
        }
      }
    }
  });
});

describe('Fuzz Testing - Edge Cases', () => {
  test('should handle empty input', () => {
    const state = createRequestState();
    const result = decodeRequest(state, Buffer.alloc(0));
    assert.ok(result);
  });

  test('should handle only CRLF', () => {
    const state = createRequestState();
    const result = decodeRequest(state, Buffer.from('\r\n\r\n'));
    assert.ok(result);
  });

  test('should handle binary data in headers', () => {
    for (let i = 0; i < 200; i++) {
      const binaryData = generateRandomBuffer(randomInt(1, 500));
      const input = Buffer.concat([
        Buffer.from('GET / HTTP/1.1\r\n'),
        binaryData,
        Buffer.from('\r\n\r\n'),
      ]);
      const state = createRequestState();
      try {
        decodeRequest(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });

  test('should handle malformed HTTP version', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    const versions = ['HTTP/2.0', 'HTTP/0.9', 'HTTP/3.0', 'HTTP/1.2', 'httP/1.1'];

    for (let i = 0; i < 200; i++) {
      const method = methods[randomInt(0, methods.length - 1)];
      const path = '/'.repeat(randomInt(1, 50));
      const version = versions[randomInt(0, versions.length - 1)];
      const input = Buffer.from(`${method} ${path} ${version}\r\n\r\n`);

      const state = createRequestState();
      try {
        decodeRequest(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });

  test('should handle very long URIs', () => {
    for (let i = 0; i < 100; i++) {
      const path = '/'.repeat(randomInt(1000, 5000));
      const input = Buffer.from(`GET ${path} HTTP/1.1\r\n\r\n`);

      const state = createRequestState();
      try {
        decodeRequest(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });

  test('should handle excessive headers', () => {
    for (let i = 0; i < 100; i++) {
      const parts: Buffer[] = [Buffer.from('GET / HTTP/1.1\r\n')];
      const numHeaders = randomInt(50, 200);
      for (let j = 0; j < numHeaders; j++) {
        parts.push(Buffer.from(`X-Header-${j}: value${j}\r\n`));
      }
      parts.push(Buffer.from('\r\n'));

      const input = Buffer.concat(parts);
      const state = createRequestState();
      try {
        decodeRequest(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });

  test('should handle null bytes and control characters', () => {
    for (let i = 0; i < 100; i++) {
      const controlChars = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f';
      const path = controlChars.repeat(randomInt(1, 50));
      const input = Buffer.from(`GET ${path} HTTP/1.1\r\n\r\n`);

      const state = createRequestState();
      try {
        decodeRequest(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });
});

describe('Fuzz Testing - Valid HTTP Messages Stress', () => {
  test('should correctly parse valid requests (stress test)', () => {
    for (let i = 0; i < 1000; i++) {
      const request = generateValidRequest();
      const state = createRequestState();
      const result = decodeRequest(state, request);
      assert.ok(result.state !== undefined);
    }
  });

  test('should correctly parse valid responses (stress test)', () => {
    for (let i = 0; i < 1000; i++) {
      const response = generateValidResponse();
      const state = createResponseState();
      const result = decodeResponse(state, response);
      assert.ok(result.state !== undefined);
    }
  });

  test('should correctly parse chunked bodies (stress test)', () => {
    for (let i = 0; i < 500; i++) {
      const body = generateChunkedBody();
      const state = createChunkedBodyState();
      const result = decodeChunkedBody(state, body);
      assert.ok(result.state !== undefined);
    }
  });

  test('should handle mixed valid and invalid data', () => {
    for (let i = 0; i < 300; i++) {
      const validPart = generateValidRequest();
      const invalidPart = generateRandomBuffer(randomInt(10, 500));
      const combined = Buffer.concat([validPart, invalidPart]);

      const state = createRequestState();
      try {
        const result = decodeRequest(state, combined);
        assert.ok(result.state !== undefined);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });
});

describe('Fuzz Testing - Boundary Conditions', () => {
  test('should handle exactly at limit boundary', () => {
    for (let i = 0; i < 100; i++) {
      const pathLength = randomInt(4000, 4100);
      const path = '/'.repeat(Math.floor(pathLength / 2));
      const input = Buffer.from(`GET ${path} HTTP/1.1\r\n\r\n`);

      const state = createRequestState();
      try {
        decodeRequest(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });

  test('should handle chunk size at hex digit limit', () => {
    for (let i = 0; i < 100; i++) {
      const hexDigits = '0123456789ABCDEF';
      const sizeStr = hexDigits.slice(0, randomInt(1, 12));
      const input = Buffer.from(`${sizeStr}\r\n${'x'.repeat(10)}\r\n0\r\n\r\n`);

      const state = createChunkedBodyState();
      try {
        decodeChunkedBody(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });

  test('should handle header count at limit', () => {
    for (let i = 0; i < 50; i++) {
      const parts: Buffer[] = [Buffer.from('GET / HTTP/1.1\r\n')];
      for (let j = 0; j < 100; j++) {
        parts.push(Buffer.from(`X-Custom-Header-${j}: Value\r\n`));
      }
      parts.push(Buffer.from('\r\n'));

      const input = Buffer.concat(parts);
      const state = createRequestState();
      try {
        decodeRequest(state, input);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  });
});
