import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArguments, sqlText } from '../scripts/local-community.mjs';

test('moderator helper requires an explicit local account and rejects remote arguments', () => {
  assert.deepEqual(parseArguments(['setup']), { command: 'setup' });
  assert.deepEqual(parseArguments(['moderator', '--user', 'local_seedy']), { command: 'moderator', userId: 'local_seedy' });
  for (const args of [[], ['moderator'], ['moderator', '--user', ''], ['setup', '--remote'], ['moderator', '--user', 'local_seedy', '--remote'], ['moderator', '--config', 'elsewhere']]) {
    assert.throws(() => parseArguments(args));
  }
});

test('account IDs remain data and cannot terminate the generated SQL literal', () => {
  assert.equal(sqlText("some'account"), "'some''account'");
  assert.equal(sqlText("x'; DELETE FROM haven_profiles; --"), "'x''; DELETE FROM haven_profiles; --'");
  for (const value of ['', 'a'.repeat(201), 'user\nother', 'user\u0000', null]) assert.throws(() => sqlText(value));
});

test('both community commands preload correctly from paths with spaces and URL characters', t => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'her-haven-cli-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'Her Haven #1 % local');
  for (const directory of ['scripts', 'node_modules/wrangler/bin', 'dist/server']) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  for (const name of ['local-community.mjs', 'sites-env.mjs', 'tool-environment.mjs']) {
    copyFileSync(new URL(`../scripts/${name}`, import.meta.url), path.join(root, 'scripts', name));
  }
  writeFileSync(path.join(root, 'dist/server/wrangler.json'), JSON.stringify({ d1_databases: [{ binding: 'DB' }] }));
  // A local fake CLI records the real spawned process's arguments. No database
  // or network is used; Node must successfully load the actual preload first.
  writeFileSync(path.join(root, 'node_modules/wrangler/bin/wrangler.js'), `
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
if (!process.env.WRANGLER_LOG_PATH) throw new Error('The environment preload did not run.');
appendFileSync('wrangler-calls.jsonl', JSON.stringify({ args, preloads: process.execArgv }) + '\\n');
const sql = args[args.indexOf('--command') + 1] || '';
const results = sql.startsWith('SELECT name FROM sqlite_master')
  ? ['haven_profiles', 'haven_posts', 'haven_replies', 'haven_reports'].map(name => ({ name }))
  : sql.startsWith('SELECT display_name FROM haven_profiles') ? [{ display_name: 'CLI test member' }] : [];
process.stdout.write(JSON.stringify([{ success: true, results }]));
`);
  const env = { ...process.env };
  for (const key of ['SITES_RUNTIME_ROOT', 'WRANGLER_LOG_PATH', 'WRANGLER_REGISTRY_PATH', 'MINIFLARE_REGISTRY_PATH']) delete env[key];
  for (const args of [['setup'], ['moderator', '--user', 'local_seedy']]) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/local-community.mjs'), ...args], {
      cwd: root, env, encoding: 'utf8', shell: false, timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, args[0] === 'setup' ? /Community tables are ready locally/ : /Enabled local moderator access for CLI test member/);
  }
  const calls = readFileSync(path.join(root, 'wrangler-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.deepEqual(call.args.slice(0, 4), ['d1', 'execute', 'DB', '--local']);
    assert.ok(!call.args.includes('--remote'));
    const preload = new URL(call.preloads[call.preloads.indexOf('--import') + 1]);
    assert.equal(preload.protocol, 'file:');
    assert.equal(preload.hash, '');
    assert.equal(fileURLToPath(preload), path.join(root, 'scripts/sites-env.mjs'));
  }
});
