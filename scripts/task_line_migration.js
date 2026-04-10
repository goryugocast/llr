#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const CHECKBOX_PATTERN = /^(\s*)- \[( |\/|x)\]\s+(.*)$/;
const SKIP_PATTERN = /^(\s*)- skip:\s+(.*)$/i;
const MARKER_TAIL_PATTERN = /(?:^|\s)([@＠]done|→done|[@＠](?:\d{4}-\d{1,2}-\d{1,2}|\d{4}|\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日)|→(?:\d{4}-\d{1,2}-\d{1,2}))\s*$/;
const DURATION_PAREN_TAIL_PATTERN = /\(([^()]+)\)\s*$/;
const DURATION_BARE_TAIL_PATTERN = /(?:^|\s)(\d+(?:\.\d+)?\s*(?:h|m|min))\s*$/i;
const ACTUAL_RANGE_TAIL_PATTERN = /(?:^|\s)(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/;
const ACTUAL_RUNNING_TAIL_PATTERN = /(?:^|\s)(\d{2}:\d{2})\s*-\s*$/;
const LEGACY_COMPLETED_PATTERN = /^(\s*)- \[x\]\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s+(.*)$/;
const LEGACY_RUNNING_PATTERN = /^(\s*)- \[\/\]\s+(\d{2}:\d{2})\s*-\s*(.*)$/;
const LEGACY_UNSTARTED_PLANNED_PATTERN = /^(\s*)- \[ \]\s+((?:\d{1,2}:\d{2}|\d{3,4}))\s*-\s*(.*)$/;

function splitTrailingMarker(text) {
    const match = text.match(MARKER_TAIL_PATTERN);
    if (!match || match.index == null) return { main: text.trimEnd(), marker: '' };
    return {
        main: text.slice(0, match.index).trimEnd(),
        marker: match[0].trim(),
    };
}

function splitTrailingDuration(text) {
    const paren = text.match(DURATION_PAREN_TAIL_PATTERN);
    if (paren && paren.index != null) {
        return {
            main: text.slice(0, paren.index).trimEnd(),
            duration: `(${paren[1].trim()})`,
        };
    }

    const bare = text.match(DURATION_BARE_TAIL_PATTERN);
    if (bare && bare.index != null) {
        return {
            main: text.slice(0, bare.index).trimEnd(),
            duration: bare[1].trim(),
        };
    }

    return { main: text.trimEnd(), duration: '' };
}

function splitLeadingDuration(text) {
    const trimmed = text.trim();
    const paren = trimmed.match(/^\(([^()]+)\)\s*(.*)$/);
    if (paren) {
        return {
            duration: `(${paren[1].trim()})`,
            main: (paren[2] || '').trim(),
        };
    }

    const bare = trimmed.match(/^(\d+(?:\.\d+)?\s*(?:h|m|min))\s+(.*)$/i);
    if (bare) {
        return {
            duration: bare[1].trim(),
            main: (bare[2] || '').trim(),
        };
    }

    return { duration: '', main: trimmed };
}

function splitNewTail(text, status) {
    const { main: withoutMarker, marker } = splitTrailingMarker(text);
    const { main: withoutDuration, duration } = splitTrailingDuration(withoutMarker);

    let actualStart = '';
    let actualEnd = '';
    let body = withoutDuration;

    if (status === 'x') {
        const range = withoutDuration.match(ACTUAL_RANGE_TAIL_PATTERN);
        if (range && range.index != null) {
            actualStart = range[1];
            actualEnd = range[2];
            body = withoutDuration.slice(0, range.index).trimEnd();
        }
    } else if (status === '/') {
        const running = withoutDuration.match(ACTUAL_RUNNING_TAIL_PATTERN);
        if (running && running.index != null) {
            actualStart = running[1];
            body = withoutDuration.slice(0, running.index).trimEnd();
        }
    }

    return { body: body.trim(), actualStart, actualEnd, duration, marker };
}

function normalizePlannedDash(body) {
    const match = body.match(/^((?:\d{1,2}:\d{2}|\d{3,4}))\s*-\s*(.*)$/);
    if (!match) return body.trim();
    return `${match[1]} ${match[2].trim()}`.trim();
}

function denormalizePlannedDash(body) {
    const match = body.match(/^((?:\d{1,2}:\d{2}|\d{3,4}))\s+(.*)$/);
    if (!match) return body.trim();
    return `${match[1]} - ${match[2].trim()}`.trim();
}

function joinParts(parts) {
    return parts.filter(Boolean).join(' ').trimEnd();
}

function migrateLineLegacyToV2(line) {
    const completed = line.match(LEGACY_COMPLETED_PATTERN);
    if (completed) {
        const [, indent, start, end, rest] = completed;
        const { main: withoutMarker, marker } = splitTrailingMarker(rest);
        const { main: content, duration } = splitLeadingDuration(withoutMarker);
        return joinParts([`${indent}- [x]`, content.trim(), `${start} - ${end}`, duration, marker]);
    }

    const running = line.match(LEGACY_RUNNING_PATTERN);
    if (running) {
        const [, indent, start, rest] = running;
        const { main: withoutMarker, marker } = splitTrailingMarker(rest);
        const { main: content, duration } = splitTrailingDuration(withoutMarker);
        return joinParts([`${indent}- [/]`, normalizePlannedDash(content), `${start} -`, duration, marker]);
    }

    const unstarted = line.match(LEGACY_UNSTARTED_PLANNED_PATTERN);
    if (unstarted) {
        const [, indent, planned, rest] = unstarted;
        const { main: withoutMarker, marker } = splitTrailingMarker(rest);
        const { main: content, duration } = splitTrailingDuration(withoutMarker);
        return joinParts([`${indent}- [ ]`, planned, content.trim(), duration, marker]);
    }

    return line;
}

function revertLineV2ToLegacy(line) {
    const checkbox = line.match(CHECKBOX_PATTERN);
    if (checkbox) {
        const [, indent, status, rest] = checkbox;
        const { body, actualStart, actualEnd, duration, marker } = splitNewTail(rest, status);

        if (status === 'x' && actualStart && actualEnd) {
            return joinParts([`${indent}- [x]`, `${actualStart} - ${actualEnd}`, duration, body, marker]);
        }

        if (status === '/' && actualStart) {
            return joinParts([`${indent}- [/]`, `${actualStart} -`, denormalizePlannedDash(body), duration, marker]);
        }

        if (status === ' ') {
            const legacyBody = denormalizePlannedDash(body);
            return joinParts([`${indent}- [ ]`, legacyBody, duration, marker]);
        }
    }

    const skip = line.match(SKIP_PATTERN);
    if (skip) {
        const [, indent, rest] = skip;
        const { main: withoutMarker, marker } = splitTrailingMarker(rest);
        const { main: content, duration } = splitTrailingDuration(withoutMarker);
        return joinParts([`${indent}- skip:`, denormalizePlannedDash(content), duration, marker]);
    }

    return line;
}

function transformContent(content, lineTransformer) {
    const lines = content.split('\n');
    let changed = 0;
    const next = lines.map((line) => {
        const updated = lineTransformer(line);
        if (updated !== line) changed += 1;
        return updated;
    });
    return {
        content: next.join('\n'),
        changed,
    };
}

function collectMarkdownFiles(inputPath) {
    const stat = fs.statSync(inputPath);
    if (stat.isFile()) return inputPath.endsWith('.md') ? [inputPath] : [];

    const files = [];
    for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
        const full = path.join(inputPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectMarkdownFiles(full));
            continue;
        }
        if (entry.isFile() && full.endsWith('.md')) {
            files.push(full);
        }
    }
    return files;
}

