import eslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicornPlugin from 'eslint-plugin-unicorn';
import globals from 'globals';
import { dirname } from 'path';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.config.js',
      'coverage/**',
      '*.test.ts',
      '*.d.ts',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['eslint.config.mjs'],
    rules: {
      'unicorn/prevent-abbreviations': 'off',
    },
  },

  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.d.ts'],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },

    plugins: {
      'simple-import-sort': simpleImportSort,
      import: importPlugin,
      unicorn: unicornPlugin,
    },

    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.ts'],
        },
      },
    },

    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import/first': 'error',
      'import/newline-after-import': ['error', { count: 1 }],
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off',

      'no-implicit-globals': 'error',
      'no-new-func': 'error',
      'no-eval': 'error',
      'no-param-reassign': 'error',

      'array-callback-return': 'error',
      'block-scoped-var': 'error',
      'consistent-return': 'error',
      'default-case': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-multi-assign': 'error',
      'no-use-before-define': 'off',
      'prefer-const': 'error',
      'prefer-destructuring': ['error', { array: true, object: true }],
      'prefer-object-spread': 'error',
      'no-nested-ternary': 'error',
      'id-length': ['error', { min: 2, exceptions: ['x', 'y', 'i', 'j', 'to', '_'] }],
      'no-ternary': 'off',
      'no-console': 'off',

      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      'object-shorthand': ['error', 'always'],
      'quote-props': ['error', 'as-needed'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'object-curly-newline': [
        'error',
        {
          ObjectExpression: { multiline: true, consistent: true },
          ObjectPattern: { multiline: true, consistent: true },
          ImportDeclaration: { multiline: true, minProperties: 3 },
          ExportDeclaration: { multiline: true, minProperties: 3 },
        },
      ],

      'comma-dangle': [
        'error',
        {
          arrays: 'always-multiline',
          objects: 'always-multiline',
          imports: 'always-multiline',
          exports: 'always-multiline',
          functions: 'always-multiline',
        },
      ],
      'comma-style': ['error', 'last'],
      'eol-last': ['error', 'always'],
      'no-multi-spaces': 'error',
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
      'no-trailing-spaces': 'error',
      'keyword-spacing': ['error', { before: true, after: true }],
      'space-infix-ops': 'error',
      'space-in-parens': ['error', 'never'],
      'block-spacing': ['error', 'always'],
      'key-spacing': ['error', { beforeColon: false, afterColon: true }],

      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/consistent-indexed-object-style': ['error', 'record'],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/await-thenable': 'error',

      'unicorn/prevent-abbreviations': ['error', { checkProperties: true }],

      'no-undef': 'off',
      'max-len': 'off',
      'no-continue': 'off',
      'no-bitwise': 'off',
      'no-mixed-operators': 'off',
      'no-underscore-dangle': 'off',
      'no-plusplus': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts'],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
        test: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },

    plugins: {
      'simple-import-sort': simpleImportSort,
      import: importPlugin,
      unicorn: unicornPlugin,
    },

    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'no-console': 'off',
      'id-length': 'off',
      'unicorn/prevent-abbreviations': 'off',
    },
  },
];
