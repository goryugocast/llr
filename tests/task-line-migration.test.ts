import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    migrateLineLegacyToV2,
    revertLineV2ToLegacy,
    transformContent,
} = require('../scripts/task_line_migration.js');

describe('task line migration scripts', () => {
    it('migrates legacy completed lines to v2', () => {
        expect(
            migrateLineLegacyToV2('- [x] 09:00 - 09:30 (45m > 30m) Review PR @done')
        ).toBe('- [x] Review PR 09:00 - 09:30 (45m > 30m) @done');
    });

    it('migrates legacy running lines to v2', () => {
        expect(
            migrateLineLegacyToV2('- [/] 09:00 - Review PR (30m)')
        ).toBe('- [/] Review PR 09:00 - (30m)');
    });

    it('migrates legacy unchecked planned lines to v2', () => {
        expect(
            migrateLineLegacyToV2('- [ ] 18:00 - 原稿修正 (30m)')
        ).toBe('- [ ] 18:00 原稿修正 (30m)');
    });

    it('reverts v2 completed lines to legacy', () => {
        expect(
            revertLineV2ToLegacy('- [x] Review PR 09:00 - 09:30 (45m > 30m) @done')
        ).toBe('- [x] 09:00 - 09:30 (45m > 30m) Review PR @done');
    });

    it('reverts v2 running lines to legacy', () => {
        expect(
            revertLineV2ToLegacy('- [/] Review PR 09:00 - (30m)')
        ).toBe('- [/] 09:00 - Review PR (30m)');
    });

    it('reverts v2 unchecked planned lines to legacy', () => {
        expect(
            revertLineV2ToLegacy('- [ ] 18:00 原稿修正 (30m)')
        ).toBe('- [ ] 18:00 - 原稿修正 (30m)');
    });

    it('transforms whole documents line by line', () => {
        const input = [
            '- [x] 09:00 - 09:30 (30m) 朝食',
            '- [/] 09:30 - 皿洗い (10m)',
            '- [ ] 10:00 - 原稿修正 (30m)',
        ].join('\n');

        const result = transformContent(input, migrateLineLegacyToV2);

        expect(result.changed).toBe(3);
        expect(result.content).toBe([
            '- [x] 朝食 09:00 - 09:30 (30m)',
            '- [/] 皿洗い 09:30 - (10m)',
            '- [ ] 10:00 原稿修正 (30m)',
        ].join('\n'));
    });
});
