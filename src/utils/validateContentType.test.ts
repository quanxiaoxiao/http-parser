import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import validateContentType from './validateContentType.js';

describe('validateContentType', () => {
  describe('基本格式验证', () => {
    it('应该接受有效的基本 content-type', () => {
      const result = validateContentType('text/plain');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'text');
        assert.strictEqual(result.contentType.subtype, 'plain');
        assert.strictEqual(Object.keys(result.contentType.parameters).length, 0);
      }
    });

    it('应该接受有效的 content-type 并忽略前后空格', () => {
      const result = validateContentType('  application/json  ');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'application');
        assert.strictEqual(result.contentType.subtype, 'json');
      }
    });

    it('应该拒绝空字符串', () => {
      const result = validateContentType('');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'empty content-type');
      }
    });

    it('应该拒绝只有空格的字符串', () => {
      const result = validateContentType('   ');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'empty content-type');
      }
    });

    it('应该拒绝缺少斜杠的格式', () => {
      const result = validateContentType('textplain');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'invalid format (expected type/subtype)');
      }
    });

    it('应该拒绝只有 type 没有 subtype', () => {
      const result = validateContentType('text/');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'invalid format (expected type/subtype)');
      }
    });

    it('应该拒绝只有 subtype 没有 type', () => {
      const result = validateContentType('/plain');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'invalid format (expected type/subtype)');
      }
    });
  });

  describe('特殊字符验证', () => {
    it('应该拒绝包含回车符的字符串', () => {
      const result = validateContentType('text/plain\r');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'contains CR/LF or NUL');
      }
    });

    it('应该拒绝包含换行符的字符串', () => {
      const result = validateContentType('text/plain\n');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'contains CR/LF or NUL');
      }
    });

    it('应该拒绝包含 NUL 字符的字符串', () => {
      const result = validateContentType('text/plain\u0000');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'contains CR/LF or NUL');
      }
    });
  });

  describe('Type 和 Subtype 验证', () => {
    it('应该将 type 和 subtype 转换为小写', () => {
      const result = validateContentType('TEXT/PLAIN');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'text');
        assert.strictEqual(result.contentType.subtype, 'plain');
      }
    });

    it('应该接受包含有效 token 字符的 type', () => {
      const result = validateContentType('application/vnd.api+json');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'application');
        assert.strictEqual(result.contentType.subtype, 'vnd.api+json');
      }
    });

    it('应该拒绝超过 127 字符的 type', () => {
      const longType = 'a'.repeat(128);
      const result = validateContentType(`${longType}/plain`);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'type too long (>127)');
      }
    });

    it('应该拒绝超过 127 字符的 subtype', () => {
      const longSubtype = 'a'.repeat(128);
      const result = validateContentType(`text/${longSubtype}`);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'subtype too long (>127)');
      }
    });

    it('应该拒绝包含无效字符的 type', () => {
      const result = validateContentType('text@invalid/plain');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'invalid type format');
      }
    });

    it('应该拒绝包含无效字符的 subtype', () => {
      const result = validateContentType('text/plain@invalid');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'invalid subtype format');
      }
    });
  });

  describe('参数解析', () => {
    it('应该解析单个参数', () => {
      const result = validateContentType('text/plain; charset=utf-8');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(Object.keys(result.contentType.parameters).length, 1);
        assert.strictEqual(result.contentType.parameters.charset, 'utf-8');
        assert.strictEqual(result.contentType.charset, 'utf-8');
      }
    });

    it('应该解析多个参数', () => {
      const result = validateContentType('multipart/form-data; boundary=----WebKitFormBoundary; charset=utf-8');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(Object.keys(result.contentType.parameters).length, 2);
        assert.strictEqual(result.contentType.parameters.boundary, '----WebKitFormBoundary');
        assert.strictEqual(result.contentType.parameters.charset, 'utf-8');
        assert.strictEqual(result.contentType.boundary, '----WebKitFormBoundary');
        assert.strictEqual(result.contentType.charset, 'utf-8');
      }
    });

    it('应该将参数名转换为小写', () => {
      const result = validateContentType('text/plain; CHARSET=utf-8');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.parameters.charset, 'utf-8');
      }
    });

    it('应该处理带引号的参数值', () => {
      const result = validateContentType('text/plain; charset="utf-8"');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.parameters.charset, 'utf-8');
      }
    });

    it('应该处理引号中的转义字符', () => {
      const result = validateContentType('text/plain; name="file\\"name.txt"');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.parameters.name, 'file"name.txt');
      }
    });

    it('应该处理参数之间的空格', () => {
      const result = validateContentType('text/plain;  charset=utf-8  ;  boundary=test');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(Object.keys(result.contentType.parameters).length, 2);
        assert.strictEqual(result.contentType.parameters.charset, 'utf-8');
        assert.strictEqual(result.contentType.parameters.boundary, 'test');
      }
    });

    it('应该拒绝重复的参数名', () => {
      const result = validateContentType('text/plain; charset=utf-8; charset=iso-8859-1');
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'duplicate parameter: charset');
      }
    });

    it('应该拒绝超过 10 个参数', () => {
      const params = Array.from({ length: 11 }, (_, i) => `param${i}=value${i}`).join('; ');
      const result = validateContentType(`text/plain; ${params}`);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'too many parameters (>10)');
      }
    });

    it('应该拒绝超过 127 字符的参数名', () => {
      const longName = 'a'.repeat(128);
      const result = validateContentType(`text/plain; ${longName}=value`);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'parameter name too long (>127)');
      }
    });

    it('应该拒绝超过 1024 字符的参数值', () => {
      const longValue = 'a'.repeat(1025);
      const result = validateContentType(`text/plain; name=${longValue}`);
      assert.strictEqual(result.valid, false);
      if (!result.valid) {
        assert.strictEqual(result.reason, 'parameter value too long (>1024)');
      }
    });
  });

  describe('常见 Content-Type 示例', () => {
    it('应该处理 application/json', () => {
      const result = validateContentType('application/json');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'application');
        assert.strictEqual(result.contentType.subtype, 'json');
      }
    });

    it('应该处理 application/x-www-form-urlencoded;', () => {
      const result = validateContentType('application/x-www-form-urlencoded;');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'application');
        assert.strictEqual(result.contentType.subtype, 'x-www-form-urlencoded');
      }
    });

    it('应该处理 application/x-www-form-urlencoded', () => {
      const result = validateContentType('application/x-www-form-urlencoded');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'application');
        assert.strictEqual(result.contentType.subtype, 'x-www-form-urlencoded');
      }
    });

    it('应该处理 multipart/form-data with boundary', () => {
      const result = validateContentType('multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'multipart');
        assert.strictEqual(result.contentType.subtype, 'form-data');
        assert.strictEqual(result.contentType.boundary, '----WebKitFormBoundary7MA4YWxkTrZu0gW');
      }
    });

    it('应该处理 text/html with charset', () => {
      const result = validateContentType('text/html; charset=utf-8');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'text');
        assert.strictEqual(result.contentType.subtype, 'html');
        assert.strictEqual(result.contentType.charset, 'utf-8');
      }
    });

    it('应该处理 image/png', () => {
      const result = validateContentType('image/png');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.type, 'image');
        assert.strictEqual(result.contentType.subtype, 'png');
      }
    });
  });

  describe('边界情况', () => {
    it('应该处理没有参数的 content-type', () => {
      const result = validateContentType('text/plain;');
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(Object.keys(result.contentType.parameters).length, 0);
      }
    });

    it('应该处理恰好 127 字符的 type', () => {
      const type = 'a'.repeat(127);
      const result = validateContentType(`${type}/plain`);
      assert.strictEqual(result.valid, true);
    });

    it('应该处理恰好 127 字符的 subtype', () => {
      const subtype = 'a'.repeat(127);
      const result = validateContentType(`text/${subtype}`);
      assert.strictEqual(result.valid, true);
    });

    it('应该处理恰好 10 个参数', () => {
      const params = Array.from({ length: 10 }, (_, i) => `param${i}=value${i}`).join('; ');
      const result = validateContentType(`text/plain; ${params}`);
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(Object.keys(result.contentType.parameters).length, 10);
      }
    });

    it('应该处理恰好 1024 字符的参数值', () => {
      const value = 'a'.repeat(1024);
      const result = validateContentType(`text/plain; name=${value}`);
      assert.strictEqual(result.valid, true);
      if (result.valid) {
        assert.strictEqual(result.contentType.parameters.name, value);
      }
    });
  });
});
