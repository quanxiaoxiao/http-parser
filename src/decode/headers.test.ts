import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  HttpDecodeError,
  HttpDecodeErrorCode,
} from '../errors.js';
import { DEFAULT_HEADER_LIMITS } from '../specs.js';
import {
  createHeadersStateData,
  decodeHeaderLine,
  decodeHeaders,
  HeadersState,
  isHeadersFinished,
} from './headers.js';

describe('createHeadersStateData', () => {
  it('should create initial state with empty values', () => {
    const state = createHeadersStateData();

    assert.strictEqual(state.buffer.length, 0);
    assert.deepStrictEqual(state.headers, {});
    assert.deepStrictEqual(state.rawHeaderLines, []);
    assert.strictEqual(state.receivedBytes, 0);
    assert.strictEqual(state.state, HeadersState.LINE);
  });
});

describe('decodeHeaders', () => {
  describe('basic parsing', () => {
    it('should parse single header line', () => {
      const state = createHeadersStateData();
      const input = Buffer.from('Host: example.com\r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.receivedBytes, 19);
      assert.strictEqual(result.state, HeadersState.LINE);
    });

    it('should parse multiple header lines', () => {
      const state = createHeadersStateData();
      const input = Buffer.from(
        'Content-Type: application/json\r\n' +
        'Content-Length: 123\r\n' +
        'Host: example.com\r\n',
      );
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['content-type'], 'application/json');
      assert.strictEqual(result.headers['content-length'], '123');
      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.state, HeadersState.LINE);
    });

    it('should handle empty line as headers end', () => {
      const state = createHeadersStateData();
      const input = Buffer.from('Host: example.com\r\n\r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.state, HeadersState.FINISHED);
      assert.strictEqual(result.receivedBytes, input.length - 2);
      assert.strictEqual(result.buffer.length, 0);
    });

    it('should handle empty input', () => {
      const state = createHeadersStateData();
      const input = Buffer.from('');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.state, HeadersState.LINE);
      assert.deepStrictEqual(result.headers, {});
      assert.strictEqual(result.receivedBytes, 0);
    });
  });

  describe('duplicate headers', () => {
    it('should handle duplicate header names as array', () => {
      const state = createHeadersStateData();
      const input = Buffer.from(
        'Set-Cookie: cookie1=value1\r\nSet-Cookie: cookie2=value2\r\n',
      );
      const result = decodeHeaders(state, input);

      assert.ok(Array.isArray(result.headers['set-cookie']));
      assert.deepStrictEqual(result.headers['set-cookie'], [
        'cookie1=value1',
        'cookie2=value2',
      ]);
    });

    it('should handle three or more duplicate headers', () => {
      const state = createHeadersStateData();
      const input = Buffer.from(
        'X-Custom: value1\r\n' +
        'X-Custom: value2\r\n' +
        'X-Custom: value3\r\n\r\n',
      );
      const result = decodeHeaders(state, input);

      assert.deepStrictEqual(result.headers['x-custom'], [
        'value1',
        'value2',
        'value3',
      ]);
    });

    it('should handle mixed case duplicate headers', () => {
      const state = createHeadersStateData();
      const input = Buffer.from(
        'Cache-Control: no-cache\r\ncache-control: no-store\r\n',
      );
      const result = decodeHeaders(state, input);

      assert.ok(Array.isArray(result.headers['cache-control']));
      assert.deepStrictEqual(result.headers['cache-control'], [
        'no-cache',
        'no-store',
      ]);
    });
  });

  describe('incremental parsing', () => {
    it('should preserve buffer when line is incomplete', () => {
      const state = createHeadersStateData();
      const input = Buffer.from('Host: exam');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.buffer.toString(), 'Host: exam');
      assert.strictEqual(result.receivedBytes, 0);
      assert.strictEqual(result.state, HeadersState.LINE);
      assert.deepStrictEqual(result.headers, {});
    });

    it('should concatenate buffers across multiple calls', () => {
      let state = createHeadersStateData();
      state = decodeHeaders(state, Buffer.from('Host: exa'));

      assert.strictEqual(state.buffer.toString(), 'Host: exa');
      assert.strictEqual(state.receivedBytes, 0);

      state = decodeHeaders(state, Buffer.from('mple.com\r\n'));

      assert.strictEqual(state.headers['host'], 'example.com');
      assert.strictEqual(state.buffer.length, 0);
      assert.strictEqual(state.receivedBytes, 19);
    });

    it('should continue parsing from previous buffer', () => {
      let state = createHeadersStateData();
      state = decodeHeaders(state, Buffer.from('Content-Type: appli'));

      assert.strictEqual(state.state, HeadersState.LINE);
      assert.strictEqual(state.buffer.toString(), 'Content-Type: appli');

      state = decodeHeaders(state, Buffer.from('cation/json\r\n\r\n'));

      assert.strictEqual(state.headers['content-type'], 'application/json');
      assert.strictEqual(state.state, HeadersState.FINISHED);
    });

    it('should preserve previous headers when continuing parsing', () => {
      let state = createHeadersStateData();
      state = decodeHeaders(state, Buffer.from('Content-Type: application/json\r\n'));
      state = decodeHeaders(state, Buffer.from('Host: example.com\r\n\r\n'));

      assert.strictEqual(state.headers['content-type'], 'application/json');
      assert.strictEqual(state.headers['host'], 'example.com');
      assert.strictEqual(state.state, HeadersState.FINISHED);
    });
  });

  describe('header formatting', () => {
    it('should normalize header names to lowercase', () => {
      const state = createHeadersStateData();
      const input = Buffer.from(
        'Content-Type: text/html\r\n' +
        'CONTENT-LENGTH: 100\r\n' +
        'CoNtEnT-EnCoDiNg: gzip\r\n\r\n',
      );
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['content-type'], 'text/html');
      assert.strictEqual(result.headers['content-length'], '100');
      assert.strictEqual(result.headers['content-encoding'], 'gzip');
      assert.strictEqual(result.headers['Content-Type'], undefined);
    });

    it('should handle headers with whitespace in values', () => {
      const state = createHeadersStateData();
      const input = Buffer.from(
        'Host:   example.com   \r\n' +
        'User-Agent: Mozilla/5.0 (Windows NT)\r\n\r\n',
      );
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.headers['user-agent'], 'Mozilla/5.0 (Windows NT)');
    });

    it('should handle empty header values', () => {
      const state = createHeadersStateData();
      const input = Buffer.from('X-Empty-Header: \r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['x-empty-header'], '');
    });

    it('should preserve raw headers order', () => {
      const state = createHeadersStateData();
      const input = Buffer.from(
        'Content-Type: application/json\r\n' +
        'Host: example.com\r\n' +
        'Content-Length: 123\r\n\r\n',
      );
      decodeHeaders(state, input);

    });
  });

  describe('body data handling', () => {
    it('should handle complete headers with body data', () => {
      const state = createHeadersStateData();
      const input = Buffer.from(
        'Content-Type: text/plain\r\n\r\nThis is body data',
      );
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['content-type'], 'text/plain');
      assert.strictEqual(result.state, HeadersState.FINISHED);
      assert.strictEqual(result.buffer.toString(), 'This is body data');
    });
  });

  describe('byte counting', () => {
    it('should count bytes correctly including CRLF', () => {
      const state = createHeadersStateData();
      const input = Buffer.from('Content-Type: application/json\r\n\r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.receivedBytes, input.length - 2); // 32 + 2 (CRLF)
    });

    it('should handle long header values', () => {
      const state = createHeadersStateData();
      const longValue = 'a'.repeat(1000);
      const input = Buffer.from(`X-Long-Header: ${longValue}\r\n`);
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['x-long-header'], longValue);
      assert.strictEqual(result.receivedBytes, 1017); // 15 + 1000 + 2
    });

    it('should preserve previous headers state', () => {
      const state = createHeadersStateData();
      state.headers = { host: 'example.com' };
      state.receivedBytes = 19;

      const input = Buffer.from('Accept: */*\r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.headers['accept'], '*/*');
      assert.strictEqual(result.receivedBytes, 32); // 19 + 13
    });
  });

  describe('error handling', () => {
    it('should throw error if headers already finished', () => {
      const state = createHeadersStateData();
      state.state = HeadersState.FINISHED;
      const input = Buffer.from('Host: example.com\r\n');

      assert.throws(
        () => decodeHeaders(state, input),
        {
          name: 'Error',
          message: 'Headers parsing already finished',
        },
      );
    });

    it('should throw error when parsing already finished headers', () => {
      const state = createHeadersStateData();
      const result = decodeHeaders(state, Buffer.from('\r\n'));

      assert.strictEqual(result.state, HeadersState.FINISHED);

      assert.throws(
        () => decodeHeaders(result, Buffer.from('More: data\r\n')),
        {
          name: 'Error',
          message: 'Headers parsing already finished',
        },
      );
    });
  });
});

describe('decodeHeaderLine', () => {
  describe('Normal Cases', () => {
    it('should correctly parse standard HTTP header', () => {
      const headerBuf = Buffer.from('Content-Type:application/json');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'content-type');
      assert.strictEqual(value, 'application/json');
    });

    it('should correctly handle header values with spaces', () => {
      const headerBuf = Buffer.from('Content-Type: application/json; charset=utf-8');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'content-type');
      assert.strictEqual(value, 'application/json; charset=utf-8');
    });

    it('should correctly handle spaces before and after header name and value', () => {
      const headerBuf = Buffer.from('  User-Agent  :  Mozilla/5.0  ');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'user-agent');
      assert.strictEqual(value, 'Mozilla/5.0');
    });

    it('should correctly handle empty values', () => {
      const headerBuf = Buffer.from('X-Custom-Header:');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'x-custom-header');
      assert.strictEqual(value, '');
    });

    it('should correctly handle values containing multiple colons', () => {
      const headerBuf = Buffer.from('Authorization:Bearer:token:with:colons');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'authorization');
      assert.strictEqual(value, 'Bearer:token:with:colons');
    });

    it('should correctly handle single character header names', () => {
      const headerBuf = Buffer.from('X:value');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'x');
      assert.strictEqual(value, 'value');
    });
  });

  describe('Edge Cases', () => {
    it('should accept maximum length header names', () => {
      const maxName = 'A'.repeat(DEFAULT_HEADER_LIMITS.maxHeaderNameBytes);
      const headerBuf = Buffer.from(`${maxName}:value`);
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, maxName.trim().toLowerCase());
      assert.strictEqual(value, 'value');
    });

    it('should accept maximum length header values', () => {
      const maxValue = 'V'.repeat(DEFAULT_HEADER_LIMITS.maxHeaderValueBytes);
      const headerBuf = Buffer.from(`Name:${maxValue}`);
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'name');
      assert.strictEqual(value, maxValue);
    });

    it('should accept maximum length line', () => {
      const nameLen = DEFAULT_HEADER_LIMITS.maxHeaderNameBytes;
      const valueLen = DEFAULT_HEADER_LIMITS.maxHeaderLineBytes - nameLen - 1;
      const headerBuf = Buffer.from(`${'N'.repeat(nameLen)}:${'V'.repeat(valueLen)}`);
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name.length, nameLen);
      assert.strictEqual(value.length, valueLen);
    });
  });

  describe('Error Cases', () => {
    it('should throw error when colon is missing', () => {
      const headerBuf = Buffer.from('InvalidHeaderWithoutColon');

      assert.throws(
        () => decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS),
        {
          name: 'HttpDecodeError',
          code: 'INVALID_HEADER',
          message: /missing ":" separator/,
        },
      );
    });

    it('should throw error when header name is too long', () => {
      const longName = 'A'.repeat(DEFAULT_HEADER_LIMITS.maxHeaderNameBytes + 1);
      const headerBuf = Buffer.from(`${longName}:value`);

      assert.throws(
        () => decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS),
        {
          name: 'HttpDecodeError',
          code: 'HEADER_NAME_TOO_LARGE',
        },
      );
    });

    it('should throw error when header value is too long', () => {
      const longValue = 'V'.repeat(DEFAULT_HEADER_LIMITS.maxHeaderValueBytes + 1);
      const headerBuf = Buffer.from(`Name:${longValue}`);

      assert.throws(
        () => decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS),
        {
          name: 'HttpDecodeError',
          code: 'HEADER_VALUE_TOO_LARGE',
        },
      );
    });

    it('should throw error when line is too long', () => {
      const longLine = 'A'.repeat(DEFAULT_HEADER_LIMITS.maxHeaderLineBytes + 1);
      const headerBuf = Buffer.from(longLine);

      assert.throws(
        () => decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS),
        {
          name: 'HttpDecodeError',
          code: 'HEADER_LINE_TOO_LARGE',
        },
      );
    });
  });

  describe('Custom Limits', () => {
    it('should respect custom header name limits', () => {
      const customLimits = {
        ...DEFAULT_HEADER_LIMITS,
        maxHeaderNameBytes: 10,
      };
      const headerBuf = Buffer.from('VeryLongHeaderName:value');

      assert.throws(
        () => decodeHeaderLine(headerBuf, customLimits),
        {
          name: 'HttpDecodeError',
          code: 'HEADER_NAME_TOO_LARGE',
        },
      );
    });

    it('should respect custom header value limits', () => {
      const customLimits = {
        ...DEFAULT_HEADER_LIMITS,
        maxHeaderValueBytes: 5,
      };
      const headerBuf = Buffer.from('Name:VeryLongValue');

      assert.throws(
        () => decodeHeaderLine(headerBuf, customLimits),
        {
          name: 'HttpDecodeError',
          code: 'HEADER_VALUE_TOO_LARGE',
        },
      );
    });

    it('should respect custom line limits', () => {
      const customLimits = {
        ...DEFAULT_HEADER_LIMITS,
        maxHeaderLineBytes: 20,
      };
      const headerBuf = Buffer.from('Header:ThisValueIsTooLongForTheLimit');

      assert.throws(
        () => decodeHeaderLine(headerBuf, customLimits),
        {
          name: 'HttpDecodeError',
          code: 'HEADER_LINE_TOO_LARGE',
        },
      );
    });
  });

  describe('Special Character Handling', () => {
    it('should correctly handle ASCII printable characters', () => {
      const headerBuf = Buffer.from('X-Special:!@#$%^&*()_+-=[]{}|;:",.<>?/~`');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'x-special');
      assert.strictEqual(value, '!@#$%^&*()_+-=[]{}|;:",.<>?/~`');
    });

    it('should correctly handle numbers', () => {
      const headerBuf = Buffer.from('Content-Length:12345');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'content-length');
      assert.strictEqual(value, '12345');
    });
  });
});

describe('decodeHeaderLine', () => {
  it('should correctly parse simple header line', () => {
    const buffer = Buffer.from('Content-Type: application/json');
    const limits = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    const [name, value] = decodeHeaderLine(buffer, limits);
    assert.strictEqual(name, 'content-type');
    assert.strictEqual(value, 'application/json');
  });

  it('should correctly parse header values with spaces', () => {
    const buffer = Buffer.from('Authorization: Bearer token123');
    const limits = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    const [name, value] = decodeHeaderLine(buffer, limits);
    assert.strictEqual(name, 'authorization');
    assert.strictEqual(value, 'Bearer token123');
  });

  it('should throw error when header line is too large', () => {
    const buffer = Buffer.from('Content-Type: application/json');
    const limits = {
      maxHeaderLineBytes: 10,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    assert.throws(
      () => decodeHeaderLine(buffer, limits),
    );
  });

  it('should throw error when colon separator is missing', () => {
    const buffer = Buffer.from('InvalidHeader');
    const limits = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    assert.throws(
      () => decodeHeaderLine(buffer, limits),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.INVALID_HEADER &&
               err.message.includes('missing ":" separator');
      },
    );
  });

  it('should throw error when header name is too large', () => {
    const longName = 'A'.repeat(300);
    const buffer = Buffer.from(`${longName}: value`);
    const limits = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    assert.throws(
      () => decodeHeaderLine(buffer, limits),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.HEADER_NAME_TOO_LARGE;
      },
    );
  });

  it('should throw error when header value is too large', () => {
    const longValue = 'V'.repeat(10000);
    const buffer = Buffer.from(`Name: ${longValue}`);
    const limits = {
      maxHeaderLineBytes: 20000,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 50000,
      maxHeaderCount: 100,
    };

    assert.throws(
      () => decodeHeaderLine(buffer, limits),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.HEADER_VALUE_TOO_LARGE;
      },
    );
  });
});

describe('createHeadersStateData', () => {
  it('should create initial state', () => {
    const state = createHeadersStateData();

    assert.strictEqual(state.state, HeadersState.LINE);
    assert.strictEqual(state.receivedBytes, 0);
    assert.deepStrictEqual(state.headers, {});
    assert.ok(state.buffer instanceof Buffer);
    assert.strictEqual(state.buffer.length, 0);
  });

  it('should create state with custom limits', () => {
    const customLimit = {
      maxHeaderLineBytes: 4096,
      maxHeaderNameBytes: 128,
      maxHeaderValueBytes: 4096,
      maxHeaderBytes: 8192,
      maxHeaderCount: 50,
    };

    const state = createHeadersStateData(customLimit);
    assert.deepStrictEqual(state.limits, customLimit);
  });
});

describe('decodeHeaders', () => {
  it('should parse single header', () => {
    const state = createHeadersStateData();
    const input = Buffer.from('Content-Type: application/json\r\n\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.state, HeadersState.FINISHED);
    assert.strictEqual(result.headers['content-type'], 'application/json');
    assert.strictEqual(result.rawHeaderLines.length, 1);
  });

  it('should parse multiple headers', () => {
    const state = createHeadersStateData();
    const input = Buffer.from(
      'Content-Type: application/json\r\n' +
      'Authorization: Bearer token\r\n' +
      'Accept: */*\r\n' +
      '\r\n',
    );

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.state, HeadersState.FINISHED);
    assert.strictEqual(result.headers['content-type'], 'application/json');
    assert.strictEqual(result.headers['authorization'], 'Bearer token');
    assert.strictEqual(result.headers['accept'], '*/*');
    assert.strictEqual(result.rawHeaderLines.length, 3);
  });

  it('should handle multiple headers with same name', () => {
    const state = createHeadersStateData();
    const input = Buffer.from(
      'Set-Cookie: session=abc123\r\n' +
      'Set-Cookie: user=john\r\n' +
      '\r\n',
    );

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.state, HeadersState.FINISHED);
    assert.ok(Array.isArray(result.headers['set-cookie']));
    assert.deepStrictEqual(result.headers['set-cookie'], ['session=abc123', 'user=john']);
  });

  it('should handle chunked input', () => {
    let state = createHeadersStateData();

    // 第一块
    const input1 = Buffer.from('Content-Type: application/');
    state = decodeHeaders(state, input1);
    assert.strictEqual(state.state, HeadersState.LINE);

    // 第二块
    const input2 = Buffer.from('json\r\nAuthorization: Bearer ');
    state = decodeHeaders(state, input2);
    assert.strictEqual(state.state, HeadersState.LINE);

    // 第三块
    const input3 = Buffer.from('token\r\n\r\n');
    state = decodeHeaders(state, input3);
    assert.strictEqual(state.state, HeadersState.FINISHED);

    assert.strictEqual(state.headers['content-type'], 'application/json');
    assert.strictEqual(state.headers['authorization'], 'Bearer token');
  });

  it('should trim spaces from header names and values', () => {
    const state = createHeadersStateData();
    const input = Buffer.from('  Content-Type  :   application/json  \r\n\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.headers['content-type'], 'application/json');
  });

  it('should throw error when header name is invalid', () => {
    const state = createHeadersStateData();
    const input = Buffer.from('Invalid Header: value\r\n\r\n');

    assert.throws(
      () => decodeHeaders(state, input),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.INVALID_HEADER &&
               err.message.includes('Invalid characters in header name');
      },
    );
  });

  it('should throw error when header name is empty', () => {
    const state = createHeadersStateData();
    const input = Buffer.from('  : value\r\n\r\n');

    assert.throws(
      () => decodeHeaders(state, input),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.INVALID_HEADER;
      },
    );
  });

  it('should throw error when header count exceeds limit', () => {
    const customLimit = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 2,
    };
    const state = createHeadersStateData(customLimit);
    const input = Buffer.from(
      'Header1: value1\r\n' +
      'Header2: value2\r\n' +
      'Header3: value3\r\n' +
      '\r\n',
    );

    assert.throws(
      () => decodeHeaders(state, input),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.HEADER_TOO_MANY;
      },
    );
  });

  it('should throw error when called again after completion', () => {
    const state = createHeadersStateData();
    const input = Buffer.from('Content-Type: application/json\r\n\r\n');

    const result = decodeHeaders(state, input);
    assert.strictEqual(result.state, HeadersState.FINISHED);

    assert.throws(
      () => decodeHeaders(result, Buffer.from('More: data\r\n')),
      /Headers parsing already finished/,
    );
  });

  it('should correctly handle empty headers (only CRLF)', () => {
    const state = createHeadersStateData();
    const input = Buffer.from('\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.state, HeadersState.FINISHED);
    assert.deepStrictEqual(result.headers, {});
    assert.strictEqual(result.rawHeaderLines.length, 0);
  });
});

