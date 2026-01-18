import * as assert from 'node:assert';
import {
  describe, it, test,
} from 'node:test';

import { HttpDecodeErrorCode } from '../errors.js';
import {
  ChunkedBodyState,
  createChunkedBodyState,
  decodeChunkedBody,
  parseChunkSize,
} from './chunked-body.js';

describe('decodeChunkedBody - error handling', () => {
  test('should throw on invalid chunk size (non-hex)', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('xyz\r\nhello\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  test('should throw on negative chunk size', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('-5\r\nhello\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  test('should throw on missing CRLF after chunk data', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhelloXX');

    assert.throws(
      () => decodeChunkedBody(state, input),
      /Missing CRLF after chunk/,
    );
  });

  test('should throw when parsing after finished', () => {
    let state = createChunkedBodyState();
    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.throws(
      () => decodeChunkedBody(state, Buffer.from('5\r\nhello\r\n')),
      /already finished/,
    );
  });

  test('should throw on invalid trailer header format', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nInvalidHeader\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      /Invalid trailer header/,
    );
  });

  test('should throw on empty header name in trailer', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\n: value\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
      /Invalid trailer header/,
    );
  });
});

describe('decodeChunkedBody - chunk size 解析', () => {
  it('应该在chunk size为空时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('\r\nhello\r\n0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在chunk size无效时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('xyz\r\nhello\r\n0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在chunk size为负数时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('-5\r\nhello\r\n0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });
});

describe('decodeChunkedBody - CRLF 验证', () => {
  it('应该在chunk data后缺少CRLF时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhelloXX0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });
});

describe('decodeChunkedBody - 边界情况', () => {
  it('应该在已完成的状态下抛出错误', () => {
    let state = createChunkedBodyState();
    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.throws(
      () => decodeChunkedBody(state, Buffer.from('5\r\nhello\r\n')),
      (err: Error) => {
        return err.message.includes('already finished');
      },
    );
  });
});

describe('decodeChunkedBody - Chunk Size 解析 - 错误', () => {
  it('应该在空 chunk size 时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('\r\nhello\r\n0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在无效的十六进制字符时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('xyz\r\nhello\r\n0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在负数 chunk size 时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('-5\r\nhello\r\n0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });
});

describe('decodeChunkedBody - CRLF 验证 - 错误', () => {
  it('应该在 chunk data 后缺少 CRLF 时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('5\r\nhelloXX0\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在只有 CR 没有 LF 时抛出错误', () => {
    const state = createChunkedBodyState();
    const result = decodeChunkedBody(state, Buffer.from('5\r\nhello\r'));

    assert.throws(
      () => decodeChunkedBody(result, Buffer.from('X')),
    );
  });
});

describe('decodeChunkedBody - Trailer Headers - 错误', () => {
  it('应该在 trailer header 缺少冒号时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nInvalidHeader\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在 trailer header key 为空时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\n: value\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });
});

describe('decodeChunkedBody - 边界情况 - 错误', () => {
  it('应该在已完成的状态上抛出错误', () => {
    let state = createChunkedBodyState();
    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.throws(
      () => decodeChunkedBody(state, Buffer.from('5\r\nhello\r\n')),
      (err: Error) => {
        return err.message.includes('already finished');
      },
    );
  });
});

describe('ChunkedBodyDecoder - 错误处理', () => {
  it('应该在无效的 chunk size 时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('invalid\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在空 chunk size 时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在缺少 CRLF 时抛出错误', () => {
    const state = createChunkedBodyState();
    const result = decodeChunkedBody(state, Buffer.from('5\r\nHello'));

    assert.throws(
      () => decodeChunkedBody(result, Buffer.from('XX')),
    );
  });

  it('应该在负数 chunk size 时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('-1\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在无效的 trailer header 格式时抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\nInvalidHeader\r\n\r\n');

    assert.throws(
      () => decodeChunkedBody(state, input),
    );
  });

  it('应该在已完成的状态上抛出错误', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('0\r\n\r\n');

    const result = decodeChunkedBody(state, input);
    assert.strictEqual(result.phase, ChunkedBodyState.FINISHED);

    assert.throws(
      () => decodeChunkedBody(result, Buffer.from('5\r\n')),
    );
  });
});

