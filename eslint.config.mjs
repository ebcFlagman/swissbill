import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'release/**',
      'node_modules/**',
      'coverage/**',
      '.specify/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // Persistence boundary (constitution principle III/V): TypeORM only in the database module and in tests
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/main/db/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'typeorm',
              allowTypeImports: true,
              message: 'TypeORM nur in src/main/db/ verwenden.',
            },
            { name: 'reflect-metadata', message: 'Nur im Datenbankmodul und im Main-Einstieg.' },
          ],
          patterns: [
            { group: ['**/db/entities/*'], message: 'Entitäten gehören zum Datenbankmodul.' },
          ],
        },
      ],
    },
  },
  {
    // The main entry point loads reflect-metadata once for TypeORM
    files: ['src/main/index.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
);
