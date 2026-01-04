import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { DEFAULT_HEADER_LIMITS } from '../specs.js';
import { createHeadersState, decodeHeaderLine, decodeHeaders,HeadersDecodePhase } from './headers.js';

describe('createHeadersState', () => {
  it('should create initial state with empty values', () => {
    const state = createHeadersState();

    assert.strictEqual(state.buffer.length, 0);
    assert.deepStrictEqual(state.headers, {});
    assert.deepStrictEqual(state.rawHeaders, []);
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
      assert.deepStrictEqual(result.rawHeaders, ['Host', ' example.com']);
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
      assert.deepStrictEqual(result.rawHeaders, [
        'Set-Cookie',
        ' cookie1=value1',
        'Set-Cookie',
        ' cookie2=value2',
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
      console.log(result);
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
      assert.strictEqual(result.rawHeaders[0], 'Content-Type'); // Raw keeps original case
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
      assert.deepStrictEqual(result.rawHeaders, ['X-Empty-Header', ' ']);
    });

    it('should preserve raw headers order', () => {
      const state = createHeadersState();
      const input = Buffer.from(
        'Content-Type: application/json\r\n' +
        'Host: example.com\r\n' +
        'Content-Length: 123\r\n\r\n',
      );
      const result = decodeHeaders(state, input);

      assert.deepStrictEqual(result.rawHeaders, [
        'Content-Type', ' application/json',
        'Host', ' example.com',
        'Content-Length', ' 123',
      ]);
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
      state.rawHeaders = ['Host', 'example.com'];
      state.receivedBytes = 19;

      const input = Buffer.from('Accept: */*\r\n');
      const result = decodeHeaders(state, input);

      assert.strictEqual(result.headers['host'], 'example.com');
      assert.strictEqual(result.headers['accept'], '*/*');
      assert.deepStrictEqual(result.rawHeaders, [
        'Host',
        'example.com',
        'Accept',
        ' */*',
      ]);
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

      assert.strictEqual(name, 'Content-Type');
      assert.strictEqual(value, 'application/json');
    });

    it('应该正确处理带空格的头部值', () => {
      const headerBuf = Buffer.from('Content-Type: application/json; charset=utf-8');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'Content-Type');
      assert.strictEqual(value, ' application/json; charset=utf-8');
    });

    it('应该正确处理头部名称和值前后的空格', () => {
      const headerBuf = Buffer.from('  User-Agent  :  Mozilla/5.0  ');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, '  User-Agent  ');
      assert.strictEqual(value, '  Mozilla/5.0  ');
    });

    it('应该正确处理空值', () => {
      const headerBuf = Buffer.from('X-Custom-Header:');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'X-Custom-Header');
      assert.strictEqual(value, '');
    });

    it('应该正确处理包含多个冒号的值', () => {
      const headerBuf = Buffer.from('Authorization:Bearer:token:with:colons');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'Authorization');
      assert.strictEqual(value, 'Bearer:token:with:colons');
    });

    it('应该正确处理单字符头部名称', () => {
      const headerBuf = Buffer.from('X:value');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'X');
      assert.strictEqual(value, 'value');
    });
  });

  describe('边界情况', () => {
    it('应该接受最大长度的头部名称', () => {
      const maxName = 'A'.repeat(DEFAULT_HEADER_LIMITS.maxHeaderNameBytes);
      const headerBuf = Buffer.from(`${maxName}:value`);
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, maxName);
      assert.strictEqual(value, 'value');
    });

    it('应该接受最大长度的头部值', () => {
      const maxValue = 'V'.repeat(DEFAULT_HEADER_LIMITS.maxHeaderValueBytes);
      const headerBuf = Buffer.from(`Name:${maxValue}`);
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'Name');
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

      assert.strictEqual(name, 'X-Special');
      assert.strictEqual(value, '!@#$%^&*()_+-=[]{}|;:",.<>?/~`');
    });

    it('应该正确处理数字', () => {
      const headerBuf = Buffer.from('Content-Length:12345');
      const [name, value] = decodeHeaderLine(headerBuf, DEFAULT_HEADER_LIMITS);

      assert.strictEqual(name, 'Content-Length');
      assert.strictEqual(value, '12345');
    });
  });
});
