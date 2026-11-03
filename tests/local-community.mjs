import test from 'node:test';
import assert from 'node:assert/strict';
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
