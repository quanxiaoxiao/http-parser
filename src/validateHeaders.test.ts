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

describe('HTTP Header Validator', () => {

  describe('基础验证', () => {
    it('应该对空对象返回空错误数组', () => {
      const errors = validateHeaders({});
      assert.strictEqual(errors.length, 0);
    });

    it('应该对 null 或 undefined 返回空错误数组', () => {
      assert.strictEqual(validateHeaders(null as any).length, 0);
      assert.strictEqual(validateHeaders(undefined as any).length, 0);
    });

    it('应该验证有效的简单头部', () => {
      const headers = {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('头部名称验证', () => {
    it('应该拒绝包含非法字符的头部名称', () => {
      const headers = {
        'invalid header': 'value',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].error, 'Header name contains illegal characters');
    });

    it('应该接受有效的头部名称字符', () => {
      const headers = {
        'x-custom-header': 'value',
        'accept-encoding': 'gzip',
        custom_header: 'value',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('头部值验证', () => {
    it('应该拒绝非字符串值', () => {
      const headers = {
        'content-type': 123 as any,
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].error, 'Header value must be a string');
    });

    it('应该拒绝包含控制字符的值', () => {
      const headers = {
        'user-agent': 'Mozilla\x00/5.0',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].error, 'Header value contains illegal control characters');
    });
  });

  describe('单值头部验证', () => {
    it('应该拒绝单值头部的多个值', () => {
      const headers = {
        'content-type': ['application/json', 'text/html'],
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].error, 'Header cannot have multiple values');
    });

    it('应该允许单值头部的单个值', () => {
      const headers = {
        'content-type': 'application/json',
        host: 'example.com',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('数字类型头部验证', () => {
    it('应该验证有效的 content-length', () => {
      const headers = {
        'content-length': '1024',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });

    it('应该拒绝非数字的 content-length', () => {
      const headers = {
        'content-length': 'abc',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.match(errors[0].error, /must be a non-negative integer/);
    });

    it('应该拒绝负数的 content-length', () => {
      const headers = {
        'content-length': '-100',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
    });

    it('应该拒绝超出安全范围的数字', () => {
      const headers = {
        'content-length': '9007199254740992', // Number.MAX_SAFE_INTEGER + 1
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.match(errors[0].error, /exceeds safe range/);
    });

    it('应该验证有效的 age 头部', () => {
      const headers = {
        age: '3600',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('日期类型头部验证', () => {
    it('应该验证有效的日期格式', () => {
      const headers = {
        date: 'Wed, 21 Oct 2015 07:28:00 GMT',
        'last-modified': 'Tue, 20 Oct 2015 07:28:00 GMT',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });

    it('应该拒绝无效的日期格式', () => {
      const headers = {
        date: 'invalid-date',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.match(errors[0].error, /must be a valid date format/);
    });

    it('应该验证 ISO 8601 日期格式', () => {
      const headers = {
        expires: '2024-12-31T23:59:59Z',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('特定格式头部验证', () => {
    it('应该验证有效的 content-type', () => {
      const validTypes = [
        'application/json',
        'text/html; charset=utf-8',
        'multipart/form-data; boundary=something',
      ];

      validTypes.forEach(type => {
        const errors = validateHeaders({ 'content-type': type });
        assert.strictEqual(errors.length, 0, `Failed for: ${type}`);
      });
    });

    it('应该拒绝无效的 content-type', () => {
      const headers = {
        'content-type': 'invalid',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.match(errors[0].error, /incorrect format/i);
    });

    it('应该验证有效的 host', () => {
      const validHosts = [
        'example.com',
        'sub.example.com',
        'example.com:8080',
        '192.168.1.1',
      ];

      validHosts.forEach(host => {
        const errors = validateHeaders({ host });
        assert.strictEqual(errors.length, 0, `Failed for: ${host}`);
      });
    });

    it('应该验证有效的 authorization', () => {
      const headers = {
        authorization: 'Bearer token123',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });

    it('应该拒绝无效的 authorization', () => {
      const headers = {
        authorization: 'invalid',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
    });

    it('应该验证有效的 range', () => {
      const validRanges = [
        'bytes=0-1023',
        'bytes=0-',
        'bytes=-1024',
        'bytes=0-1023, 2048-4095',
      ];

      validRanges.forEach(range => {
        const errors = validateHeaders({ range });
        assert.strictEqual(errors.length, 0, `Failed for: ${range}`);
      });
    });

    it('应该验证有效的 accept', () => {
      const validAccepts = [
        'application/json',
        'text/html; q=0.9',
        'text/*',
        '*/*',
        'application/json, text/html',
      ];

      validAccepts.forEach(accept => {
        const errors = validateHeaders({ accept });
        assert.strictEqual(errors.length, 0, `Failed for: ${accept}`);
      });
    });

    it('应该验证有效的 cache-control', () => {
      const validCacheControls = [
        'no-cache',
        'no-store',
        'max-age=3600',
        'public, max-age=3600',
        'private, must-revalidate, max-age=0',
      ];

      validCacheControls.forEach(cc => {
        const errors = validateHeaders({ 'cache-control': cc });
        assert.strictEqual(errors.length, 0, `Failed for: ${cc}`);
      });
    });
  });

  describe('冲突头部验证', () => {
    it('应该拒绝 content-length 和 transfer-encoding 同时存在', () => {
      const headers = {
        'content-length': '1024',
        'transfer-encoding': 'chunked',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.match(errors[0].error, /cannot be used with/i);
    });

    it('应该允许单独使用 content-length', () => {
      const headers = {
        'content-length': '1024',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });

    it('应该允许单独使用 transfer-encoding', () => {
      const headers = {
        'transfer-encoding': 'chunked',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('多值头部验证', () => {
    it('应该允许 set-cookie 有多个值', () => {
      const headers = {
        'set-cookie': [
          'session=abc123; Path=/',
          'user=john; HttpOnly',
        ],
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });

    it('应该验证数组中的每个值', () => {
      const headers = {
        'set-cookie': [
          'valid=cookie',
          'invalid\x00=cookie',
        ],
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].index, 1);
    });
  });

  describe('复杂场景', () => {
    it('应该返回多个错误', () => {
      const headers = {
        'invalid name': 'value',
        'content-length': 'not-a-number',
        date: 'invalid-date',
      };
      const errors = validateHeaders(headers);
      assert.ok(errors.length >= 3);
    });

    it('应该验证完整的请求头集合', () => {
      const headers = {
        host: 'api.example.com',
        'user-agent': 'MyApp/1.0',
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate',
        authorization: 'Bearer eyJhbGc...',
        'content-type': 'application/json',
        'content-length': '256',
        'cache-control': 'no-cache',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });

    it('应该正确设置错误对象的所有字段', () => {
      const headers = {
        'content-length': ['100', 'invalid'],
      };
      const errors = validateHeaders(headers);

      // 应该有两个错误：多值和无效值
      assert.ok(errors.length >= 1);

      const error = errors[0];
      assert.ok(error.header);
      assert.ok(error.error);
      assert.ok(error.value !== undefined);
    });
  });

  describe('边界情况', () => {
    it('应该处理空字符串值', () => {
      const headers = {
        'user-agent': '',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });

    it('应该处理带空格的值', () => {
      const headers = {
        'user-agent': '  Mozilla/5.0  ',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });

    it('应该处理 0 值的数字头部', () => {
      const headers = {
        'content-length': '0',
        age: '0',
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });

    it('应该处理最大安全整数', () => {
      const headers = {
        'content-length': '9007199254740991', // Number.MAX_SAFE_INTEGER
      };
      const errors = validateHeaders(headers);
      assert.strictEqual(errors.length, 0);
    });
  });
});
