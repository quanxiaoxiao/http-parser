import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { HttpDecodeError, HttpDecodeErrorCode } from '../errors.js';
import { DEFAULT_HEADER_LIMITS } from '../specs.js';
import { createHeadersState, decodeHeaderLine, decodeHeaders,HeadersDecodePhase,isHeadersFinished } from './headers.js';

describe('createHeadersState', () => {
  it('should create initial state with empty values', () => {
    const state = createHeadersState();

    assert.strictEqual(state.buffer.length, 0);
    assert.deepStrictEqual(state.headers, {});
    assert.deepStrictEqual(state.headersRaw, []);
    assert.strictEqual(state.receivedBytes, 0);
    assert.strictEqual(state.phase, HeadersDecodePhase.LINE);
  });
});

describe('decodeHeaders', () => {
  describe('basic parsing', () => {
    it('should parse single header line', () => {
      const state = createHeadersState();
      const input = Buffer.from('Host: example.com\r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.receivedBytes, 19);
      assert.strictEqual(result.phase, HeadersDecodePhase.LINE);
    });

    it('should parse multiple header lines', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Content-Type: application/json\r\n' +
        'Content-Length: 123\r\n' +
        'Host: example.com\r\n',
      );
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['content-type'], 'application/json');
      assert.strictEqual(result.headers['content-length'], '123');
      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.phase, HeadersDecodePhase.LINE);
    });

    it('should handle empty line as headers end', () => {
      const state = createHeadersState();
      const input = Buffer.from('Host: example.com\r\n\r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.phase, HeadersDecodePhase.DONE);
      assert.strictEqual(result.receivedBytes, input.length - 2);
      assert.strictEqual(result.buffer.length, 0);
    });

    it('should handle empty input', () => {
      const state = createHeadersState();
      const input = Buffer.from('');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.phase, HeadersDecodePhase.LINE);
      assert.deepStrictEqual(result.headers, {});
      assert.strictEqual(result.receivedBytes, 0);
    });
  });

  describe('duplicate headers', () => {
    it('should handle duplicate header names as array', () => {
      const state = createHeadersState();
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
      const state = createHeadersState();
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
      const state = createHeadersState();
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
      const state = createHeadersState();
      const input = Buffer.from('Host: exam');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.buffer.toString(), 'Host: exam');
      assert.strictEqual(result.receivedBytes, 0);
      assert.strictEqual(result.phase, HeadersDecodePhase.LINE);
      assert.deepStrictEqual(result.headers, {});
    });

    it('should concatenate buffers across multiple calls', () => {
      let state = createHeadersState();
      state = decodeHeaders(state, Buffer.from('Host: exa'));

      assert.strictEqual(state.buffer.toString(), 'Host: exa');
      assert.strictEqual(state.receivedBytes, 0);

      state = decodeHeaders(state, Buffer.from('mple.com\r\n'));

      assert.strictEqual(state.headers['host'], 'example.com');
      assert.strictEqual(state.buffer.length, 0);
      assert.strictEqual(state.receivedBytes, 19);
    });

    it('should continue parsing from previous buffer', () => {
      let state = createHeadersState();
      state = decodeHeaders(state, Buffer.from('Content-Type: appli'));

      assert.strictEqual(state.phase, HeadersDecodePhase.LINE);
      assert.strictEqual(state.buffer.toString(), 'Content-Type: appli');

      state = decodeHeaders(state, Buffer.from('cation/json\r\n\r\n'));

      assert.strictEqual(state.headers['content-type'], 'application/json');
      assert.strictEqual(state.phase, HeadersDecodePhase.DONE);
    });

    it('should preserve previous headers when continuing parsing', () => {
      let state = createHeadersState();
      state = decodeHeaders(state, Buffer.from('Content-Type: application/json\r\n'));
      state = decodeHeaders(state, Buffer.from('Host: example.com\r\n\r\n'));

      assert.strictEqual(state.headers['content-type'], 'application/json');
      assert.strictEqual(state.headers['host'], 'example.com');
      assert.strictEqual(state.phase, HeadersDecodePhase.DONE);
    });
  });

  describe('header formatting', () => {
    it('should normalize header names to lowercase', () => {
      const state = createHeadersState();
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
      const state = createHeadersState();
      const input = Buffer.from(
        'Host:   example.com   \r\n' +
        'User-Agent: Mozilla/5.0 (Windows NT)\r\n\r\n',
      );
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.headers['user-agent'], 'Mozilla/5.0 (Windows NT)');
    });

    it('should handle empty header values', () => {
      const state = createHeadersState();
      const input = Buffer.from('X-Empty-Header: \r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['x-empty-header'], '');
    });

    it('should preserve raw headers order', () => {
      const state = createHeadersState();
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
      const state = createHeadersState();
      const input = Buffer.from(
        'Content-Type: text/plain\r\n\r\nThis is body data',
      );
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['content-type'], 'text/plain');
      assert.strictEqual(result.phase, HeadersDecodePhase.DONE);
      assert.strictEqual(result.buffer.toString(), 'This is body data');
    });
  });

  describe('byte counting', () => {
    it('should count bytes correctly including CRLF', () => {
      const state = createHeadersState();
      const input = Buffer.from('Content-Type: application/json\r\n\r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.receivedBytes, input.length - 2); // 32 + 2 (CRLF)
    });

    it('should handle long header values', () => {
      const state = createHeadersState();
      const longValue = 'a'.repeat(1000);
      const input = Buffer.from(`X-Long-Header: ${longValue}\r\n`);
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['x-long-header'], longValue);
      assert.strictEqual(result.receivedBytes, 1017); // 15 + 1000 + 2
    });

    it('should preserve previous headers state', () => {
      const state = createHeadersState();
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
      const state = createHeadersState();
      state.phase = HeadersDecodePhase.DONE;
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
      const state = createHeadersState();
      const result = decodeHeaders(state, Buffer.from('\r\n'));

      assert.strictEqual(result.phase, HeadersDecodePhase.DONE);

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
  describe('正常情况', () => {
    it('应该正确解析标准的 HTTP 头部', () => {
      const headerBuf = Buffer.from('Content-Type:application/json');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'content-type');
      assert.strictEqual(value, 'application/json');
    });

    it('应该正确处理带空格的头部值', () => {
      const headerBuf = Buffer.from('Content-Type: application/json; charset=utf-8');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'content-type');
      assert.strictEqual(value, 'application/json; charset=utf-8');
    });

    it('应该正确处理头部名称和值前后的空格', () => {
      const headerBuf = Buffer.from('  User-Agent  :  Mozilla/5.0  ');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'user-agent');
      assert.strictEqual(value, 'Mozilla/5.0');
    });

    it('应该正确处理空值', () => {
      const headerBuf = Buffer.from('X-Custom-Header:');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'x-custom-header');
      assert.strictEqual(value, '');
    });

    it('应该正确处理包含多个冒号的值', () => {
      const headerBuf = Buffer.from('Authorization:Bearer:token:with:colons');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'authorization');
      assert.strictEqual(value, 'Bearer:token:with:colons');
    });

    it('应该正确处理单字符头部名称', () => {
      const headerBuf = Buffer.from('X:value');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'x');
      assert.strictEqual(value, 'value');
    });
  });

  describe('边界情况', () => {
    it('应该接受最大长度的头部名称', () => {
      const maxName = 'A'.repeat(DEFAULT_HEADER_LIMITS.maxHeaderNameBytes);
      const headerBuf = Buffer.from(`${maxName}:value`);
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, maxName.trim().toLowerCase());
      assert.strictEqual(value, 'value');
    });

    it('应该接受最大长度的头部值', () => {
      const maxValue = 'V'.repeat(DEFAULT_HEADER_LIMITS.maxHeaderValueBytes);
      const headerBuf = Buffer.from(`Name:${maxValue}`);
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'name');
      assert.strictEqual(value, maxValue);
    });

    it('应该接受最大长度的整行', () => {
      const nameLen = DEFAULT_HEADER_LIMITS.maxHeaderNameBytes;
      const valueLen = DEFAULT_HEADER_LIMITS.maxHeaderLineBytes - nameLen - 1;
      const headerBuf = Buffer.from(`${'N'.repeat(nameLen)}:${'V'.repeat(valueLen)}`);
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name.length, nameLen);
      assert.strictEqual(value.length, valueLen);
    });
  });

  describe('错误情况', () => {
    it('应该在缺少冒号时抛出错误', () => {
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

    it('应该在头部名称过长时抛出错误', () => {
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

    it('应该在头部值过长时抛出错误', () => {
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

    it('应该在整行过长时抛出错误', () => {
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

  describe('自定义限制', () => {
    it('应该遵守自定义的头部名称限制', () => {
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

    it('应该遵守自定义的头部值限制', () => {
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

    it('应该遵守自定义的整行限制', () => {
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

  describe('特殊字符处理', () => {
    it('应该正确处理 ASCII 可打印字符', () => {
      const headerBuf = Buffer.from('X-Special:!@#$%^&*()_+-=[]{}|;:",.<>?/~`');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'x-special');
      assert.strictEqual(value, '!@#$%^&*()_+-=[]{}|;:",.<>?/~`');
    });

    it('应该正确处理数字', () => {
      const headerBuf = Buffer.from('Content-Length:12345');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'content-length');
      assert.strictEqual(value, '12345');
    });
  });
});

describe('decodeHeaderLine', () => {
  it('应该正确解析简单的头部行', () => {
    const buffer = Buffer.from('Content-Type: application/json');
    const limit = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    const [name, value] = decodeHeaderLine(buffer, limit);
    assert.strictEqual(name, 'content-type');
    assert.strictEqual(value, 'application/json');
  });

  it('应该正确解析带空格的头部值', () => {
    const buffer = Buffer.from('Authorization: Bearer token123');
    const limit = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    const [name, value] = decodeHeaderLine(buffer, limit);
    assert.strictEqual(name, 'authorization');
    assert.strictEqual(value, 'Bearer token123');
  });

  it('应该在头部行过大时抛出错误', () => {
    const buffer = Buffer.from('Content-Type: application/json');
    const limit = {
      maxHeaderLineBytes: 10,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    assert.throws(
      () => decodeHeaderLine(buffer, limit),
    );
  });

  it('应该在缺少冒号分隔符时抛出错误', () => {
    const buffer = Buffer.from('InvalidHeader');
    const limit = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    assert.throws(
      () => decodeHeaderLine(buffer, limit),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.INVALID_HEADER &&
               err.message.includes('missing ":" separator');
      },
    );
  });

  it('应该在头部名称过大时抛出错误', () => {
    const longName = 'A'.repeat(300);
    const buffer = Buffer.from(`${longName}: value`);
    const limit = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 100,
    };

    assert.throws(
      () => decodeHeaderLine(buffer, limit),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.HEADER_NAME_TOO_LARGE;
      },
    );
  });

  it('应该在头部值过大时抛出错误', () => {
    const longValue = 'V'.repeat(10000);
    const buffer = Buffer.from(`Name: ${longValue}`);
    const limit = {
      maxHeaderLineBytes: 20000,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 50000,
      maxHeaderCount: 100,
    };

    assert.throws(
      () => decodeHeaderLine(buffer, limit),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.HEADER_VALUE_TOO_LARGE;
      },
    );
  });
});

describe('createHeadersState', () => {
  it('应该创建初始状态', () => {
    const state = createHeadersState();

    assert.strictEqual(state.phase, HeadersDecodePhase.LINE);
    assert.strictEqual(state.receivedBytes, 0);
    assert.deepStrictEqual(state.headers, {});
    assert.ok(state.buffer instanceof Buffer);
    assert.strictEqual(state.buffer.length, 0);
  });

  it('应该使用自定义限制创建状态', () => {
    const customLimit = {
      maxHeaderLineBytes: 4096,
      maxHeaderNameBytes: 128,
      maxHeaderValueBytes: 4096,
      maxHeaderBytes: 8192,
      maxHeaderCount: 50,
    };

    const state = createHeadersState(customLimit);
    assert.deepStrictEqual(state.limit, customLimit);
  });
});

describe('decodeHeaders', () => {
  it('应该解析单个头部', () => {
    const state = createHeadersState();
    const input = Buffer.from('Content-Type: application/json\r\n\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.phase, HeadersDecodePhase.DONE);
    assert.strictEqual(result.headers['content-type'], 'application/json');
    assert.strictEqual(result.headersRaw.length, 1);
  });

  it('应该解析多个头部', () => {
    const state = createHeadersState();
    const input = Buffer.from(
      'Content-Type: application/json\r\n' +
      'Authorization: Bearer token\r\n' +
      'Accept: */*\r\n' +
      '\r\n',
    );

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.phase, HeadersDecodePhase.DONE);
    assert.strictEqual(result.headers['content-type'], 'application/json');
    assert.strictEqual(result.headers['authorization'], 'Bearer token');
    assert.strictEqual(result.headers['accept'], '*/*');
    assert.strictEqual(result.headersRaw.length, 3);
  });

  it('应该处理相同名称的多个头部', () => {
    const state = createHeadersState();
    const input = Buffer.from(
      'Set-Cookie: session=abc123\r\n' +
      'Set-Cookie: user=john\r\n' +
      '\r\n',
    );

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.phase, HeadersDecodePhase.DONE);
    assert.ok(Array.isArray(result.headers['set-cookie']));
    assert.deepStrictEqual(result.headers['set-cookie'], ['session=abc123', 'user=john']);
  });

  it('应该处理分块输入', () => {
    let state = createHeadersState();

    // 第一块
    const input1 = Buffer.from('Content-Type: application/');
    state = decodeHeaders(state, input1);
    assert.strictEqual(state.phase, HeadersDecodePhase.LINE);

    // 第二块
    const input2 = Buffer.from('json\r\nAuthorization: Bearer ');
    state = decodeHeaders(state, input2);
    assert.strictEqual(state.phase, HeadersDecodePhase.LINE);

    // 第三块
    const input3 = Buffer.from('token\r\n\r\n');
    state = decodeHeaders(state, input3);
    assert.strictEqual(state.phase, HeadersDecodePhase.DONE);

    assert.strictEqual(state.headers['content-type'], 'application/json');
    assert.strictEqual(state.headers['authorization'], 'Bearer token');
  });

  it('应该去除头部名称和值的空格', () => {
    const state = createHeadersState();
    const input = Buffer.from('  Content-Type  :   application/json  \r\n\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.headers['content-type'], 'application/json');
  });

  it('应该在头部名称无效时抛出错误', () => {
    const state = createHeadersState();
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

  it('应该在头部名称为空时抛出错误', () => {
    const state = createHeadersState();
    const input = Buffer.from('  : value\r\n\r\n');

    assert.throws(
      () => decodeHeaders(state, input),
      (err) => {
        return err instanceof HttpDecodeError &&
               err.code === HttpDecodeErrorCode.INVALID_HEADER;
      },
    );
  });

  it('应该在头部数量超过限制时抛出错误', () => {
    const customLimit = {
      maxHeaderLineBytes: 8192,
      maxHeaderNameBytes: 256,
      maxHeaderValueBytes: 8192,
      maxHeaderBytes: 16384,
      maxHeaderCount: 2,
    };
    const state = createHeadersState(customLimit);
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

  it('应该在已完成后再次调用时抛出错误', () => {
    const state = createHeadersState();
    const input = Buffer.from('Content-Type: application/json\r\n\r\n');

    const result = decodeHeaders(state, input);
    assert.strictEqual(result.phase, HeadersDecodePhase.DONE);

    assert.throws(
      () => decodeHeaders(result, Buffer.from('More: data\r\n')),
      /Headers parsing already finished/,
    );
  });

  it('应该正确处理空头部（只有CRLF）', () => {
    const state = createHeadersState();
    const input = Buffer.from('\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.phase, HeadersDecodePhase.DONE);
    assert.deepStrictEqual(result.headers, {});
    assert.strictEqual(result.headersRaw.length, 0);
  });
});

describe('isHeadersFinished', () => {
  it('应该在未完成时返回false', () => {
    const state = createHeadersState();
    assert.strictEqual(isHeadersFinished(state), false);
  });

  it('应该在完成时返回true', () => {
    const state = createHeadersState();
    const input = Buffer.from('\r\n');
    const result = decodeHeaders(state, input);

    assert.strictEqual(isHeadersFinished(result), true);
  });
});

describe('边界情况测试', () => {
  it('应该处理包含特殊字符的有效头部名称', () => {
    const state = createHeadersState();
    const input = Buffer.from('X-Custom-Header_123: value\r\n\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.headers['x-custom-header_123'], 'value');
  });

  it('应该处理空值的头部', () => {
    const state = createHeadersState();
    const input = Buffer.from('Empty-Value:\r\n\r\n');

    const result = decodeHeaders(state, input);

    assert.strictEqual(result.headers['empty-value'], '');
  });

  it('应该处理三个相同名称的头部', () => {
    const state = createHeadersState();
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
