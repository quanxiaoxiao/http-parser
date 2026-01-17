import eslint from '@eslint/js';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.config.js',
      'coverage/**',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: [
      'src/**/*.ts',
      'eslint.config.mjs',
    ],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },

    plugins: {
      'simple-import-sort': simpleImportSort,
    },

    rules: {
      // ===== Import 相关 =====
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-duplicate-imports': 'error',

      // ===== 代码质量 =====
      'array-callback-return': 'error',
      'block-scoped-var': 'error',
      'consistent-return': 'error',
      'default-case': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-multi-assign': 'error',
      'no-use-before-define': 'off', // TypeScript 会处理
      'prefer-const': 'error',

      // ===== 变量命名 =====
      'no-shadow': 'off', // 使用 TS 版本
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ===== 对象和数组 =====
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

      // ===== 格式化 =====
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

      // ===== TypeScript 特定 =====
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],

      // ===== 关闭的规则 =====
      'no-console': 'off',
      'no-undef': 'off', // TypeScript 会检查
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
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
];