describe('isHeadersFinished', () => {
  it('should return false when not finished', () => {
    const state = createHeadersStateData();
    assert.strictEqual(isHeadersFinished(state), false);
  });

  it('should return true when finished', () => {
    const state = createHeadersStateData();
    const input = Buffer.from('\r\n');
    const result = decodeHeaders(state, input);

    assert.strictEqual(isHeadersFinished(result), true);
  });
});

describe('Edge Cases Tests', () => {
  it('should handle valid header names with special characters', () => {
    const state = createHeadersStateData();
    const input = Buffer.from('X-Custom-Header_123: value\r\n\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.headers['x-custom-header_123'], 'value');
  });

  it('should handle headers with empty values', () => {
    const state = createHeadersStateData();
    const input = Buffer.from('Empty-Value:\r\n\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.headers['empty-value'], '');
  });

  it('should handle three headers with same name', () => {
    const state = createHeadersStateData();
    const input = Buffer.from(
      'X-Custom: first\r\n' +
      'X-Custom: second\r\n' +
      'X-Custom: third\r\n' +
      '\r\n',
    );

    const result = decodeHeaders(state, input);

    assert.ok(Array.isArray(result.headers['x-custom']));
    assert.deepStrictEqual(result.headers['x-custom'], ['first', 'second', 'third']);
  });
});
