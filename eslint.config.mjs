import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/** Database drivers and the keychain binding: only the adapters and the keychain store may import them. */
const DRIVER_IMPORTS = ['pg', 'mysql2', 'better-sqlite3', '@napi-rs/keyring'].map((name) => ({
  name,
  message: 'Nur in src/main/db/adapters/ und src/main/keyring-credential-store.ts verwenden.',
}));

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
            ...DRIVER_IMPORTS,
          ],
          patterns: [
            { group: ['**/db/entities/*'], message: 'Entitäten gehören zum Datenbankmodul.' },
          ],
        },
      ],
    },
  },
  {
    // One logging facility (feature 007): no console output (pino is confined by the architecture test)
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-console': 'error' },
  },
  {
    // Database drivers and the keychain binding are confined to the adapters and the keychain store,
    // also inside the database module (feature 006).
    files: ['src/main/db/**/*.ts'],
    ignores: ['src/main/db/adapters/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: DRIVER_IMPORTS }],
    },
  },
  {
    files: ['src/main/keyring-credential-store.ts'],
    rules: { 'no-restricted-imports': 'off' },
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
