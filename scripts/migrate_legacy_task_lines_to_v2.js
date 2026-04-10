#!/usr/bin/env node

const { runCli } = require('./task_line_migration');

runCli('legacy-to-v2', process.argv);
