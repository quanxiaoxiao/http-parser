import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { validateRequestCookie } from './validateRequestCookie.js';

describe('validateRequestCookie', () => {
  describe('基本验证', () => {
    it('应该成功解析单个 cookie', () => {
      const result = validateRequestCookie('sessionId=abc123');

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.cookies.length, 1);
        assert.strictEqual(result.value.cookies[0].name, 'sessionId');
        assert.strictEqual(result.value.cookies[0].value, 'abc123');
        assert.strictEqual(result.value.map.sessionId, 'abc123');
      }
    });

    it('应该成功解析多个 cookie', () => {
      const result = validateRequestCookie('name=value1; token=value2; id=value3');

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.cookies.length, 3);
        assert.strictEqual(result.value.map.name, 'value1');
        assert.strictEqual(result.value.map.token, 'value2');
        assert.strictEqual(result.value.map.id, 'value3');
      }
    });

    it('应该正确处理带空格的 cookie', () => {
      const result = validateRequestCookie('  name = value ;  token = abc  ');

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.cookies.length, 2);
        assert.strictEqual(result.value.map.name, 'value');
        assert.strictEqual(result.value.map.token, 'abc');
      }
    });

    it('应该忽略空的 cookie 片段', () => {
      const result = validateRequestCookie('name=value1;; token=value2; ;id=value3');

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.cookies.length, 3);
      }
    });
  });

  describe('类型验证', () => {
    it('应该拒绝非字符串类型', () => {
      const result = validateRequestCookie(null as any);

      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'Cookie header is not a string');
      }
    });

    it('应该拒绝包含 CR/LF 的 cookie', () => {
      const result1 = validateRequestCookie('name=value\r\n');
      const result2 = validateRequestCookie('name=value\n');
      const result3 = validateRequestCookie('name=value\r');

      assert.strictEqual(result1.valid, false);
      assert.strictEqual(result2.valid, false);
      assert.strictEqual(result3.valid, false);

      if (!result1.valid) {
        assert.strictEqual(result1.reason, 'Cookie header contains CR/LF');
      }
    });
  });

  describe('Cookie 名称验证', () => {
    it('应该接受有效的 cookie 名称', () => {
      const validNames = [
        'simple',
        'with-dash',
        'with_underscore',
        'with.dot',
        'with123numbers',
        'UPPERCASE',
        'MixedCase',
      ];

      for (const name of validNames) {
        const result = validateRequestCookie(`${name}=value`);
        assert.strictEqual(result.valid, true, `应该接受名称: ${name}`);
      }
    });

    it('应该拒绝无效的 cookie 名称', () => {
      const invalidNames = [
        'with space',
        'with@at',
        'with(paren',
        'with[bracket',
        'with{brace',
        'with;semicolon',
      ];

      for (const name of invalidNames) {
        const result = validateRequestCookie(`${name}=value`);
        assert.strictEqual(result.valid, false, `应该拒绝名称: ${name}`);
      }
    });
  });

  describe('Cookie 值验证', () => {
    it('应该接受有效的 cookie 值', () => {
      const result = validateRequestCookie('name=validValue123-._~');

      assert.strictEqual(result.valid, true);
    });

    it('应该拒绝包含无效字符的 cookie 值', () => {
      const result = validateRequestCookie('name=invalid value');

      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /Invalid cookie value/);
      }
    });

    it('应该接受空的 cookie 值', () => {
      const result = validateRequestCookie('name=');

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.map.name, '');
      }
    });
  });

  describe('Cookie 格式验证', () => {
    it('应该拒绝缺少等号的 cookie', () => {
      const result = validateRequestCookie('invalidcookie');

      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /Invalid cookie pair/);
      }
    });

    it('应该拒绝只有空白的 cookie', () => {
      const result = validateRequestCookie('   ;  ;  ');

      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'No valid cookies found');
      }
    });
  });

  describe('选项: decodeValue', () => {
    it('应该解码 URL 编码的值', () => {
      const result = validateRequestCookie('name=hello%20world', {
        decodeValue: true,
      });

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.map.name, 'hello world');
      }
    });

    it('应该处理中文编码', () => {
      const result = validateRequestCookie('name=%E4%B8%AD%E6%96%87', {
        decodeValue: true,
      });

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.map.name, '中文');
      }
    });

    it('应该拒绝无效的 URL 编码', () => {
      const result = validateRequestCookie('name=%XY', {
        decodeValue: true,
      });

      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /Failed to decode/);
      }
    });

    it('默认不解码值', () => {
      const result = validateRequestCookie('name=hello%20world');

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.map.name, 'hello%20world');
      }
    });
  });

  describe('选项: forbidDuplicateNames', () => {
    it('应该拒绝重复的 cookie 名称', () => {
      const result = validateRequestCookie('name=value1; name=value2', {
        forbidDuplicateNames: true,
      });

      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /Duplicate cookie name/);
      }
    });

    it('默认允许重复的 cookie 名称', () => {
      const result = validateRequestCookie('name=value1; name=value2');

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        // 最后一个值会覆盖前面的
        assert.strictEqual(result.value.map.name, 'value2');
        assert.strictEqual(result.value.cookies.length, 2);
      }
    });
  });

  describe('选项: maxCookies', () => {
    it('应该拒绝超过限制的 cookie 数量', () => {
      const cookies = Array.from({ length: 6 }, (_, i) => `cookie${i}=value${i}`).join('; ');
      const result = validateRequestCookie(cookies, {
        maxCookies: 5,
      });

      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.match(result.reason, /Too many cookies/);
      }
    });

    it('应该接受在限制内的 cookie 数量', () => {
      const cookies = Array.from({ length: 5 }, (_, i) => `cookie${i}=value${i}`).join('; ');
      const result = validateRequestCookie(cookies, {
        maxCookies: 5,
      });

      assert.strictEqual(result.valid, true);
    });

    it('默认限制为 100 个 cookie', () => {
      const cookies = Array.from({ length: 101 }, (_, i) => `cookie${i}=value${i}`).join('; ');
      const result = validateRequestCookie(cookies);

      assert.strictEqual(result.valid, false);
    });
  });

  describe('复杂场景', () => {
    it('应该处理所有选项组合', () => {
      const result = validateRequestCookie('name=hello%20world; token=abc123', {
        decodeValue: true,
        forbidDuplicateNames: true,
        maxCookies: 10,
      });

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.cookies.length, 2);
        assert.strictEqual(result.value.map.name, 'hello world');
        assert.strictEqual(result.value.map.token, 'abc123');
      }
    });

    it('应该处理真实的浏览器 Cookie 字符串', () => {
      const browserCookie = '_ga=GA1.2.123456789.1234567890; _gid=GA1.2.987654321.0987654321; sessionId=abc123def456';
      const result = validateRequestCookie(browserCookie);

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.cookies.length, 3);
        assert.ok(result.value.map._ga);
        assert.ok(result.value.map._gid);
        assert.ok(result.value.map.sessionId);
      }
    });

    it('应该保持 cookies 数组的顺序', () => {
      const result = validateRequestCookie('first=1; second=2; third=3');

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.cookies[0].name, 'first');
        assert.strictEqual(result.value.cookies[1].name, 'second');
        assert.strictEqual(result.value.cookies[2].name, 'third');
      }
    });
  });

  describe('边界情况', () => {
    it('应该处理空字符串', () => {
      const result = validateRequestCookie('');

      assert.strictEqual(result.valid, false);
    });

    it('应该处理只有分号的字符串', () => {
      const result = validateRequestCookie(';;;');

      assert.strictEqual(result.valid, false);
    });

    it('应该处理等号在开头的情况', () => {
      const result = validateRequestCookie('=value');

      assert.strictEqual(result.valid, false);
    });

    it('应该处理多个连续等号', () => {
      const result = validateRequestCookie('name==value');

      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.value.map.name, '=value');
      }
    });

    it('应该处理非常长的 cookie 名称', () => {
      const longName = 'a'.repeat(200);
      const result = validateRequestCookie(`${longName}=value`);

      assert.strictEqual(result.valid, true);
    });

    it('应该处理非常长的 cookie 值', () => {
      const longValue = 'a'.repeat(4096);
      const result = validateRequestCookie(`name=${longValue}`);

      assert.strictEqual(result.valid, true);
    });
  });
});
