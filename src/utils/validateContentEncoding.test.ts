import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { validateContentEncoding } from './validateContentEncoding.js';

describe('validateContentEncoding', () => {
  describe('基本格式验证', () => {
    it('应该拒绝非字符串输入', () => {
      const result = validateContentEncoding(123 as any); // eslint-disable-line
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'Content-Encoding is not a string');
      }
    });

    it('应该拒绝包含 CR/LF 的字符串', () => {
      const result = validateContentEncoding('gzip\r\n');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'Content-Encoding contains CR/LF');
      }
    });

    it('应该拒绝空字符串', () => {
      const result = validateContentEncoding('');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'Content-Encoding is empty');
      }
    });

    it('应该拒绝只有空格的字符串', () => {
      const result = validateContentEncoding('   ');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'Content-Encoding is empty');
      }
    });
  });

  describe('单个编码验证', () => {
    it('应该接受单个已知编码 gzip', () => {
      const result = validateContentEncoding('gzip');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip']);
      }
    });

    it('应该接受单个已知编码 br', () => {
      const result = validateContentEncoding('br');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['br']);
      }
    });

    it('应该接受单个已知编码 deflate', () => {
      const result = validateContentEncoding('deflate');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['deflate']);
      }
    });

    it('应该接受单个已知编码 identity', () => {
      const result = validateContentEncoding('identity');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['identity']);
      }
    });

    it('应该接受单个已知编码 zstd', () => {
      const result = validateContentEncoding('zstd');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['zstd']);
      }
    });

    it('应该接受大小写混合的编码', () => {
      const result = validateContentEncoding('GZip');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip']);
      }
    });
  });

  describe('多个编码验证', () => {
    it('应该接受多个已知编码', () => {
      const result = validateContentEncoding('gzip, br');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip', 'br']);
      }
    });

    it('应该接受三个编码', () => {
      const result = validateContentEncoding('gzip, deflate, br');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip', 'deflate', 'br']);
      }
    });

    it('应该正确处理空格', () => {
      const result = validateContentEncoding('  gzip  ,  br  ');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip', 'br']);
      }
    });

    it('应该拒绝重复的编码', () => {
      const result = validateContentEncoding('gzip, gzip');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'duplicate encoding: gzip');
      }
    });

    it('应该拒绝大小写不同但实际相同的重复编码', () => {
      const result = validateContentEncoding('gzip, GZIP');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'duplicate encoding: gzip');
      }
    });
  });

  describe('token 格式验证', () => {
    it('应该拒绝包含非法字符的编码', () => {
      const result = validateContentEncoding('gzip@test');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /invalid encoding token/);
      }
    });

    it('应该拒绝包含空格的编码', () => {
      const result = validateContentEncoding('gzip test');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /invalid encoding token/);
      }
    });

    it('应该接受包含连字符的编码', () => {
      const result = validateContentEncoding('x-custom-encoding');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['x-custom-encoding']);
      }
    });

    it('应该接受包含数字的编码', () => {
      const result = validateContentEncoding('encoding123');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['encoding123']);
      }
    });
  });

  describe('strictKnownEncodings 选项', () => {
    it('默认应该接受未知编码', () => {
      const result = validateContentEncoding('custom-encoding');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['custom-encoding']);
      }
    });

    it('启用 strictKnownEncodings 时应该拒绝未知编码', () => {
      const result = validateContentEncoding('custom-encoding', {
        strictKnownEncodings: true,
      });
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'unknown encoding: custom-encoding');
      }
    });

    it('启用 strictKnownEncodings 时应该接受已知编码', () => {
      const result = validateContentEncoding('gzip', {
        strictKnownEncodings: true,
      });
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip']);
      }
    });

    it('启用 strictKnownEncodings 时应该接受多个已知编码', () => {
      const result = validateContentEncoding('gzip, br, deflate', {
        strictKnownEncodings: true,
      });
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip', 'br', 'deflate']);
      }
    });
  });

  describe('forbidIdentityMix 选项', () => {
    it('默认应该允许 identity 与其他编码混合', () => {
      const result = validateContentEncoding('identity, gzip');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['identity', 'gzip']);
      }
    });

    it('启用 forbidIdentityMix 时应该拒绝 identity 与其他编码混合', () => {
      const result = validateContentEncoding('identity, gzip', {
        forbidIdentityMix: true,
      });
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(
          result.reason,
          'identity must not be combined with other encodings',
        );
      }
    });

    it('启用 forbidIdentityMix 时应该允许单独的 identity', () => {
      const result = validateContentEncoding('identity', {
        forbidIdentityMix: true,
      });
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['identity']);
      }
    });

    it('启用 forbidIdentityMix 时应该拒绝多个编码中包含 identity', () => {
      const result = validateContentEncoding('gzip, identity, br', {
        forbidIdentityMix: true,
      });
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(
          result.reason,
          'identity must not be combined with other encodings',
        );
      }
    });
  });

  describe('组合选项测试', () => {
    it('应该同时应用两个选项', () => {
      const result = validateContentEncoding('identity, custom', {
        forbidIdentityMix: true,
        strictKnownEncodings: true,
      });
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.ok(
          result.reason === 'unknown encoding: custom' ||
          result.reason === 'identity must not be combined with other encodings',
        );
      }
    });

    it('应该在严格模式下接受有效的组合', () => {
      const result = validateContentEncoding('gzip, br', {
        forbidIdentityMix: true,
        strictKnownEncodings: true,
      });
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip', 'br']);
      }
    });
  });

  describe('边界情况', () => {
    it('应该处理连续的逗号', () => {
      const result = validateContentEncoding('gzip,,br');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip', 'br']);
      }
    });

    it('应该处理末尾的逗号', () => {
      const result = validateContentEncoding('gzip,');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip']);
      }
    });

    it('应该处理开头的逗号', () => {
      const result = validateContentEncoding(',gzip');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.value.encodings, ['gzip']);
      }
    });
  });
});
