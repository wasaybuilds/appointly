import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

/**
 * Flat ESLint configuration for the whole monorepo.
 *
 * A single root config rather than one per package: the rules that matter here
 * are architectural (no `any`, no floating promises, no console) and they should
 * not be able to differ between the API and the web client.
 *
 * Type-aware linting is enabled deliberately. Rules like `no-floating-promises`
 * cannot be implemented without type information, and an unawaited promise in a
 * request handler is exactly the kind of bug that only appears under load.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/*.config.{js,mjs,ts}',
      '**/next-env.d.ts',
      'apps/api/scripts/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused values are usually a leftover from a refactor. Leading
      // underscores mark the deliberate exceptions, such as unused event args.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `any` erases the guarantees the rest of the codebase relies on. Where an
      // external boundary genuinely returns something unknown, `unknown` plus a
      // schema parse is the supported route.
      '@typescript-eslint/no-explicit-any': 'error',

      // An unhandled rejection in Express bypasses the error middleware
      // entirely, so the request hangs instead of returning a 500.
      '@typescript-eslint/no-floating-promises': 'error',

      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      // Logging goes through pino on the server; the browser keeps warn/error
      // for genuine failures surfaced to developers.
      'no-console': ['error', { allow: ['warn', 'error'] }],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // The client error boundary reports through the console on purpose; there
      // is no error-tracking service wired up in this assessment.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Must come last so formatting rules that would fight Prettier are switched
  // off rather than merely overridden.
  prettier,
);
