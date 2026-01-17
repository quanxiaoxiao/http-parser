import * as assert from 'node:assert';
import {
  describe, it, test,
} from 'node:test';

import {
  type ChunkedBodyLimits,
  ChunkedBodyPhase,
  createChunkedBodyState,
  decodeChunkedBody,
  parseChunkSize,
} from './chunked-body.js';

describe('decodeChunkedBody - 性能和压力测试', () => {
  it('应该高效处理多个小 chunks', () => {
    let state = createChunkedBodyState();

    for (let i = 0; i < 100; i++) {
      state = decodeChunkedBody(state, Buffer.from('1\r\nX\r\n'));
    }

    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks.length, 100);
    assert.strictEqual(state.decodedBodyBytes, 100);
  });

  it('应该处理极多的 trailer headers', () => {
    const state = createChunkedBodyState();
    let trailerStr = '0\r\n';

    for (let i = 0; i < 31; i++) {
      trailerStr += `X-Header-${i}: value${i}\r\n`;
    }
    trailerStr += '\r\n';

    const result = decodeChunkedBody(state, Buffer.from(trailerStr));

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(Object.keys(result.trailers).length, 31);
  });
});

describe('ChunkedBodyDecoder - 性能和内存', () => {
  it('应该高效处理多个小 chunks', () => {
    let state = createChunkedBodyState();

    for (let i = 0; i < 100; i++) {
      state = decodeChunkedBody(state, Buffer.from('1\r\nX\r\n'));
    }

    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks.length, 100);
    assert.strictEqual(state.decodedBodyBytes, 100);
  });

  it('应该处理非常大的 chunk', () => {
    const state = createChunkedBodyState();
    const size = 10000;
    const data = 'x'.repeat(size);
    const input = Buffer.from(`${size.toString(16)}\r\n${data}\r\n0\r\n\r\n`);

    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.decodedBodyBytes, size);
    assert.strictEqual(result.chunks[0].length, size);
  });
});

describe('decodeChunkedBody - 真实场景模拟', () => {
  it('应该处理流式 JSON 响应', () => {
    let state = createChunkedBodyState();

    const chunks = [
      '{"users":[',
      '{"id":1,"name":"Alice"},',
      '{"id":2,"name":"Bob"}',
      ']}',
    ];

    for (const chunk of chunks) {
      const hex = chunk.length.toString(16);
      state = decodeChunkedBody(state, Buffer.from(`${hex}\r\n${chunk}\r\n`));
    }

    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);

    const fullBody = Buffer.concat(state.chunks).toString();
    const json = JSON.parse(fullBody);
    assert.strictEqual(json.users.length, 2);
    assert.strictEqual(json.users[0].name, 'Alice');
  });

  it('应该处理图片数据传输', () => {
    let state = createChunkedBodyState();

    const chunk1 = Buffer.alloc(1024, 0xff);
    const chunk2 = Buffer.alloc(1024, 0xaa);
    const chunk3 = Buffer.alloc(512, 0x55);

    state = decodeChunkedBody(state, Buffer.concat([
      Buffer.from('400\r\n'),
      chunk1,
      Buffer.from('\r\n'),
    ]));

    state = decodeChunkedBody(state, Buffer.concat([
      Buffer.from('400\r\n'),
      chunk2,
      Buffer.from('\r\n'),
    ]));

    state = decodeChunkedBody(state, Buffer.concat([
      Buffer.from('200\r\n'),
      chunk3,
      Buffer.from('\r\n0\r\n\r\n'),
    ]));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.decodedBodyBytes, 2560);
  });

  it('应该处理 SSE (Server-Sent Events) 格式', () => {
    let state = createChunkedBodyState();

    const events = [
      'data: message 1\n\n',
      'data: message 2\n\n',
      'data: message 3\n\n',
    ];

    for (const event of events) {
      const hex = event.length.toString(16);
      state = decodeChunkedBody(state, Buffer.from(`${hex}\r\n${event}\r\n`));
    }

    state = decodeChunkedBody(state, Buffer.from('0\r\n\r\n'));

    assert.strictEqual(state.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(state.chunks.length, 3);
  });
});

describe('decodeChunkedBody - 二进制数据处理', () => {
  it('应该保持二进制数据的完整性', () => {
    const state = createChunkedBodyState();
    const binaryData = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01, 0xfe]);
    const input = Buffer.concat([
      Buffer.from('6\r\n'),
      binaryData,
      Buffer.from('\r\n0\r\n\r\n'),
    ]);
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.deepStrictEqual(result.chunks[0], binaryData);
  });

  it('应该处理包含空字节的数据', () => {
    const state = createChunkedBodyState();
    const data = Buffer.from([0x48, 0x00, 0x69, 0x00]);
    const input = Buffer.concat([
      Buffer.from('4\r\n'),
      data,
      Buffer.from('\r\n0\r\n\r\n'),
    ]);
    const result = decodeChunkedBody(state, input);

    assert.deepStrictEqual(result.chunks[0], data);
  });

  it('应该处理全零数据', () => {
    const state = createChunkedBodyState();
    const data = Buffer.alloc(10, 0);
    const input = Buffer.concat([
      Buffer.from('a\r\n'),
      data,
      Buffer.from('\r\n0\r\n\r\n'),
    ]);
    const result = decodeChunkedBody(state, input);

    assert.deepStrictEqual(result.chunks[0], data);
  });
});

