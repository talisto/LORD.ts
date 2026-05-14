// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import jestPlugin from 'eslint-plugin-jest';

export default defineConfig(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'webclient/**',
      'tools/**',
      'dev/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    // Type-aware linting for source files (not tests) to catch floating promises
    files: ['src/**/*.ts', 'igm/**/*.ts', 'lord.ts', 'server.ts', 'game-worker.ts'],
    extends: [tseslint.configs.recommendedTypeCheckedOnly],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Catch unawaited async calls - these cause subtle race-condition bugs
      '@typescript-eslint/no-floating-promises': ['error', {
        ignoreVoid: true,       // Allow `void fn()` for intentional fire-and-forget
        ignoreIIFE: false,
      }],
      // Flag cases where an async function is passed where a void-returning one is expected
      '@typescript-eslint/no-misused-promises': ['error', {
        checksVoidReturn: true,
        checksConditionals: true,
      }],
      // Rules kept off intentionally:
      // restrict-plus-operands: LORD uses backtick color codes (`2, `%) which conflict
      // with JS template literal syntax, making template literals less readable than + concatenation
      '@typescript-eslint/restrict-plus-operands': 'off',
    },
  },
  {
    // enable jest rules on test files
    files: ['tests/**'],
    extends: [jestPlugin.configs['flat/recommended']],
    rules: {
      // Test files legitimately use `any` for mock objects and jest spies
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Project-wide rule overrides
    rules: {
      // ── Workspace boundary enforcement ──────────────────────────────────
      // Prevent relative imports that cross npm workspace package boundaries.
      // All cross-package imports must use @lordts/* package specifiers.
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '../{util,db,core,door,igm}',
            '../{util,db,core,door,igm}/**',
            '../../{util,db,core,door,igm}',
            '../../{util,db,core,door,igm}/**',
            '../../../{util,db,core,door,igm}',
            '../../../{util,db,core,door,igm}/**',
            '../../src',
            '../../src/**',
            '../../../src',
            '../../../src/**',
            '../../igm',
            '../../igm/**',
            '../../../igm',
            '../../../igm/**',
          ],
          message: 'Use @lordts/* workspace imports instead of relative paths across package boundaries.',
        }],
      }],

      '@typescript-eslint/no-unused-vars': ['error', {
        vars: 'all',
        args: 'all',
        caughtErrors: 'all',
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],

      // ── Naming conventions ──────────────────────────────────────────────
      // Enforce camelCase for functions, methods, parameters, and class
      // properties. PascalCase for type declarations.
      // Variables and object-literal properties are excluded (DB record fields
      // like `player.on_now`, settings fields like `settings.clean_mode`, and
      // JSON data keys all keep their snake_case for serialisation compat).
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          // Classes, interfaces, type aliases, enums, type parameters
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          // Standalone functions and class / object methods (incl. getters/setters)
          // leadingUnderscore: 'allow' supports _privateImpl naming patterns
          selector: ['function', 'method'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          // Function / method parameters - local names, not DB fields
          // leadingUnderscore: 'allow' supports unused-param convention (_x)
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
      ],
    },
  },
);