import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  getHeaderSide,
  HeaderSide,
  isValidRequestHeader,
  isValidResponseHeader,
} from './header-side.js';

describe('getHeaderSide', () => {
  describe('Request-only headers', () => {
    it('should return Request for standard request headers', () => {
      const requestHeaders = [
        'host', 'expect', 'if-match', 'if-none-match', 'if-modified-since',
        'accept', 'accept-encoding', 'user-agent', 'referer', 'authorization',
      ];

      requestHeaders.forEach(header => {
        assert.strictEqual(
          getHeaderSide(header),
          HeaderSide.Request,
          `${header} should be Request side`,
        );
      });
    });

    it('should handle case-insensitive request headers', () => {
      assert.strictEqual(getHeaderSide('Host'), HeaderSide.Request);
      assert.strictEqual(getHeaderSide('HOST'), HeaderSide.Request);
      assert.strictEqual(getHeaderSide('User-Agent'), HeaderSide.Request);
      assert.strictEqual(getHeaderSide('AUTHORIZATION'), HeaderSide.Request);
    });

    it('should handle headers with whitespace', () => {
      assert.strictEqual(getHeaderSide('  host  '), HeaderSide.Request);
      assert.strictEqual(getHeaderSide(' user-agent '), HeaderSide.Request);
    });
  });

  describe('Response-only headers', () => {
    it('should return Response for standard response headers', () => {
      const responseHeaders = [
        'accept-ranges', 'age', 'etag', 'last-modified', 'location',
        'server', 'set-cookie', 'www-authenticate', 'strict-transport-security',
      ];

      responseHeaders.forEach(header => {
        assert.strictEqual(
          getHeaderSide(header),
          HeaderSide.Response,
          `${header} should be Response side`,
        );
      });
    });

    it('should handle case-insensitive response headers', () => {
      assert.strictEqual(getHeaderSide('Server'), HeaderSide.Response);
      assert.strictEqual(getHeaderSide('SET-COOKIE'), HeaderSide.Response);
      assert.strictEqual(getHeaderSide('ETag'), HeaderSide.Response);
    });

    it('should handle security headers', () => {
      assert.strictEqual(getHeaderSide('content-security-policy'), HeaderSide.Response);
      assert.strictEqual(getHeaderSide('x-frame-options'), HeaderSide.Response);
      assert.strictEqual(getHeaderSide('cross-origin-opener-policy'), HeaderSide.Response);
    });
  });

  describe('Both-side headers', () => {
    it('should return Both for headers valid in both contexts', () => {
      const bothHeaders = [
        'content-type', 'content-length', 'content-encoding',
        'cache-control', 'date', 'transfer-encoding',
      ];

      bothHeaders.forEach(header => {
        assert.strictEqual(
          getHeaderSide(header),
          HeaderSide.Both,
          `${header} should be Both side`,
        );
      });
    });

    it('should handle case-insensitive both-side headers', () => {
      assert.strictEqual(getHeaderSide('Content-Type'), HeaderSide.Both);
      assert.strictEqual(getHeaderSide('CACHE-CONTROL'), HeaderSide.Both);
      assert.strictEqual(getHeaderSide('Date'), HeaderSide.Both);
    });
  });

  describe('Unknown headers', () => {
    it('should return Unknown for unrecognized headers', () => {
      assert.strictEqual(getHeaderSide('x-custom-header'), HeaderSide.Unknown);
      assert.strictEqual(getHeaderSide('my-special-header'), HeaderSide.Unknown);
      assert.strictEqual(getHeaderSide('unknown'), HeaderSide.Unknown);
    });

    it('should return Unknown for empty string', () => {
      assert.strictEqual(getHeaderSide(''), HeaderSide.Unknown);
    });

    it('should return Unknown for whitespace-only string', () => {
      assert.strictEqual(getHeaderSide('   '), HeaderSide.Unknown);
    });
  });
});