describe('decodeChunkedBody - 边界情况 - 性能', () => {
  it('应该处理最小有效 chunk (1 字节)', () => {
    const state = createChunkedBodyState();
    const input = Buffer.from('1\r\nA\r\n0\r\n\r\n');
    const result = decodeChunkedBody(state, input);

    assert.strictEqual(result.phase, ChunkedBodyPhase.FINISHED);
    assert.strictEqual(result.chunks[0].toString(), 'A');
  });

  it('应该处理空 buffer 输入', () => {
    const state = createChunkedBodyState();
    const result = decodeChunkedBody(state, Buffer.alloc(0));

    assert.strictEqual(result.phase, ChunkedBodyPhase.SIZE);
  });
});

describe('parseChunkSize - 正常解析', () => {
  test('应该正确解析十六进制数字', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('1A', defaultLimits), 26);
    assert.strictEqual(parseChunkSize('FF', defaultLimits), 255);
    assert.strictEqual(parseChunkSize('100', defaultLimits), 256);
  });

  test('应该支持小写十六进制', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('1a', defaultLimits), 26);
    assert.strictEqual(parseChunkSize('ff', defaultLimits), 255);
    assert.strictEqual(parseChunkSize('abc', defaultLimits), 2748);
  });

  test('应该支持大写十六进制', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('1A', defaultLimits), 26);
    assert.strictEqual(parseChunkSize('FF', defaultLimits), 255);
    assert.strictEqual(parseChunkSize('ABC', defaultLimits), 2748);
  });

  test('应该支持大小写混合', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('AbC', defaultLimits), 2748);
    assert.strictEqual(parseChunkSize('FfFf', defaultLimits), 65535);
  });

  test('应该正确解析0', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('0', defaultLimits), 0);
  });

  test('应该忽略分号后的扩展部分', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('1A;extension', defaultLimits), 26);
    assert.strictEqual(parseChunkSize('FF;name=value', defaultLimits), 255);
    assert.strictEqual(parseChunkSize('100;', defaultLimits), 256);
  });
});

describe('parseChunkSize - 长度限制', () => {
  test('应该接受等于最大十六进制位数的输入', () => {
    const limits = {
      maxChunkSizeHexDigits: 4,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('FFFF', limits), 65535);
  });

  test('应该接受小于最大十六进制位数的输入', () => {
    const limits = {
      maxChunkSizeHexDigits: 4,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('FFF', limits), 4095);
  });
});

describe('parseChunkSize - 大小限制', () => {
  test('应该接受等于最大chunk大小的值', () => {
    const limits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 255,
    };
    assert.strictEqual(parseChunkSize('FF', limits), 255);
  });

  test('应该接受小于最大chunk大小的值', () => {
    const limits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 255,
    };
    assert.strictEqual(parseChunkSize('FE', limits), 254);
  });
});

describe('parseChunkSize - 边界情况', () => {
  test('应该正确处理前导零', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('00FF', defaultLimits), 255);
    assert.strictEqual(parseChunkSize('000A', defaultLimits), 10);
  });

  test('应该处理大数值', () => {
    const limits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 0xFFFFFFFF,
    };
    assert.strictEqual(parseChunkSize('FFFFFF', limits), 16777215);
  });

  test('应该在分号之前截断', () => {
    const defaultLimits = {
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 1024 * 1024,
    };
    assert.strictEqual(parseChunkSize('A;;;;;', defaultLimits), 10);
    assert.strictEqual(parseChunkSize('1F;a;b;c', defaultLimits), 31);
  });
});

describe('parseChunkSize - 正常情况', () => {
  it('应该正确解析有效的十六进制chunk size', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('1a', defaultLimits);
    assert.strictEqual(result, 26);
  });

  it('应该正确解析大写十六进制', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('FF', defaultLimits);
    assert.strictEqual(result, 255);
  });

  it('应该正确解析小写十六进制', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('ff', defaultLimits);
    assert.strictEqual(result, 255);
  });

  it('应该正确解析混合大小写十六进制', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('AaBbc', defaultLimits);
    assert.strictEqual(result, 699324);
  });

  it('应该正确解析零', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('0', defaultLimits);
    assert.strictEqual(result, 0);
  });

  it('应该正确解析带有扩展的chunk size', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('1a;name=value', defaultLimits);
    assert.strictEqual(result, 26);
  });

  it('应该正确解析多个扩展参数', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('100;ext1=val1;ext2=val2', defaultLimits);
    assert.strictEqual(result, 256);
  });
});

describe('parseChunkSize - 边界情况 - 性能', () => {
  it('应该处理最大有效的十六进制值', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const limits = {
      ...defaultLimits,
      maxChunkSizeHexDigits: 8,
      maxChunkSize: 0xFFFFFFFF,
    };
    const result = parseChunkSize('FFFFFFFF', limits);
    assert.strictEqual(result, 4294967295);
  });

  it('应该处理单个零字符', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('0', defaultLimits);
    assert.strictEqual(result, 0);
  });

  it('应该处理多个前导零', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('000A', defaultLimits);
    assert.strictEqual(result, 10);
  });

  it('应该处理分号后的空扩展', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const result = parseChunkSize('1a;', defaultLimits);
    assert.strictEqual(result, 26);
  });

  it('应该处理maxChunkSizeHexDigits为1的情况', () => {
    const defaultLimits: ChunkedBodyLimits = {
      maxChunkSize: 1024 * 1024,
      maxChunkSizeHexDigits: 8,
      maxChunkExtensionLength: 100,
    };
    const limits = { ...defaultLimits, maxChunkSizeHexDigits: 1 };
    const result = parseChunkSize('A', limits);
    assert.strictEqual(result, 10);
  });
});
