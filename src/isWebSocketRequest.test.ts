import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import isWebSocketRequest from './isWebSocketRequest.js';
import { type Header,type HttpMethod } from './types.js';

describe('isWebSocketRequest', () => {
  describe('HTTP 方法验证', () => {
    it('应该拒绝非 GET 方法', () => {
      const methods: HttpMethod[] = ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
      const validHeaders: Header = {
        connection: 'Upgrade',
        upgrade: 'websocket',
      };

      methods.forEach(method => {
        assert.strictEqual(
          isWebSocketRequest(method, validHeaders),
          false,
          `${method} 方法应该返回 false`,
        );
      });
    });

    it('应该接受 GET 方法与有效的 WebSocket 头', () => {
      const headers: Header = {
        connection: 'Upgrade',
        upgrade: 'websocket',
      };

      assert.strictEqual(isWebSocketRequest('GET', headers), true);
    });
  });

  describe('Connection 头验证', () => {
    it('应该接受 "Upgrade" 值(不区分大小写)', () => {
      const testCases = ['Upgrade', 'upgrade', 'UPGRADE', 'uPgRaDe'];

      testCases.forEach(value => {
        const headers: Header = {
          connection: value,
          upgrade: 'websocket',
        };
        assert.strictEqual(
          isWebSocketRequest('GET', headers),
          true,
          `Connection: ${value} 应该有效`,
        );
      });
    });

    it('应该接受包含 "upgrade" 的复合值', () => {
      const testCases = [
        'keep-alive, Upgrade',
        'Upgrade, keep-alive',
        'upgrade',
        'close, upgrade',
      ];

      testCases.forEach(value => {
        const headers: Header = {
          connection: value,
          upgrade: 'websocket',
        };
        assert.strictEqual(
          isWebSocketRequest('GET', headers),
          value === 'upgrade',
        );
      });
    });

    it('应该拒绝缺失的 Connection 头', () => {
      const headers: Header = {
        upgrade: 'websocket',
      };

      assert.strictEqual(isWebSocketRequest('GET', headers), false);
    });

    it('应该拒绝不包含 "upgrade" 的 Connection 头', () => {
      const testCases = ['keep-alive', 'close', 'something-else'];

      testCases.forEach(value => {
        const headers: Header = {
          connection: value,
          upgrade: 'websocket',
        };
        assert.strictEqual(
          isWebSocketRequest('GET', headers),
          false,
          `Connection: ${value} 应该无效`,
        );
      });
    });

    it('应该拒绝非字符串类型的 Connection 头', () => {
      const testCases = [null, undefined, 123, true, {}, []];

      testCases.forEach(value => {
        const headers: Header = {
          connection: value as any, // eslint-disable-line
          upgrade: 'websocket',
        };
        assert.strictEqual(
          isWebSocketRequest('GET', headers),
          false,
          `Connection: ${value} (${typeof value}) 应该无效`,
        );
      });
    });
  });

  describe('Upgrade 头验证', () => {
    it('应该接受 "websocket" 值(不区分大小写)', () => {
      const testCases = ['websocket', 'WebSocket', 'WEBSOCKET', 'wEbSoCkEt'];

      testCases.forEach(value => {
        const headers: Header = {
          connection: 'Upgrade',
          upgrade: value,
        };
        assert.strictEqual(
          isWebSocketRequest('GET', headers),
          true,
          `Upgrade: ${value} 应该有效`,
        );
      });
    });

    it('应该拒绝缺失的 Upgrade 头', () => {
      const headers: Header = {
        connection: 'Upgrade',
      };

      assert.strictEqual(isWebSocketRequest('GET', headers), false);
    });

    it('应该拒绝非 "websocket" 的 Upgrade 值', () => {
      const testCases = ['h2c', 'http/2.0', 'websocket2', 'web socket', ''];

      testCases.forEach(value => {
        const headers: Header = {
          connection: 'Upgrade',
          upgrade: value,
        };
        assert.strictEqual(
          isWebSocketRequest('GET', headers),
          false,
          `Upgrade: ${value} 应该无效`,
        );
      });
    });

    it('应该拒绝非字符串类型的 Upgrade 头', () => {
      const testCases = [null, undefined, 123, true, {}, []];

      testCases.forEach(value => {
        const headers: Header = {
          connection: 'Upgrade',
          upgrade: value as any, // eslint-disable-line
        };
        assert.strictEqual(
          isWebSocketRequest('GET', headers),
          false,
          `Upgrade: ${value} (${typeof value}) 应该无效`,
        );
      });
    });
  });

  describe('综合场景', () => {
    it('应该正确处理标准的 WebSocket 握手请求', () => {
      const headers: Header = {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      };

      assert.strictEqual(isWebSocketRequest('GET', headers), true);
    });

    it('应该拒绝所有条件都不满足的请求', () => {
      const headers: Header = {
        connection: 'keep-alive',
        upgrade: 'h2c',
      };

      assert.strictEqual(isWebSocketRequest('POST', headers), false);
    });

    it('应该处理空的 headers 对象', () => {
      assert.strictEqual(isWebSocketRequest('GET', {}), false);
    });
  });
});
