import * as assert from 'node:assert';
import { describe, test } from 'node:test';

import type { HttpMessage } from '../types.js';
import { isWebSocketRequest } from './message-predicates.js';

describe('isWebSocketRequest', () => {
  test('应该识别有效的 WebSocket 请求', () => {
    const validRequest: HttpMessage = {
      method: 'GET',
      headers: {
        connection: ['Upgrade'],
        upgrade: ['websocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(validRequest), true);
  });

  test('应该支持不区分大小写的头部值', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        connection: ['UPGRADE'],
        upgrade: ['WebSocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), true);
  });

  test('应该支持混合大小写的头部值', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        connection: ['uPgRaDe'],
        upgrade: ['wEbSoCkEt'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), true);
  });

  test('应该拒绝非 GET 方法的请求', () => {
    const postRequest: HttpMessage = {
      method: 'POST',
      headers: {
        connection: ['Upgrade'],
        upgrade: ['websocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(postRequest), false);
  });

  test('应该拒绝缺少 Connection 头的请求', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        upgrade: ['websocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该拒绝缺少 Upgrade 头的请求', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        connection: ['Upgrade'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该拒绝 Connection 值不是 Upgrade 的请求', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        connection: ['keep-alive'],
        upgrade: ['websocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该拒绝 Upgrade 值不是 websocket 的请求', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        connection: ['Upgrade'],
        upgrade: ['h2c'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该拒绝头部值为空数组的请求', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        connection: [],
        upgrade: ['websocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该拒绝两个头部值都为空数组的请求', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        connection: [],
        upgrade: [],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该处理没有 method 属性的消息（响应）', () => {
    const response: HttpMessage = {
      headers: {
        connection: ['Upgrade'],
        upgrade: ['websocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(response), true);
  });

  test('应该拒绝 Connection 头值包含额外内容的请求', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        connection: ['Upgrade, keep-alive'],
        upgrade: ['websocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该拒绝 Upgrade 头值包含额外内容的请求', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {
        connection: ['Upgrade'],
        upgrade: ['websocket, h2c'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该处理 PUT 方法', () => {
    const request: HttpMessage = {
      method: 'PUT',
      headers: {
        connection: ['Upgrade'],
        upgrade: ['websocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该处理 DELETE 方法', () => {
    const request: HttpMessage = {
      method: 'DELETE',
      headers: {
        connection: ['Upgrade'],
        upgrade: ['websocket'],
      },
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });

  test('应该处理空 headers 对象', () => {
    const request: HttpMessage = {
      method: 'GET',
      headers: {},
    };

    assert.strictEqual(isWebSocketRequest(request), false);
  });
});
