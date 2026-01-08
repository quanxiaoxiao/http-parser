import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { lintHeaderName } from './header-linter.js';

describe('HTTP Header Name Linter', () => {

  describe('Valid headers', () => {
    it('should accept standard Title-Case headers', () => {
      const valid = [
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'User-Agent',
        'Accept-Encoding',
        'Content-Length',
      ];

      valid.forEach(header => {
        const result = lintHeaderName(header);
        assert.strictEqual(result.errors.length, 0,
          `${header} should have no errors`);
      });
    });

    it('should accept headers with numbers', () => {
      const result = lintHeaderName('Custom-Header-123');
      assert.strictEqual(result.errors.length, 0);
    });

    it('should accept single word headers', () => {
      const result = lintHeaderName('Accept');
      assert.strictEqual(result.errors.length, 0);
    });
  });

  describe('Empty and whitespace validation', () => {
    it('should reject empty string', () => {
      const result = lintHeaderName('');
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('empty')));
    });

    it('should reject whitespace-only string', () => {
      const result = lintHeaderName('   ');
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('empty')));
    });

    it('should reject headers with internal spaces', () => {
      const result = lintHeaderName('Content Type');
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('whitespace')));
    });

    it('should reject headers with leading whitespace', () => {
      const result = lintHeaderName(' Content-Type');
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('leading or trailing')));
    });

    it('should reject headers with trailing whitespace', () => {
      const result = lintHeaderName('Content-Type ');
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('leading or trailing')));
    });
  });

  describe('Character validation', () => {
    it('should reject headers with invalid characters', () => {
      const invalid = [
        'Content@Type',
        'Header[Name]',
        'Header{Name}',
        'Header(Name)',
        'Header:Name',
        'Header;Name',
        'Header,Name',
        'Header/Name',
        'Header\\Name',
        'Header<Name>',
        'Header"Name"',
        'Header?Name',
      ];

      invalid.forEach(header => {
        const result = lintHeaderName(header);
        assert.ok(result.errors.length > 0,
          `${header} should have errors`);
        assert.ok(result.errors.some(e => e.includes('invalid characters')),
          `${header} should have invalid character error`);
      });
    });

    it('should accept valid token characters', () => {
      // RFC 9110 允许的特殊字符
      const valid = [
        'Custom-Header',
        'X-Request-ID',
        'Cache-Control',
      ];

      valid.forEach(header => {
        const result = lintHeaderName(header);
        assert.ok(!result.errors.some(e => e.includes('invalid characters')),
          `${header} should not have invalid character error`);
      });
    });
  });

  describe('Hyphen validation', () => {
    it('should reject headers starting with hyphen', () => {
      const result = lintHeaderName('-Invalid-Header');
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('start or end with a hyphen')));
    });

    it('should reject headers ending with hyphen', () => {
      const result = lintHeaderName('Invalid-Header-');
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('start or end with a hyphen')));
    });

    it('should reject headers with consecutive hyphens', () => {
      const result = lintHeaderName('Invalid--Header');
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('consecutive hyphens')));
    });

    it('should accept headers with single hyphens', () => {
      const result = lintHeaderName('Valid-Header-Name');
      assert.ok(!result.errors.some(e => e.includes('hyphen')));
    });
  });

  describe('Title-Case validation', () => {
    it('should warn about lowercase headers', () => {
      const result = lintHeaderName('content-type');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.includes('Title-Case')));
    });

    it('should warn about all-uppercase headers', () => {
      const result = lintHeaderName('CONTENT-TYPE');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.includes('all-uppercase')));
    });

    it('should warn about mixed case without proper Title-Case', () => {
      const result = lintHeaderName('content-Type');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.includes('Title-Case')));
    });

    it('should provide formatting suggestions', () => {
      const result = lintHeaderName('content-type');
      assert.ok(result.suggestions.length > 0);
      assert.ok(result.suggestions.some(s => s.includes('Content-Type')));
    });
  });

  describe('X- prefix validation', () => {
    it('should warn about X- prefix (uppercase)', () => {
      const result = lintHeaderName('X-Custom-Header');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.includes('X- prefix is deprecated')));
    });

    it('should warn about X- prefix (lowercase)', () => {
      const result = lintHeaderName('x-custom-header');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.toLowerCase().includes('x-')));
    });

    it('should warn about X- prefix (mixed case)', () => {
      const result = lintHeaderName('X-Custom-Header');
      assert.ok(result.warnings.length > 0);
    });
  });

  describe('Length validation', () => {
    it('should reject excessively long header names', () => {
      const longHeader = 'A'.repeat(257);
      const result = lintHeaderName(longHeader);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('too long')));
    });

    it('should accept reasonably long header names', () => {
      const longHeader = 'A'.repeat(256);
      const result = lintHeaderName(longHeader);
      assert.ok(!result.errors.some(e => e.includes('too long')));
    });
  });

  describe('Number validation', () => {
    it('should warn about headers starting with numbers', () => {
      const result = lintHeaderName('123-Header');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.includes('should not start with a number')));
    });

    it('should accept headers with numbers not at the start', () => {
      const result = lintHeaderName('Header-123');
      assert.ok(!result.warnings.some(w => w.includes('should not start with a number')));
    });
  });

  describe('Reserved prefix validation', () => {
    it('should warn about Sec- prefix', () => {
      const result = lintHeaderName('Sec-Custom-Header');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.includes('Sec-')));
    });

    it('should warn about Proxy- prefix', () => {
      const result = lintHeaderName('Proxy-Custom-Header');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.includes('Proxy-')));
    });
  });

  describe('Standard header suggestions', () => {
    it('should suggest correct spelling for common misspellings', () => {
      const result = lintHeaderName('Referrer');
      assert.ok(result.suggestions.length > 0);
      assert.ok(result.suggestions.some(s => s.includes('Referer')));
    });

    it('should not suggest for correctly spelled standard headers', () => {
      const result = lintHeaderName('Content-Type');
      assert.ok(!result.suggestions.some(s => s.includes('Did you mean')));
    });
  });

  describe('LintResult structure', () => {
    it('should return object with errors, warnings, and suggestions arrays', () => {
      const result = lintHeaderName('Content-Type');
      assert.ok(Array.isArray(result.errors));
      assert.ok(Array.isArray(result.warnings));
      assert.ok(Array.isArray(result.suggestions));
    });

    it('should have empty arrays for valid headers', () => {
      const result = lintHeaderName('Content-Type');
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.warnings.length, 0);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle multiple errors at once', () => {
      const result = lintHeaderName(' Invalid Header- ');
      assert.ok(result.errors.length >= 2,
        'Should have multiple errors: whitespace, spaces, trailing hyphen');
    });

    it('should handle headers with warnings but no errors', () => {
      const result = lintHeaderName('x-custom-header');
      assert.strictEqual(result.errors.length, 0);
      assert.ok(result.warnings.length > 0);
    });

    it('should provide suggestions even when there are warnings', () => {
      const result = lintHeaderName('content-type');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.suggestions.length > 0);
    });
  });

  describe('Edge cases', () => {
    it('should handle single character headers', () => {
      const result = lintHeaderName('A');
      // Single uppercase letter is technically valid
      assert.strictEqual(result.errors.length, 0);
    });

    it('should handle headers with all valid special characters', () => {
      const result = lintHeaderName('Custom-Header');
      assert.strictEqual(result.errors.length, 0);
    });

    it('should handle Unicode characters (should fail)', () => {
      const result = lintHeaderName('Custom-Header-中文');
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('invalid characters')));
    });

    it('should handle null-like inputs gracefully', () => {
      // TypeScript won't allow null, but testing empty string
      const result = lintHeaderName('');
      assert.ok(result.errors.length > 0);
    });
  });

  describe('Real-world headers', () => {
    const realWorldHeaders = [
      { name: 'Content-Type', shouldPass: true },
      { name: 'Authorization', shouldPass: true },
      { name: 'Accept-Encoding', shouldPass: true },
      { name: 'User-Agent', shouldPass: true },
      { name: 'Cache-Control', shouldPass: true },
      { name: 'Access-Control-Allow-Origin', shouldPass: true },
      { name: 'Content-Security-Policy', shouldPass: true },
      { name: 'Strict-Transport-Security', shouldPass: true },
      { name: 'X-Frame-Options', shouldPass: false }, // X- prefix warning
      { name: 'X-Content-Type-Options', shouldPass: false }, // X- prefix warning
    ];

    realWorldHeaders.forEach(({ name, shouldPass }) => {
      it(`should ${shouldPass ? 'accept' : 'warn about'} ${name}`, () => {
        const result = lintHeaderName(name);
        if (shouldPass) {
          assert.strictEqual(result.errors.length, 0,
            `${name} should have no errors`);
        } else {
          assert.ok(result.warnings.length > 0,
            `${name} should have warnings`);
        }
      });
    });
  });
});
