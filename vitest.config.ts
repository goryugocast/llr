import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        alias: {
            'obsidian': fileURLToPath(new URL('./tests/mocks/obsidian.ts', import.meta.url)),
        },
    },
});
