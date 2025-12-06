import * as assert from 'node:assert';
import { describe,test } from 'node:test';

import parseRange from './parseRange.js';

describe('Range Parser', () => {
  describe('正常情况', () => {
    test('解析完整范围 "bytes=0-499"', () => {
      const result = parseRange('bytes=0-499', 1000);
      assert.deepStrictEqual(result, [0, 499]);
    });

    test('解析开始范围 "bytes=500-"', () => {
      const result = parseRange('bytes=500-', 1000);
      assert.deepStrictEqual(result, [500, 999]);
    });

    test('解析后缀范围 "bytes=-500"', () => {
      const result = parseRange('bytes=-500', 1000);
      assert.deepStrictEqual(result, [500, 999]);
    });

    test('解析单字节范围 "bytes=0-0"', () => {
      const result = parseRange('bytes=0-0', 1000);
      assert.deepStrictEqual(result, [0, 0]);
    });

    test('解析最后一个字节 "bytes=999-999"', () => {
      const result = parseRange('bytes=999-999', 1000);
      assert.deepStrictEqual(result, [999, 999]);
    });

    test('处理空格 " bytes = 200 - 300 "', () => {
      const result = parseRange(' bytes = 200 - 300 ', 1000);
      assert.deepStrictEqual(result, [200, 300]);
    });

    test('大小写不敏感 "BYTES=0-100"', () => {
      const result = parseRange('BYTES=0-100', 1000);
      assert.deepStrictEqual(result, [0, 100]);
    });
  });

  describe('边界情况', () => {
    test('内容大小为 0 时的有效请求 "bytes=0-0"', () => {
      assert.throws(
        () => parseRange('bytes=0-0', 0),
        { statusCode: 416, message: 'Range not satisfiable: end beyond content size' },
      );
      assert.throws(
        () => parseRange('bytes=0-20', 20),
        { statusCode: 416 },
      );
    });

    test('内容大小为 1 的文件 "bytes=0-0"', () => {
      const result = parseRange('bytes=0-0', 1);
      assert.deepStrictEqual(result, [0, 0]);
    });

    test('后缀范围大于内容大小 "bytes=-2000"', () => {
      assert.throws(() => {
        parseRange('bytes=-2000', 1000);
      });
    });

    test('结束位置超出内容大小 "bytes=500-2000"', () => {
      assert.throws(() => {
        parseRange('bytes=500-2000', 1000);
      });
    });

    test('大数值范围', () => {
      const contentSize = Number.MAX_SAFE_INTEGER;
      const result = parseRange('bytes=1000000-2000000', contentSize);
      assert.deepStrictEqual(result, [1000000, 2000000]);
    });

    test('最后21个字节，但是文件大小只有20字节', () => {
      assert.throws(
        () => parseRange('bytes=-21', 20),
        { statusCode: 416 },
      );
    });
  });

  describe('400 错误 - 格式错误', () => {
    test('无效格式 - 缺少 bytes 前缀', () => {
      assert.throws(
        () => parseRange('0-499', 1000),
        { statusCode: 400 },
      );
    });

    test('无效格式 - 缺少等号', () => {
      assert.throws(
        () => parseRange('bytes 0-499', 1000),
        { statusCode: 400 },
      );
    });

    test('无效格式 - 缺少连字符', () => {
      assert.throws(
        () => parseRange('bytes=0499', 1000),
        { statusCode: 400 },
      );
    });

    test('开始和结束都为空 "bytes=-"', () => {
      assert.throws(
        () => parseRange('bytes=-', 1000),
        { message: 'Invalid range: both start and end are empty' },
      );
    });

    test('开始位置大于结束位置 "bytes=500-200"', () => {
      assert.throws(
        () => parseRange('bytes=500-200', 1000),
        { message: 'Invalid range: start is greater than end' },
      );
    });

    test('负数开始位置 "bytes=-100-200"', () => {
      assert.throws(
        () => parseRange('bytes=-100-200', 1000),
      );
    });

    test('非数字字符 "bytes=abc-def"', () => {
      assert.throws(
        () => parseRange('bytes=abc-def', 1000),
      );
    });

    test('包含小数点 "bytes=10.5-20.5"', () => {
      assert.throws(
        () => parseRange('bytes=10.5-20.5', 1000),
      );
    });

    test('超出安全整数范围', () => {
      const largeNumber = (Number.MAX_SAFE_INTEGER + 1).toString();
      assert.throws(
        () => parseRange(`bytes=${largeNumber}-${largeNumber}`, Number.MAX_SAFE_INTEGER),
        { message: 'Invalid range: start is not a valid safe integer' },
      );
    });

    test('非字符串输入', () => {
      assert.throws(
        () => parseRange(123 as any, 1000), // eslint-disable-line
        { message: 'Range header must be a string' },
      );
    });

    test('null 输入', () => {
      assert.throws(
        () => parseRange(null, 1000),
        { message: 'Range header must be a string' },
      );
    });

    test('undefined 输入', () => {
      assert.throws(
        () => parseRange(undefined, 1000),
        { message: 'Range header must be a string' },
      );
    });
  });

  describe('416 错误 - 范围不满足', () => {
    test('开始位置等于内容大小 "bytes=1000-1500"', () => {
      assert.throws(
        () => parseRange('bytes=1000-1500', 1000),
        {
          message: 'Range not satisfiable: start beyond content size',
          statusCode: 416,
        },
      );
    });

    test('开始位置大于内容大小 "bytes=1500-2000"', () => {
      assert.throws(
        () => parseRange('bytes=1500-2000', 1000),
        {
          message: 'Range not satisfiable: start beyond content size',
          statusCode: 416,
        },
      );
    });

    test('空内容但请求非零范围 "bytes=0-1"', () => {
      assert.throws(
        () => parseRange('bytes=0-1', 0),
        {
          statusCode: 416,
        },
      );
    });

    test('空内容但请求后缀范围 "bytes=-1"', () => {
      assert.throws(
        () => parseRange('bytes=-1', 0),
      );
    });
  });

  describe('500 错误 - 服务器参数错误', () => {
    test('内容大小为负数', () => {
      assert.throws(
        () => parseRange('bytes=0-100', -1),
        { message: 'Content size must be a non-negative integer' },
      );
    });

    test('内容大小为小数', () => {
      assert.throws(
        () => parseRange('bytes=0-100', 100.5),
        { message: 'Content size must be a non-negative integer' },
      );
    });

    test('内容大小为字符串', () => {
      assert.throws(
        () => parseRange('bytes=0-100', '1000' as any),// eslint-disable-line
        { message: 'Content size must be a non-negative integer' },
      );
    });

    test('内容大小为 null', () => {
      assert.throws(
        () => parseRange('bytes=0-100', null),
        { message: 'Content size must be a non-negative integer' },
      );
    });
  });

  describe('一些范围测试', () => {
    assert.deepStrictEqual(parseRange('bytes=0-4', 20), [0, 4]);
    assert.deepStrictEqual(parseRange('bytes=0-1', 20), [0, 1]);
    assert.deepStrictEqual(parseRange('bytes=0-0', 20), [0, 0]);
    assert.deepStrictEqual(parseRange('bytes =5-8', 20), [5, 8]);
    assert.deepStrictEqual(parseRange('bytes=3-', 20), [3, 19]);
    assert.deepStrictEqual(parseRange('bytes=-8', 20), [12, 19]);
    assert.deepStrictEqual(parseRange('bytes=-1', 20), [19, 19]);
    assert.deepStrictEqual(parseRange('bytes=-19', 20), [1, 19]);
    assert.deepStrictEqual(parseRange('bytes=-20', 20), [0, 19]);
  });

  describe('结束为空 "bytes=0-"', () => {
    test('开始超过文件大小', () => {
      assert.throws(
        () => parseRange('bytes=45-', 20),
        { statusCode: 416 },
      );
    });
    test('边界测试', () => {
      assert.deepStrictEqual(
        parseRange('bytes=19-', 20),
        [19, 19],
      );
      assert.deepStrictEqual(
        parseRange('bytes=18-', 20),
        [18, 19],
      );
      assert.deepStrictEqual(
        parseRange('bytes=0-', 20),
        [0, 19],
      );
      assert.throws(
        () => parseRange('bytes=20-', 20),
        { statusCode: 416 },
      );
    });
  });

  describe('开始为空 "bytes=-1"', () => {
    test('结束超过文件大小', () => {
      assert.throws(
        () => parseRange('bytes=-30', 20),
        { statusCode: 416 },
      );
    });
    test('边界测试', () => {
      assert.deepStrictEqual(
        parseRange('bytes=-19', 20),
        [1, 19],
      );
      assert.deepStrictEqual(
        parseRange('bytes=-1', 20),
        [19, 19],
      );
      assert.deepStrictEqual(
        parseRange('bytes=-20', 20),
        [0, 19],
      );
      assert.throws(
        () => parseRange('bytes=-21', 20),
        { statusCode: 416 },
      );
      assert.throws(
        () => parseRange('bytes=-0', 20),
        { statusCode: 400 },
      );
    });
  });

  describe('实际场景测试', () => {
    test('视频文件部分下载', () => {
      const fileSize = 10485760; // 10MB
      const result = parseRange('bytes=1048576-2097151', fileSize); // 1MB-2MB
      assert.deepStrictEqual(result, [1048576, 2097151]);
    });

    test('音频文件最后 1KB', () => {
      const fileSize = 5242880; // 5MB
      const result = parseRange('bytes=-1024', fileSize);
      assert.deepStrictEqual(result, [5241856, 5242879]);
    });

    test('图片文件从中间开始', () => {
      const fileSize = 2048000; // ~2MB
      const result = parseRange('bytes=1024000-', fileSize);
      assert.deepStrictEqual(result, [1024000, 2047999]);
    });

    test('小文件完整下载', () => {
      const fileSize = 1024; // 1KB
      const result = parseRange('bytes=0-1023', fileSize);
      assert.deepStrictEqual(result, [0, 1023]);
    });

    test('Chrome 浏览器典型请求', () => {
      const fileSize = 1000000;
      const result = parseRange('bytes=0-', fileSize);
      assert.deepStrictEqual(result, [0, 999999]);
    });
  });
});
