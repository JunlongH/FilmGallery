module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
    browser: true,
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  extends: [
    'eslint:recommended',
  ],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'prefer-const': 'warn',
  },
  overrides: [
    // TypeScript files
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
      ],
      rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
      },
    },
    // React JSX/TSX files (without react-app config)
    {
      files: ['client/**/*.{js,jsx,ts,tsx}'],
      env: {
        browser: true,
        node: false,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      plugins: ['react-hooks'],
      rules: {
        'react-hooks/exhaustive-deps': 'warn',
        'react-hooks/rules-of-hooks': 'error',
      },
      settings: {
        react: {
          version: 'detect',
        },
      },
    },
    // Server files
    {
      files: ['server/**/*.js'],
      env: {
        node: true,
        browser: false,
      },
    },
    // Jest test files
    {
      files: ['**/__tests__/**/*.js', '**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true,
        node: true,
      },
    },
    // Migration files - allow empty catch blocks for ALTER TABLE safety pattern
    {
      files: ['server/migrations/**/*.js', 'server/scripts/**/*.js'],
      rules: {
        'no-empty': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'build/',
    'dist/',
    'dist_v9/',
    'dist_v9_client/',
    'mobile/',
    'watch-app/',
    'temp_expo_orig/',
    '*.min.js',
  ],
};
