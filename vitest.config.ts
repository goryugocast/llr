import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        alias: {
            'obsidian': './tests/mocks/obsidian.ts',
        },
    },
});
