import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import isValidPort from './isValidPort.js';

describe('isValidPort', () => {
  describe('有效端口号', () => {
    it('应该接受字符串格式的有效端口号', () => {
      assert.strictEqual(isValidPort('8080'), true);
      assert.strictEqual(isValidPort('3000'), true);
      assert.strictEqual(isValidPort('80'), true);
      assert.strictEqual(isValidPort('443'), true);
    });

    it('应该接受数字格式的有效端口号', () => {
      assert.strictEqual(isValidPort(8080), true);
      assert.strictEqual(isValidPort(3000), true);
      assert.strictEqual(isValidPort(80), true);
      assert.strictEqual(isValidPort(443), true);
    });

    it('应该接受边界值 1 和 65535', () => {
      assert.strictEqual(isValidPort(1), true);
      assert.strictEqual(isValidPort('1'), true);
      assert.strictEqual(isValidPort(65535), true);
      assert.strictEqual(isValidPort('65535'), true);
    });
  });

  describe('无效端口号', () => {
    it('应该拒绝超出范围的端口号', () => {
      assert.strictEqual(isValidPort(-1), false);
      assert.strictEqual(isValidPort('-1'), false);
      assert.strictEqual(isValidPort(65536), false);
      assert.strictEqual(isValidPort('65536'), false);
      assert.strictEqual(isValidPort(100000), false);
    });

    it('应该拒绝非数字字符串', () => {
      assert.strictEqual(isValidPort('abc'), false);
      assert.strictEqual(isValidPort('8080abc'), false);
      assert.strictEqual(isValidPort(''), false);
      assert.strictEqual(isValidPort('port'), false);
    });

    it('应该拒绝小数', () => {
      assert.strictEqual(isValidPort(80.5), false);
      assert.strictEqual(isValidPort('80.5'), false);
      assert.strictEqual(isValidPort(3000.1), false);
    });

    it('应该拒绝特殊值', () => {
      assert.strictEqual(isValidPort(NaN), false);
      assert.strictEqual(isValidPort(Infinity), false);
      assert.strictEqual(isValidPort(-Infinity), false);
    });

    it('应该拒绝带空格的字符串', () => {
      assert.strictEqual(isValidPort(' 8080'), false);
      assert.strictEqual(isValidPort('8080 '), false);
      assert.strictEqual(isValidPort(' 8080 '), false);
    });

    it('应该拒绝端口为 0', () => {
      assert.strictEqual(isValidPort('0'), false);
      assert.strictEqual(isValidPort(0), false);
    });
  });

  describe('边缘情况', () => {
    it('应该处理前导零', () => {
      assert.strictEqual(isValidPort('08080'), false);
      assert.strictEqual(isValidPort('00080'), false);
    });

    it('应该拒绝十六进制格式', () => {
      assert.strictEqual(isValidPort('0x50'), false);
    });
  });
});
