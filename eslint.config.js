export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        Bun: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
      },
    },
    rules: {
      // Strict error handling
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off',

      // Best practices
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-throw-literal': 'error',

      // Strict mode - ES modules are strict by default
      'strict': ['error', 'never'],

      // Code quality
      'no-unused-expressions': 'error',
      'no-empty': 'error',
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-extra-semi': 'error',
      'no-irregular-whitespace': 'error',
      'no-unreachable': 'error',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'docs/.vitepress/**', 'coverage/**'],
  },
]
