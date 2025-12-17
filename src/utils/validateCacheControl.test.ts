import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { validateCacheControl } from './validateCacheControl.js';

describe('validateCacheControl', () => {
  describe('基本功能测试', () => {
    it('应该解析单个布尔指令', () => {
      const result = validateCacheControl('public');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, { public: true });
      }
    });

    it('应该解析多个布尔指令', () => {
      const result = validateCacheControl('public, no-cache, no-store');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, {
          public: true,
          'no-cache': true,
          'no-store': true,
        });
      }
    });

    it('应该解析数值类型指令', () => {
      const result = validateCacheControl('max-age=3600');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, { 'max-age': 3600 });
      }
    });

    it('应该解析混合类型指令', () => {
      const result = validateCacheControl('max-age=3600, public, s-maxage=7200');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, {
          'max-age': 3600,
          public: true,
          's-maxage': 7200,
        });
      }
    });

    it('应该解析带引号的字符串值', () => {
      const result = validateCacheControl('private="Set-Cookie, Authorization"');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, {
          private: 'Set-Cookie, Authorization',
        });
      }
    });

    it('应该解析不带引号的 token 值', () => {
      const result = validateCacheControl('stale-while-revalidate=86400');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.directives['stale-while-revalidate'], 86400);
      }
    });
  });

  describe('空格和格式处理', () => {
    it('应该正确处理指令前后的空格', () => {
      const result = validateCacheControl('  max-age=3600  ,  public  ');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, {
          'max-age': 3600,
          public: true,
        });
      }
    });

    it('应该正确处理等号前后的空格', () => {
      const result = validateCacheControl('max-age = 3600');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.directives['max-age'], 3600);
      }
    });

    it('应该过滤空指令', () => {
      const result = validateCacheControl('public,,, max-age=3600');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, {
          public: true,
          'max-age': 3600,
        });
      }
    });
  });

  describe('指令名大小写处理', () => {
    it('应该将指令名转换为小写', () => {
      const result = validateCacheControl('Public, MAX-AGE=3600, No-Cache');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, {
          public: true,
          'max-age': 3600,
          'no-cache': true,
        });
      }
    });
  });

  describe('数值边界测试', () => {
    it('应该接受零值', () => {
      const result = validateCacheControl('max-age=0');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.directives['max-age'], 0);
      }
    });

    it('应该接受大数值', () => {
      const result = validateCacheControl('max-age=31536000');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.directives['max-age'], 31536000);
      }
    });

    it('应该拒绝超出安全整数范围的数值', () => {
      const result = validateCacheControl('max-age=9007199254740992');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /exceeds safe integer range/);
      }
    });
  });

  describe('特殊字符处理', () => {
    it('应该支持指令名中的连字符', () => {
      const result = validateCacheControl('stale-while-revalidate=60');
      assert.strictEqual(result.valid, true);
    });

    it('应该支持指令名中的下划线等特殊字符', () => {
      const result = validateCacheControl('custom_directive=123');
      assert.strictEqual(result.valid, true);
    });

    it('应该支持值中包含等号(使用引号)', () => {
      const result = validateCacheControl('custom="key=value"');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.directives.custom, 'key=value');
      }
    });
  });

  describe('错误处理 - 类型校验', () => {
    it('应该拒绝非字符串输入', () => {
      const result = validateCacheControl(123 as any);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'not a string');
      }
    });

    it('应该拒绝 null', () => {
      const result = validateCacheControl(null as any);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'not a string');
      }
    });

    it('应该拒绝 undefined', () => {
      const result = validateCacheControl(undefined as any);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'not a string');
      }
    });
  });

  describe('错误处理 - CRLF 注入', () => {
    it('应该拒绝包含回车符的输入', () => {
      const result = validateCacheControl('public\rmax-age=3600');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'contains CR/LF');
      }
    });

    it('应该拒绝包含换行符的输入', () => {
      const result = validateCacheControl('public\nmax-age=3600');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'contains CR/LF');
      }
    });

    it('应该拒绝包含 CRLF 的输入', () => {
      const result = validateCacheControl('public\r\nmax-age=3600');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'contains CR/LF');
      }
    });
  });

  describe('错误处理 - 空值', () => {
    it('应该拒绝空字符串', () => {
      const result = validateCacheControl('');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'empty Cache-Control header');
      }
    });

    it('应该拒绝只包含空格的字符串', () => {
      const result = validateCacheControl('   ');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'empty Cache-Control header');
      }
    });

    it('应该拒绝只包含逗号的字符串', () => {
      const result = validateCacheControl(',,,');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'empty Cache-Control header');
      }
    });
  });

  describe('错误处理 - 非法指令名', () => {
    it('应该拒绝包含空格的指令名', () => {
      const result = validateCacheControl('max age=3600');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /invalid directive name/);
      }
    });

    it('应该拒绝包含非法字符的指令名', () => {
      const result = validateCacheControl('max@age=3600');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /invalid directive name/);
      }
    });

    it('应该拒绝空指令名', () => {
      const result = validateCacheControl('=3600');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /invalid directive name/);
      }
    });
  });

  describe('错误处理 - 重复指令', () => {
    it('应该拒绝重复的指令', () => {
      const result = validateCacheControl('max-age=3600, max-age=7200');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /duplicate directive/);
      }
    });

    it('应该检测不同大小写的重复指令', () => {
      const result = validateCacheControl('Public, public');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /duplicate directive/);
      }
    });
  });

  describe('错误处理 - 非法值格式', () => {
    it('应该拒绝引号内包含未转义引号的值', () => {
      const result = validateCacheControl('private="Set-"Cookie"');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /unescaped quote/);
      }
    });

    it('应该拒绝包含非法字符的 token 值', () => {
      const result = validateCacheControl('custom=value with spaces');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /invalid value format/);
      }
    });
  });

  describe('真实场景测试', () => {
    it('应该解析标准的响应缓存指令', () => {
      const result = validateCacheControl(
        'max-age=31536000, public, immutable',
      );
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, {
          'max-age': 31536000,
          public: true,
          immutable: true,
        });
      }
    });

    it('应该解析 CDN 缓存指令', () => {
      const result = validateCacheControl(
        'public, max-age=300, s-maxage=3600, stale-while-revalidate=60',
      );
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.directives.public, true);
        assert.strictEqual(result.directives['max-age'], 300);
        assert.strictEqual(result.directives['s-maxage'], 3600);
        assert.strictEqual(result.directives['stale-while-revalidate'], 60);
      }
    });

    it('应该解析私有缓存指令', () => {
      const result = validateCacheControl(
        'private, no-cache, no-store, must-revalidate',
      );
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.deepStrictEqual(result.directives, {
          private: true,
          'no-cache': true,
          'no-store': true,
          'must-revalidate': true,
        });
      }
    });

    it('应该解析复杂的 private 指令', () => {
      const result = validateCacheControl(
        'private="Set-Cookie, Authorization", max-age=0',
      );
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(
          result.directives.private,
          'Set-Cookie, Authorization',
        );
        assert.strictEqual(result.directives['max-age'], 0);
      }
    });

    it('应该拒绝相同directive', () => {
      const result = validateCacheControl(
        'private, no-store, no-cache, no-cache=Set-Cookie, proxy-revalidate',
      );
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /duplicate/);
    });
  });
});