describe('parseChunkSize - 无效格式', () => {
  test('应该拒绝空字符串', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.throws(
      () => parseChunkSize('', defaultLimits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE &&
               err.message === 'Empty chunk size line';
      },
    );
  });

  test('应该拒绝只有分号的情况', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.throws(
      () => parseChunkSize(';extension', defaultLimits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE &&
               err.message === 'Empty chunk size line';
      },
    );
  });

  test('应该拒绝非十六进制字符', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.throws(
      () => parseChunkSize('1G', defaultLimits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE &&
               err.message === 'Invalid chunk size: "1G"';
      },
    );
  });

  test('应该拒绝包含空格的输入', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.throws(
      () => parseChunkSize('1 A', defaultLimits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE &&
               err.message === 'Invalid chunk size: "1 A"';
      },
    );
  });

  test('应该拒绝负数符号', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.throws(
      () => parseChunkSize('-1A', defaultLimits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE &&
               err.message === 'Invalid chunk size: "-1A"';
      },
    );
  });

  test('应该拒绝0x前缀', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.throws(
      () => parseChunkSize('0x1A', defaultLimits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE &&
               err.message === 'Invalid chunk size: "0x1A"';
      },
    );
  });
});

describe('parseChunkSize - 长度限制 - 错误', () => {
  test('应该拒绝超过最大十六进制位数的输入', () => {
    const limits = {
      maxChunkSizeHexDigits: 4,
      maxChunkSize: 1024 * 1024,
    };
    assert.throws(
      () => parseChunkSize('12345', limits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE &&
               err.message === 'Chunk size hex digits exceed limit of 4';
      },
    );
  });
});

describe('parseChunkSize - 大小限制 - 错误', () => {
  test('应该拒绝超过最大chunk大小的值', () => {
    const limits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 100,
    };
    assert.throws(
      () => parseChunkSize('FF', limits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE &&
               err.message === 'Chunk size exceeds maximum allowed of 100';
      },
    );
  });
});

describe('parseChunkSize - 错误情况 - 无效的chunk size', () => {
  it('应该拒绝空字符串', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    assert.throws(
      () => parseChunkSize('', defaultLimits),
      (err: HttpDecodeError) => {
        return (
          err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE &&
          err.message === 'Empty chunk size line'
        );
      },
    );
  });

  it('应该拒绝只包含分号的字符串', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    assert.throws(
      () => parseChunkSize(';extension', defaultLimits),
      (err: HttpDecodeError) => {
        return (
          err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE &&
          err.message === 'Empty chunk size line'
        );
      },
    );
  });

  it('应该拒绝非十六进制字符', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    assert.throws(
      () => parseChunkSize('1G', defaultLimits),
      (err: HttpDecodeError) => {
        return (
          err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE &&
          err.message.includes('Invalid chunk size: "1G"')
        );
      },
    );
  });

  it('应该拒绝包含空格的字符串', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    assert.throws(
      () => parseChunkSize('1 a', defaultLimits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE;
      },
    );
  });

  it('应该拒绝负号', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    assert.throws(
      () => parseChunkSize('-1a', defaultLimits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE;
      },
    );
  });

  it('应该拒绝加号', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    assert.throws(
      () => parseChunkSize('+1a', defaultLimits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.INVALID_CHUNK_SIZE;
      },
    );
  });
});

describe('parseChunkSize - 错误情况 - chunk size过大', () => {
  it('应该拒绝超过maxChunkSizeHexDigits的十六进制位数', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const limits = { ...defaultLimits, maxChunkSizeHexDigits: 4 };

    assert.throws(
      () => parseChunkSize('12345', limits),
      (err: HttpDecodeError) => {
        return (
          err.code === HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE &&
          err.message.includes('hex digits exceed limit of 4')
        );
      },
    );
  });

  it('应该拒绝超过maxChunkSize的数值', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const limits = { ...defaultLimits, maxChunkSize: 100 };

    assert.throws(
      () => parseChunkSize('FF', limits),
      (err: HttpDecodeError) => {
        return (
          err.code === HttpDecodeErrorCode.CHUNK_SIZE_TOO_LARGE &&
          err.message.includes('exceeds maximum allowed of 100')
        );
      },
    );
  });
});

describe('parseChunkSize - 错误情况 - 不支持的扩展', () => {
  it('当maxChunkExtensionLength为0且有扩展时应该抛出错误', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const limits = { ...defaultLimits, maxChunkExtensionLength: 0 };

    assert.throws(
      () => parseChunkSize('1a;extension', limits),
      (err: HttpDecodeError) => {
        return err.code === HttpDecodeErrorCode.UNSUPPORTED_CHUNK_EXTENSION;
      },
    );
  });
});
