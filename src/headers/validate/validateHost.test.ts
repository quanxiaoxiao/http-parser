import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import validateHost from './validateHost.js';

describe('validateHost', () => {

  describe('IPv4 验证', () => {
    it('应该接受有效的 IPv4 地址', () => {
      const result = validateHost('192.168.1.1');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'ipv4');
      assert.strictEqual(result.host, '192.168.1.1');
      assert.strictEqual(result.port, undefined);
    });

    it('应该接受带端口的 IPv4 地址', () => {
      const result = validateHost('10.0.0.1:8080');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'ipv4');
      assert.strictEqual(result.host, '10.0.0.1');
      assert.strictEqual(result.port, 8080);
    });

    it('应该接受边界值 IPv4 地址', () => {
      const tests = [
        '0.0.0.0',
        '255.255.255.255',
        '127.0.0.1',
      ];
      for (const ip of tests) {
        const result = validateHost(ip);
        assert.strictEqual(result.valid, true, `${ip} 应该有效`);
        assert.strictEqual(result.type, 'ipv4');
      }
    });

    it('应该拒绝超出范围的 IPv4 八位组', () => {
      const result = validateHost('192.168.1.256');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'ipv4 octet > 255');
    });

    it('应该拒绝格式错误的 IPv4', () => {
      const tests = [
        '192.168.1',
        '192.168.1.1.1',
        '192.168..1',
      ];
      for (const ip of tests) {
        const result = validateHost(ip);
        assert.strictEqual(result.valid, false, `${ip} 应该无效`);
      }
    });
  });

  describe('IPv6 验证', () => {
    it('应该接受完整的 IPv6 地址', () => {
      const result = validateHost('[2001:0db8:85a3:0000:0000:8a2e:0370:7334]');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'ipv6');
    });

    it('应该接受压缩的 IPv6 地址', () => {
      const tests = [
        '[::1]',
        '[::ffff:192.0.2.1]',
        '[2001:db8::1]',
        '[fe80::1%eth0]',
      ];

      for (const ip of tests) {
        const result = validateHost(ip);
        assert.strictEqual(result.valid, true, `${ip} 应该有效`);
        assert.strictEqual(result.type, 'ipv6');
      }
    });

    it('应该接受带端口的 IPv6 地址', () => {
      const result = validateHost('[::1]:3000');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'ipv6');
      assert.strictEqual(result.host, '::1');
      assert.strictEqual(result.port, 3000);
    });

    it('应该拒绝过长的 IPv6 地址', () => {
      const longIPv6 = '[' + '1234:5678:'.repeat(10) + '1234]';
      const result = validateHost(longIPv6);
      assert.strictEqual(result.valid, false);
      // assert.strictEqual(result.reason, 'ipv6 literal too long');
    });

    it('应该拒绝不带方括号的 IPv6', () => {
      const result = validateHost('::1');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('域名/reg-name 验证', () => {
    it('应该接受有效的域名', () => {
      const result = validateHost('example.com');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'reg-name');
      assert.strictEqual(result.host, 'example.com');
    });

    it('应该接受带端口的域名', () => {
      const result = validateHost('example.com:443');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'reg-name');
      assert.strictEqual(result.host, 'example.com');
      assert.strictEqual(result.port, 443);
    });

    it('应该接受子域名', () => {
      const tests = [
        'sub.example.com',
        'api.v2.example.com',
        'deep.nested.sub.example.com',
      ];

      for (const domain of tests) {
        const result = validateHost(domain);
        assert.strictEqual(result.valid, true, `${domain} 应该有效`);
        assert.strictEqual(result.type, 'reg-name');
      }
    });

    it('应该接受带连字符的域名', () => {
      const result = validateHost('my-domain.com');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'reg-name');
    });

    it('应该接受 localhost', () => {
      const result = validateHost('localhost');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'reg-name');
    });

    it('应该拒绝过长的主机名', () => {
      const longHost = 'a'.repeat(256);
      const result = validateHost(longHost);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'host name too long (>255)');
    });

    it('应该拒绝过长的标签', () => {
      const longLabel = 'a'.repeat(64) + '.com';
      const result = validateHost(longLabel);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'label too long (>63)');
    });

    it('应该拒绝以连字符开头的标签', () => {
      const result = validateHost('-invalid.com');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'label starts/ends with hyphen');
    });

    it('应该拒绝以连字符结尾的标签', () => {
      const result = validateHost('invalid-.com');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'label starts/ends with hyphen');
    });

    it('应该拒绝空标签', () => {
      const result = validateHost('example..com');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'empty label / trailing dot not allowed');
    });

    it('应该拒绝尾部带点的域名', () => {
      const result = validateHost('example.com.');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'empty label / trailing dot not allowed');
    });
  });

  describe('端口验证', () => {
    it('应该接受有效的端口范围', () => {
      const tests = [
        { host: 'example.com:1', port: 1 },
        { host: 'example.com:80', port: 80 },
        { host: 'example.com:8080', port: 8080 },
        { host: 'example.com:65535', port: 65535 },
      ];
      for (const { host, port } of tests) {
        const result = validateHost(host);
        assert.strictEqual(result.valid, true, `${host} 应该有效`);
        assert.strictEqual(result.port, port);
      }
    });

    it('应该拒绝端口为 0', () => {
      const result = validateHost('example.com:0');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'port out of range (1-65535)');
    });

    it('应该拒绝超出范围的端口', () => {
      const tests = [
        'example.com:65536',
        'example.com:99999',
      ];

      for (const host of tests) {
        const result = validateHost(host);
        assert.strictEqual(result.valid, false, `${host} 应该无效`);
        assert.strictEqual(result.reason, 'port out of range (1-65535)');
      }
    });
  });

  describe('格式验证', () => {
    it('应该拒绝包含 CR/LF 的输入', () => {
      const tests = [
        'example.com\r',
        'example.com\n',
        'example.com\r\n',
      ];

      for (const host of tests) {
        const result = validateHost(host);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.reason, 'contains CR/LF or NUL');
      }
    });

    it('应该接受 _ 下划线', () => {
      const result = validateHost('fe_perf_env.test1.com');
      assert.strictEqual(result.valid, true);
    });

    it('应该拒绝包含 NUL 字符的输入', () => {
      const result = validateHost('example.com\u0000');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'contains CR/LF or NUL');
    });

    it('应该拒绝前导空白', () => {
      const result = validateHost(' example.com');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'leading/trailing whitespace not allowed');
    });

    it('应该拒绝尾随空白', () => {
      const result = validateHost('example.com ');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'leading/trailing whitespace not allowed');
    });

    it('应该拒绝完全不匹配的输入', () => {
      const tests = [
        '',
        '!!!',
        'not a valid host',
      ];
      for (const host of tests) {
        const result = validateHost(host);
        assert.strictEqual(result.valid, false);
      }
    });
  });

  describe('应该拒绝百分号编码验证', () => {
    it('应该拒绝百分号编码', () => {
      const result = validateHost('example%20.com');
      assert.strictEqual(result.valid, false);
    });

    it('应该拒绝多个百分号编码', () => {
      const result = validateHost('test%2Dvalue%2E.com');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('边界情况', () => {
    it('应该处理单字符标签', () => {
      const result = validateHost('a.b.c');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'reg-name');
    });

    it('纯数字域名应该不通过', () => {
      const result = validateHost('123.456.789');
      assert.strictEqual(result.valid, false);
    });

    it('应该处理混合大小写的 IPv6', () => {
      const result = validateHost('[2001:0DB8:85a3:0000:0000:8A2E:0370:7334]');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, 'ipv6');
    });
  });
});
