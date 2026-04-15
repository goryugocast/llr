import obsidianPlugin from 'eslint-plugin-obsidianmd';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';

// Mirrors the obsidian-releases ObsidianReviewBot ruleset so local lint catches
// what the bot would flag during plugin review.
export default [
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
            },
        },
        plugins: {
            obsidianmd: obsidianPlugin,
            '@typescript-eslint': tsPlugin,
            '@eslint-community/eslint-comments': eslintComments,
        },
        rules: {
            ...obsidianPlugin.configs.recommended,
            // typescript-eslint rules the bot enforces in addition to obsidianmd:
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-base-to-string': 'error',
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            // Core ESLint rules:
            'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],
            // eslint-disable comments must include a reason after `--`:
            '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
        },
    },
];
