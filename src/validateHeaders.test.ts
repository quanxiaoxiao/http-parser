import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { type Header } from './types.js';
import validateHeaders from './validateHeaders.js';

describe('HTTP Header Validator', () => {
  describe('基本功能测试', () => {
    it('应该接受空对象', () => {
      const errors = validateHeaders({});
      assert.equal(errors.length, 0);
    });

    it('应该接受 null 或 undefined', () => {
      assert.equal(validateHeaders(null as any).length, 0); // eslint-disable-line
      assert.equal(validateHeaders(undefined as any).length, 0); // eslint-disable-line
    });

    it('应该接受有效的简单头部', () => {
      const headers: Header = {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });
  });

  describe('头部名称验证', () => {
    it('应该拒绝包含非法字符的头部名称', () => {
      const headers: Header = {
        'invalid header': 'value',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].error, 'Header name contains illegal characters');
    });

    it('应该接受有效的头部名称字符', () => {
      const headers: Header = {
        'x-custom-header': 'value',
        'accept-language': 'en-US',
        'x-api-key_123': 'secret',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });
  });

  describe('头部值类型验证', () => {
    it('应该拒绝非字符串类型的值', () => {
      const headers: Header = {
        'content-length': 123 as any,// eslint-disable-line
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].error, 'Header value must be a string');
    });

    it('应该拒绝包含控制字符的值', () => {
      const headers: Header = {
        'user-agent': 'Mozilla/5.0\x00',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].error, 'Header value contains illegal control characters');
    });

    it('应该拒绝包含换行符的值', () => {
      const headers: Header = {
        'user-agent': 'Mozilla/5.0\nInjected',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].error, 'Header value contains illegal control characters');
    });
  });

  describe('单值头部验证', () => {
    it('应该拒绝多值的 content-type', () => {
      const headers: Header = {
        'content-type': ['application/json', 'text/html'],
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].error, 'Header cannot have multiple values');
    });

    it('应该拒绝多值的 content-length', () => {
      const headers: Header = {
        'content-length': ['100', '200'],
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].error, 'Header cannot have multiple values');
    });

    it('应该接受单值的 host', () => {
      const headers: Header = {
        host: 'example.com',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });
  });

  describe('数字类型头部验证', () => {
    it('应该接受有效的 content-length', () => {
      const headers: Header = {
        'content-length': '1024',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该拒绝非数字的 content-length', () => {
      const headers: Header = {
        'content-length': 'abc',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.match(errors[0].error, /must be a non-negative integer/);
    });

    it('应该拒绝负数的 content-length', () => {
      const headers: Header = {
        'content-length': '-100',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
    });

    it('应该拒绝超出安全范围的数字', () => {
      const headers: Header = {
        'content-length': '9007199254740992', // Number.MAX_SAFE_INTEGER + 1
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.match(errors[0].error, /value exceeds safe range/);
    });

    it('应该接受有效的 max-forwards', () => {
      const headers: Header = {
        'max-forwards': '10',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该接受有效的 age', () => {
      const headers: Header = {
        age: '3600',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });
  });

  describe('日期类型头部验证', () => {
    it('应该接受有效的 Date 头部', () => {
      const headers: Header = {
        date: 'Wed, 21 Oct 2015 07:28:00 GMT',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该接受有效的 expires', () => {
      const headers: Header = {
        expires: 'Thu, 01 Jan 2026 00:00:00 GMT',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该拒绝无效的日期格式', () => {
      const headers: Header = {
        date: 'invalid-date',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.match(errors[0].error, /must be a valid date format/);
    });

    it('应该接受有效的 last-modified', () => {
      const headers: Header = {
        'last-modified': 'Mon, 01 Jan 2024 12:00:00 GMT',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该接受有效的 if-modified-since', () => {
      const headers: Header = {
        'if-modified-since': 'Sat, 29 Feb 2020 00:00:00 GMT',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });
  });

  describe('特定格式头部验证', () => {
    describe('Content-Type', () => {
      it('应该接受有效的 content-type', () => {
        const validTypes = [
          'application/json',
          'text/html',
          'text/html; charset=utf-8',
          'multipart/form-data; boundary=something',
        ];

        validTypes.forEach((type) => {
          const errors = validateHeaders({ 'content-type': type });
          assert.equal(errors.length, 0, `Failed for: ${type}`);
        });
      });

      it('应该拒绝无效的 content-type', () => {
        const headers: Header = {
          'content-type': 'invalid',
        };
        const errors = validateHeaders(headers);
        assert.equal(errors.length, 1);
        assert.match(errors[0].error, /has incorrect format/);
      });
    });

    describe('Host', () => {
      it('应该接受有效的 host', () => {
        const validHosts = [
          'example.com',
          'sub.example.com',
          'example.com:8080',
          '192.168.1.1',
          'localhost:3000',
        ];

        validHosts.forEach((host) => {
          const errors = validateHeaders({ host });
          assert.equal(errors.length, 0, `Failed for: ${host}`);
        });
      });

      it('应该拒绝无效的 host', () => {
        const headers: Header = {
          host: 'invalid host with spaces',
        };
        const errors = validateHeaders(headers);
        assert.equal(errors.length, 1);
      });
    });

    describe('Authorization', () => {
      it('应该接受有效的 authorization', () => {
        const validAuth = [
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
          'Basic dXNlcjpwYXNz',
          'Digest username="user"',
        ];

        validAuth.forEach((auth) => {
          const errors = validateHeaders({ authorization: auth });
          assert.equal(errors.length, 0, `Failed for: ${auth}`);
        });
      });

      it('应该拒绝无效的 authorization', () => {
        const headers: Header = {
          authorization: 'InvalidFormat',
        };
        const errors = validateHeaders(headers);
        assert.equal(errors.length, 1);
      });
    });

    describe('Range', () => {
      it('应该接受有效的 range', () => {
        const validRanges = [
          'bytes=0-499',
          'bytes=500-999',
          'bytes=-500',
          'bytes=9500-',
          'bytes=0-0,-1',
        ];

        validRanges.forEach((range) => {
          const errors = validateHeaders({ range });
          assert.equal(errors.length, 0, `Failed for: ${range}`);
        });
      });

      it('应该拒绝无效的 range', () => {
        const headers: Header = {
          range: 'invalid-range',
        };
        const errors = validateHeaders(headers);
        assert.equal(errors.length, 1);
      });
    });

    describe('Cache-Control', () => {
      it('应该接受有效的 cache-control', () => {
        const validDirectives = [
          'no-cache',
          'no-store',
          'max-age=3600',
          'public, max-age=86400',
          'private, must-revalidate',
        ];

        validDirectives.forEach((directive) => {
          const errors = validateHeaders({ 'cache-control': directive });
          assert.equal(errors.length, 0, `Failed for: ${directive}`);
        });
      });

      it('应该拒绝无效的 cache-control', () => {
        const headers: Header = {
          'cache-control': 'invalid-directive',
        };
        const errors = validateHeaders(headers);
        assert.equal(errors.length, 1);
      });
    });
  });

  describe('数组值头部验证', () => {
    it('应该验证数组中的每个值', () => {
      const headers: Header = {
        'accept-language': ['en-US', 'zh-CN', 'ja'],
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该报告数组中每个无效值的错误', () => {
      const headers: Header = {
        'x-custom': ['valid', 'also\x00invalid', 'valid-again'],
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].index, 1);
    });
  });

  describe('复杂场景测试', () => {
    it('应该处理混合有效和无效的头部', () => {
      const headers: Header = {
        'content-type': 'application/json',
        'content-length': 'invalid',
        host: 'example.com',
        'invalid header': 'value',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 2);
    });

    it('应该处理大量头部', () => {
      const headers: Header = {};
      for (let i = 0; i < 100; i++) {
        headers[`x-custom-${i}`] = `value-${i}`;
      }
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该正确报告多个错误', () => {
      const headers: Header = {
        'content-length': ['100', '200'], // 多值错误
        date: 'invalid-date', // 日期格式错误
        'invalid header': 'value', // 名称错误
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 3);
    });
  });

  describe('边界情况测试', () => {
    it('应该处理空字符串值', () => {
      const headers: Header = {
        'x-custom': '',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该处理带有空格的值', () => {
      const headers: Header = {
        'user-agent': '  Mozilla/5.0  ',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该接受零值的 content-length', () => {
      const headers: Header = {
        'content-length': '0',
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });

    it('应该接受最大安全整数', () => {
      const headers: Header = {
        'content-length': '9007199254740991', // Number.MAX_SAFE_INTEGER
      };
      const errors = validateHeaders(headers);
      assert.equal(errors.length, 0);
    });
  });
});
