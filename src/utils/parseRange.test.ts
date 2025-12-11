import * as assert from 'node:assert';
import { describe, test } from 'node:test';

import parseRange from './parseRange.js';

describe('parseRange - HTTP Range 请求解析器', () => {

  // ============================================================================
  // 基本功能测试
  // ============================================================================
  describe('基本功能', () => {
    test('完整范围: bytes=0-499 (请求前500字节)', () => {
      const result = parseRange('bytes=0-499', 1000);
      assert.deepStrictEqual(result, [0, 499]);
    });

    test('开放式范围: bytes=500- (从第500字节到文件末尾)', () => {
      const result = parseRange('bytes=500-', 1000);
      assert.deepStrictEqual(result, [500, 999]);
    });

    test('后缀范围: bytes=-500 (最后500字节)', () => {
      const result = parseRange('bytes=-500', 1000);
      assert.deepStrictEqual(result, [500, 999]);
    });

    test('单字节请求: bytes=0-0', () => {
      const result = parseRange('bytes=0-0', 1000);
      assert.deepStrictEqual(result, [0, 0]);
    });

    test('最后一个字节: bytes=999-999', () => {
      const result = parseRange('bytes=999-999', 1000);
      assert.deepStrictEqual(result, [999, 999]);
    });
  });

  // ============================================================================
  // 格式容错性测试
  // ============================================================================
  describe('格式容错性', () => {
    test('允许空格: " bytes = 200 - 300 "', () => {
      const result = parseRange(' bytes = 200 - 300 ', 1000);
      assert.deepStrictEqual(result, [200, 300]);
    });

    test('大小写不敏感: "BYTES=0-100"', () => {
      const result = parseRange('BYTES=0-100', 1000);
      assert.deepStrictEqual(result, [0, 100]);
    });

    test('混合大小写: "BytEs=100-200"', () => {
      const result = parseRange('BytEs=100-200', 1000);
      assert.deepStrictEqual(result, [100, 200]);
    });
  });

  // ============================================================================
  // 边界条件测试
  // ============================================================================
  describe('边界条件', () => {
    describe('极小文件', () => {
      test('1字节文件: bytes=0-0', () => {
        const result = parseRange('bytes=0-0', 1);
        assert.deepStrictEqual(result, [0, 0]);
      });

      test('空文件 (0字节): 任何请求都应失败', () => {
        assert.throws(
          () => parseRange('bytes=0-0', 0),
          { statusCode: 416 },
        );
      });
    });

    describe('极大文件', () => {
      test('最大安全整数范围', () => {
        const contentSize = Number.MAX_SAFE_INTEGER;
        const result = parseRange('bytes=1000000-2000000', contentSize);
        assert.deepStrictEqual(result, [1000000, 2000000]);
      });

      test('接近最大值的后缀请求', () => {
        const contentSize = Number.MAX_SAFE_INTEGER;
        const result = parseRange('bytes=-1000', contentSize);
        assert.deepStrictEqual(result, [contentSize - 1000, contentSize - 1]);
      });
    });

    describe('文件边界位置', () => {
      const size = 20;

      test('第一个字节: bytes=0-0', () => {
        assert.deepStrictEqual(parseRange('bytes=0-0', size), [0, 0]);
      });

      test('最后一个字节: bytes=19-19', () => {
        assert.deepStrictEqual(parseRange('bytes=19-19', size), [19, 19]);
      });

      test('整个文件: bytes=0-19', () => {
        assert.deepStrictEqual(parseRange('bytes=0-19', size), [0, 19]);
      });

      test('倒数第二个字节: bytes=18-18', () => {
        assert.deepStrictEqual(parseRange('bytes=18-18', size), [18, 18]);
      });
    });
  });

  // ============================================================================
  // 开放式范围测试 (bytes=start-)
  // ============================================================================
  describe('开放式范围 (bytes=start-)', () => {
    const size = 20;

    test('从开头到结尾: bytes=0-', () => {
      assert.deepStrictEqual(parseRange('bytes=0-', size), [0, 19]);
    });

    test('从中间到结尾: bytes=10-', () => {
      assert.deepStrictEqual(parseRange('bytes=10-', size), [10, 19]);
    });

    test('只要最后一个字节: bytes=19-', () => {
      assert.deepStrictEqual(parseRange('bytes=19-', size), [19, 19]);
    });

    test('只要最后两个字节: bytes=18-', () => {
      assert.deepStrictEqual(parseRange('bytes=18-', size), [18, 19]);
    });

    test('开始位置等于文件大小: bytes=20- (应失败)', () => {
      assert.throws(
        () => parseRange('bytes=20-', size),
        { statusCode: 416 },
      );
    });

    test('开始位置超过文件大小: bytes=45- (应失败)', () => {
      assert.throws(
        () => parseRange('bytes=45-', size),
        { statusCode: 416 },
      );
    });
  });

  // ============================================================================
  // 后缀范围测试 (bytes=-length)
  // ============================================================================
  describe('后缀范围 (bytes=-length)', () => {
    const size = 20;

    test('最后一个字节: bytes=-1', () => {
      assert.deepStrictEqual(parseRange('bytes=-1', size), [19, 19]);
    });

    test('最后两个字节: bytes=-2', () => {
      assert.deepStrictEqual(parseRange('bytes=-2', size), [18, 19]);
    });

    test('最后8个字节: bytes=-8', () => {
      assert.deepStrictEqual(parseRange('bytes=-8', size), [12, 19]);
    });

    test('最后19个字节: bytes=-19', () => {
      assert.deepStrictEqual(parseRange('bytes=-19', size), [1, 19]);
    });

    test('整个文件: bytes=-20', () => {
      assert.deepStrictEqual(parseRange('bytes=-20', size), [0, 19]);
    });

    test('后缀长度等于文件大小+1: bytes=-21 (应失败)', () => {
      assert.throws(
        () => parseRange('bytes=-21', size),
        { statusCode: 416 },
      );
    });

    test('后缀长度远超文件大小: bytes=-30 (应失败)', () => {
      assert.throws(
        () => parseRange('bytes=-30', size),
        { statusCode: 416 },
      );
    });

    test('后缀长度为0: bytes=-0 (应失败)', () => {
      assert.throws(
        () => parseRange('bytes=-0', size),
        { statusCode: 400 },
      );
    });
  });

  // ============================================================================
  // 综合范围测试
  // ============================================================================
  describe('综合范围测试', () => {
    const size = 20;

    test('bytes=0-4: 前5个字节', () => {
      assert.deepStrictEqual(parseRange('bytes=0-4', size), [0, 4]);
    });

    test('bytes=0-1: 前2个字节', () => {
      assert.deepStrictEqual(parseRange('bytes=0-1', size), [0, 1]);
    });

    test('bytes=5-8: 中间4个字节', () => {
      assert.deepStrictEqual(parseRange('bytes=5-8', size), [5, 8]);
    });

    test('bytes=3-: 从第4个字节到末尾', () => {
      assert.deepStrictEqual(parseRange('bytes=3-', size), [3, 19]);
    });

    test('bytes=10-15: 中间6个字节', () => {
      assert.deepStrictEqual(parseRange('bytes=10-15', size), [10, 15]);
    });
  });

  // ============================================================================
  // 400 错误测试 (客户端格式错误)
  // ============================================================================
  describe('400 Bad Request - 格式错误', () => {
    describe('缺少必要组件', () => {
      test('缺少 "bytes" 前缀', () => {
        assert.throws(
          () => parseRange('0-499', 1000),
          { statusCode: 400 },
        );
      });

      test('缺少等号', () => {
        assert.throws(
          () => parseRange('bytes 0-499', 1000),
          { statusCode: 400 },
        );
      });

      test('缺少连字符', () => {
        assert.throws(
          () => parseRange('bytes=0499', 1000),
          { statusCode: 400 },
        );
      });
    });

    describe('空值错误', () => {
      test('开始和结束都为空: bytes=-', () => {
        assert.throws(
          () => parseRange('bytes=-', 1000),
          { message: 'Invalid range: both start and end are empty' },
        );
      });
    });

    describe('逻辑错误', () => {
      test('开始位置大于结束位置: bytes=500-200', () => {
        assert.throws(
          () => parseRange('bytes=500-200', 1000),
          { message: 'Invalid range: start is greater than end' },
        );
      });

      test('结束位置为0但开始位置大于0: bytes=100-0', () => {
        assert.throws(
          () => parseRange('bytes=100-0', 1000),
          { statusCode: 400 },
        );
      });
    });

    describe('非法字符', () => {
      test('非数字字符: bytes=abc-def', () => {
        assert.throws(
          () => parseRange('bytes=abc-def', 1000),
          { statusCode: 400 },
        );
      });

      test('包含小数点: bytes=10.5-20.5', () => {
        assert.throws(
          () => parseRange('bytes=10.5-20.5', 1000),
          { statusCode: 400 },
        );
      });

      test('负数开始位置: bytes=-100-200', () => {
        assert.throws(
          () => parseRange('bytes=-100-200', 1000),
          { statusCode: 400 },
        );
      });

      test('包含特殊字符: bytes=10@-20#', () => {
        assert.throws(
          () => parseRange('bytes=10@-20#', 1000),
          { statusCode: 400 },
        );
      });
    });

    describe('数值超限', () => {
      test('超出安全整数范围', () => {
        const largeNumber = (Number.MAX_SAFE_INTEGER + 1).toString();
        assert.throws(
          () => parseRange(`bytes=${largeNumber}-${largeNumber}`, Number.MAX_SAFE_INTEGER),
          { message: 'Invalid range: start is not a valid safe integer' },
        );
      });

      test('科学计数法: bytes=1e10-2e10', () => {
        assert.throws(
          () => parseRange('bytes=1e10-2e10', Number.MAX_SAFE_INTEGER),
          { statusCode: 400 },
        );
      });
    });

    describe('类型错误', () => {
      test('非字符串输入: 数字', () => {
        assert.throws(
          () => parseRange(123 as any, 1000), // eslint-disable-line
          { message: 'Range header must be a string' },
        );
      });

      test('null 输入', () => {
        assert.throws(
          () => parseRange(null as any, 1000), // eslint-disable-line
          { message: 'Range header must be a string' },
        );
      });

      test('undefined 输入', () => {
        assert.throws(
          () => parseRange(undefined as any, 1000), // eslint-disable-line
          { message: 'Range header must be a string' },
        );
      });

      test('对象输入', () => {
        assert.throws(
          () => parseRange({} as any, 1000), // eslint-disable-line
          { message: 'Range header must be a string' },
        );
      });

      test('数组输入', () => {
        assert.throws(
          () => parseRange(['bytes=0-100'] as any, 1000), // eslint-disable-line
          { message: 'Range header must be a string' },
        );
      });
    });
  });

  // ============================================================================
  // 416 错误测试 (范围不可满足)
  // ============================================================================
  describe('416 Range Not Satisfiable - 范围超出', () => {
    describe('开始位置超出', () => {
      test('开始位置等于文件大小: bytes=1000-1500', () => {
        assert.throws(
          () => parseRange('bytes=1000-1500', 1000),
          {
            message: 'Range not satisfiable: start beyond content size',
            statusCode: 416,
          },
        );
      });

      test('开始位置大于文件大小: bytes=1500-2000', () => {
        assert.throws(
          () => parseRange('bytes=1500-2000', 1000),
          {
            message: 'Range not satisfiable: start beyond content size',
            statusCode: 416,
          },
        );
      });
    });

    describe('结束位置超出', () => {
      test('结束位置超过文件大小: bytes=500-2000', () => {
        assert.throws(
          () => parseRange('bytes=500-2000', 1000),
          { statusCode: 416 },
        );
      });

      test('结束位置等于文件大小: bytes=0-1000 (文件大小1000)', () => {
        assert.throws(
          () => parseRange('bytes=0-1000', 1000),
          { statusCode: 416 },
        );
      });
    });

    describe('空文件请求', () => {
      test('空文件请求单字节: bytes=0-0', () => {
        assert.throws(
          () => parseRange('bytes=0-0', 0),
          { statusCode: 416 },
        );
      });

      test('空文件请求范围: bytes=0-1', () => {
        assert.throws(
          () => parseRange('bytes=0-1', 0),
          { statusCode: 416 },
        );
      });

      test('空文件请求后缀: bytes=-1', () => {
        assert.throws(
          () => parseRange('bytes=-1', 0),
          { statusCode: 416 },
        );
      });
    });

    describe('后缀范围超出', () => {
      test('后缀大于文件大小: bytes=-2000 (文件1000字节)', () => {
        assert.throws(
          () => parseRange('bytes=-2000', 1000),
          { statusCode: 416 },
        );
      });

      test('精确超出一个字节: bytes=-21 (文件20字节)', () => {
        assert.throws(
          () => parseRange('bytes=-21', 20),
          { statusCode: 416 },
        );
      });
    });
  });

  // ============================================================================
  // 500 错误测试 (服务器参数错误)
  // ============================================================================
  describe('500 Internal Server Error - 服务器参数错误', () => {
    describe('内容大小参数错误', () => {
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

      test('内容大小为 NaN', () => {
        assert.throws(
          () => parseRange('bytes=0-100', NaN),
          { message: 'Content size must be a non-negative integer' },
        );
      });

      test('内容大小为 Infinity', () => {
        assert.throws(
          () => parseRange('bytes=0-100', Infinity),
          { message: 'Content size must be a non-negative integer' },
        );
      });
    });

    describe('内容大小类型错误', () => {
      test('内容大小为字符串', () => {
        assert.throws(
          () => parseRange('bytes=0-100', '1000' as any), // eslint-disable-line
          { message: 'Content size must be a non-negative integer' },
        );
      });

      test('内容大小为 null', () => {
        assert.throws(
          () => parseRange('bytes=0-100', null as any), // eslint-disable-line
          { message: 'Content size must be a non-negative integer' },
        );
      });

      test('内容大小为 undefined', () => {
        assert.throws(
          () => parseRange('bytes=0-100', undefined as any), // eslint-disable-line
          { message: 'Content size must be a non-negative integer' },
        );
      });

      test('内容大小为对象', () => {
        assert.throws(
          () => parseRange('bytes=0-100', {} as any), // eslint-disable-line
          { message: 'Content size must be a non-negative integer' },
        );
      });
    });
  });

  // ============================================================================
  // 实际应用场景测试
  // ============================================================================
  describe('实际应用场景', () => {
    describe('视频流媒体', () => {
      test('10MB 视频文件 - 下载第 1-2MB', () => {
        const fileSize = 10485760; // 10MB
        const result = parseRange('bytes=1048576-2097151', fileSize);
        assert.deepStrictEqual(result, [1048576, 2097151]);
      });

      test('4K 视频 - 初始播放缓冲 (前 10MB)', () => {
        const fileSize = 4294967296; // 4GB
        const result = parseRange('bytes=0-10485759', fileSize);
        assert.deepStrictEqual(result, [0, 10485759]);
      });

      test('视频拖动 - 跳转到中间位置', () => {
        const fileSize = 104857600; // 100MB
        const result = parseRange('bytes=52428800-', fileSize); // 从50MB开始
        assert.deepStrictEqual(result, [52428800, 104857599]);
      });
    });

    describe('音频下载', () => {
      test('5MB 音频文件 - 最后 1KB (元数据)', () => {
        const fileSize = 5242880;
        const result = parseRange('bytes=-1024', fileSize);
        assert.deepStrictEqual(result, [5241856, 5242879]);
      });

      test('音频预览 - 前30秒 (约 500KB)', () => {
        const fileSize = 10485760; // 10MB 完整文件
        const result = parseRange('bytes=0-524287', fileSize);
        assert.deepStrictEqual(result, [0, 524287]);
      });
    });

    describe('图片加载', () => {
      test('2MB 图片 - 渐进式加载从中间开始', () => {
        const fileSize = 2048000;
        const result = parseRange('bytes=1024000-', fileSize);
        assert.deepStrictEqual(result, [1024000, 2047999]);
      });

      test('缩略图 - 只要前 10KB', () => {
        const fileSize = 5242880;
        const result = parseRange('bytes=0-10239', fileSize);
        assert.deepStrictEqual(result, [0, 10239]);
      });
    });

    describe('文档下载', () => {
      test('1KB 小文件 - 完整下载', () => {
        const fileSize = 1024;
        const result = parseRange('bytes=0-1023', fileSize);
        assert.deepStrictEqual(result, [0, 1023]);
      });

      test('PDF 文件 - 分块下载第一块 (1MB)', () => {
        const fileSize = 10485760; // 10MB PDF
        const result = parseRange('bytes=0-1048575', fileSize);
        assert.deepStrictEqual(result, [0, 1048575]);
      });
    });

    describe('断点续传', () => {
      test('下载中断 - 从已下载的 45% 继续', () => {
        const fileSize = 104857600; // 100MB
        const downloaded = Math.floor(fileSize * 0.45);
        const result = parseRange(`bytes=${downloaded}-`, fileSize);
        assert.deepStrictEqual(result, [downloaded, fileSize - 1]);
      });

      test('最后一个分片 - 可能小于标准块大小', () => {
        const fileSize = 10500000; // 10.5MB
        const chunkSize = 1048576; // 1MB 块
        const lastChunkStart = Math.floor(fileSize / chunkSize) * chunkSize;
        const result = parseRange(`bytes=${lastChunkStart}-`, fileSize);
        assert.deepStrictEqual(result, [lastChunkStart, fileSize - 1]);
      });
    });

    describe('浏览器典型行为', () => {
      test('Chrome - 请求整个文件', () => {
        const fileSize = 1000000;
        const result = parseRange('bytes=0-', fileSize);
        assert.deepStrictEqual(result, [0, 999999]);
      });

      test('Safari - 首次请求前两个字节验证', () => {
        const fileSize = 1000000;
        const result = parseRange('bytes=0-1', fileSize);
        assert.deepStrictEqual(result, [0, 1]);
      });

      test('Edge - 请求最后 256 字节检查文件完整性', () => {
        const fileSize = 1048576; // 1MB
        const result = parseRange('bytes=-256', fileSize);
        assert.deepStrictEqual(result, [1048320, 1048575]);
      });
    });

    describe('CDN 和缓存场景', () => {
      test('CDN 分片缓存 - 每 10MB 一个分片', () => {
        const fileSize = 104857600; // 100MB
        const result = parseRange('bytes=10485760-20971519', fileSize); // 第二个10MB
        assert.deepStrictEqual(result, [10485760, 20971519]);
      });

      test('范围预取 - 提前加载接下来的内容', () => {
        const fileSize = 52428800; // 50MB
        const currentPos = 10485760; // 当前播放到10MB
        const prefetchSize = 5242880; // 预取5MB
        const result = parseRange(
          `bytes=${currentPos}-${currentPos + prefetchSize - 1}`,
          fileSize,
        );
        assert.deepStrictEqual(result, [currentPos, currentPos + prefetchSize - 1]);
      });
    });
  });

  // ============================================================================
  // 性能和压力测试
  // ============================================================================
  describe('性能和边界情况', () => {
    test('非常大的文件 - 接近 MAX_SAFE_INTEGER', () => {
      const fileSize = Number.MAX_SAFE_INTEGER;
      const start = fileSize - 1000000;
      const result = parseRange(`bytes=${start}-${fileSize - 1}`, fileSize);
      assert.deepStrictEqual(result, [start, fileSize - 1]);
    });

    test('极小范围 - 单字节', () => {
      const fileSize = Number.MAX_SAFE_INTEGER;
      const pos = Math.floor(fileSize / 2);
      const result = parseRange(`bytes=${pos}-${pos}`, fileSize);
      assert.deepStrictEqual(result, [pos, pos]);
    });

    test('多个连续的范围请求模拟', () => {
      const fileSize = 1000;
      const ranges = [
        'bytes=0-99',
        'bytes=100-199',
        'bytes=200-299',
        'bytes=900-999',
      ];

      const results = ranges.map(r => parseRange(r, fileSize));
      assert.deepStrictEqual(results, [
        [0, 99],
        [100, 199],
        [200, 299],
        [900, 999],
      ]);
    });
  });
});
