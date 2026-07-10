// ESLint flat config (IMP-PLT-001 quality gate). Scope: correctness rules, not style —
// TypeScript strict mode carries the type burden; formatting is not enforced here.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules/**', '.nuxt/**', '.output/**', 'dist/**', '.pg-embedded/**', 'storybook-static/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', fetch: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off', // structured logger is default; console is the sanctioned dev/dispatcher sink
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off', // strict tsconfig governs; tests use any for HTTP bodies
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off', // .mjs lint module import needs @ts-ignore
    },
  },
)
