#!/usr/bin/env node

const { runCli } = require('./task_line_migration');

runCli('v2-to-legacy', process.argv);