function runCli(mode, argv) {
    const args = argv.slice(2);
    const write = args.includes('--write');
    const targets = args.filter((arg) => !arg.startsWith('--'));

    if (targets.length === 0) {
        console.error(`Usage: node ${path.basename(argv[1])} [--write] <file-or-dir> [...]`);
        process.exitCode = 1;
        return;
    }

    const lineTransformer = mode === 'legacy-to-v2' ? migrateLineLegacyToV2 : revertLineV2ToLegacy;

    let changedFiles = 0;
    let changedLines = 0;

    for (const target of targets) {
        const resolved = path.resolve(target);
        const files = collectMarkdownFiles(resolved);
        for (const file of files) {
            const original = fs.readFileSync(file, 'utf8');
            const result = transformContent(original, lineTransformer);
            if (result.changed === 0) continue;

            changedFiles += 1;
            changedLines += result.changed;

            if (write) {
                fs.writeFileSync(file, result.content, 'utf8');
                console.log(`updated ${file} (${result.changed} lines)`);
            } else {
                console.log(`would update ${file} (${result.changed} lines)`);
            }
        }
    }

    console.log(`${write ? 'updated' : 'would update'} ${changedFiles} files / ${changedLines} lines`);
}

module.exports = {
    migrateLineLegacyToV2,
    revertLineV2ToLegacy,
    transformContent,
    runCli,
};
