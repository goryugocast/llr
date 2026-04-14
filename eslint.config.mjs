import obsidianPlugin from 'eslint-plugin-obsidianmd';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

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
        },
        rules: {
            ...obsidianPlugin.configs.recommended.rules,
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-base-to-string': 'error',
        },
    },
];