describe('isValidRequestHeader', () => {
  it('should return true for request-only headers', () => {
    assert.strictEqual(isValidRequestHeader('host'), true);
    assert.strictEqual(isValidRequestHeader('user-agent'), true);
    assert.strictEqual(isValidRequestHeader('authorization'), true);
  });

  it('should return true for both-side headers', () => {
    assert.strictEqual(isValidRequestHeader('content-type'), true);
    assert.strictEqual(isValidRequestHeader('cache-control'), true);
    assert.strictEqual(isValidRequestHeader('date'), true);
  });

  it('should return true for unknown headers', () => {
    assert.strictEqual(isValidRequestHeader('x-custom-header'), true);
    assert.strictEqual(isValidRequestHeader('my-header'), true);
  });

  it('should return false for response-only headers', () => {
    assert.strictEqual(isValidRequestHeader('server'), false);
    assert.strictEqual(isValidRequestHeader('set-cookie'), false);
    assert.strictEqual(isValidRequestHeader('etag'), false);
    assert.strictEqual(isValidRequestHeader('www-authenticate'), false);
  });

  it('should handle case-insensitive headers', () => {
    assert.strictEqual(isValidRequestHeader('HOST'), true);
    assert.strictEqual(isValidRequestHeader('Server'), false);
    assert.strictEqual(isValidRequestHeader('Content-Type'), true);
  });

  it('should handle empty string', () => {
    assert.strictEqual(isValidRequestHeader(''), true);
  });
});

describe('isValidResponseHeader', () => {
  it('should return true for response-only headers', () => {
    assert.strictEqual(isValidResponseHeader('server'), true);
    assert.strictEqual(isValidResponseHeader('set-cookie'), true);
    assert.strictEqual(isValidResponseHeader('etag'), true);
  });

  it('should return true for both-side headers', () => {
    assert.strictEqual(isValidResponseHeader('content-type'), true);
    assert.strictEqual(isValidResponseHeader('cache-control'), true);
    assert.strictEqual(isValidResponseHeader('date'), true);
  });

  it('should return true for unknown headers', () => {
    assert.strictEqual(isValidResponseHeader('x-custom-header'), true);
    assert.strictEqual(isValidResponseHeader('my-header'), true);
  });

  it('should return false for request-only headers', () => {
    assert.strictEqual(isValidResponseHeader('host'), false);
    assert.strictEqual(isValidResponseHeader('user-agent'), false);
    assert.strictEqual(isValidResponseHeader('authorization'), false);
    assert.strictEqual(isValidResponseHeader('referer'), false);
  });

  it('should handle case-insensitive headers', () => {
    assert.strictEqual(isValidResponseHeader('Server'), true);
    assert.strictEqual(isValidResponseHeader('HOST'), false);
    assert.strictEqual(isValidResponseHeader('Content-Type'), true);
  });

  it('should handle empty string', () => {
    assert.strictEqual(isValidResponseHeader(''), true);
  });
});

describe('Edge cases', () => {
  it('should handle headers with mixed case and spaces', () => {
    assert.strictEqual(getHeaderSide('  Content-Type  '), HeaderSide.Both);
    assert.strictEqual(isValidRequestHeader('  HOST  '), true);
    assert.strictEqual(isValidResponseHeader('  Server  '), true);
  });

  it('should handle special security headers correctly', () => {
    const securityHeaders = [
      'strict-transport-security',
      'content-security-policy',
      'x-frame-options',
      'x-content-type-options',
      'cross-origin-opener-policy',
    ];

    securityHeaders.forEach(header => {
      assert.strictEqual(
        getHeaderSide(header),
        HeaderSide.Response,
        `${header} should be response-only`,
      );
      assert.strictEqual(
        isValidResponseHeader(header),
        true,
        `${header} should be valid response header`,
      );
      assert.strictEqual(
        isValidRequestHeader(header),
        false,
        `${header} should not be valid request header`,
      );
    });
  });
});
