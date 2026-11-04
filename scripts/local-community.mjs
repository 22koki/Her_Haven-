/** Local development only. This helper never sends commands to a remote DB. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { projectRoot } from './sites-env.mjs';

const wrangler = path.join(projectRoot, 'node_modules/wrangler/bin/wrangler.js');
const config = path.join(projectRoot, 'dist/server/wrangler.json');
const state = path.join(projectRoot, '.wrangler/state');
const initialMigration = path.join(projectRoot, 'drizzle/0000_overjoyed_kang.sql');
const communityMigration = path.join(projectRoot, 'drizzle/0001_community.sql');
const privateTables = ['haven_profiles', 'haven_posts', 'haven_replies', 'haven_reports'];

export function sqlText(value) {
  if (typeof value !== 'string' || !value.length || value.length > 200 || /[\x00-\x1f\x7f]/u.test(value)) {
    throw new Error('Use a non-empty local account ID of at most 200 characters.');
  }
  return `'${value.replaceAll("'", "''")}'`;
}

export function parseArguments(args) {
  if (args.length === 1 && args[0] === 'setup') return { command: 'setup' };
  if (args.length === 3 && args[0] === 'moderator' && args[1] === '--user') {
    const userId = args[2].trim();
    sqlText(userId);
    return { command: 'moderator', userId };
  }
  throw new Error('Use npm run community:setup, or npm run community:moderator -- --user local_seedy. Both commands only change the local development database.');
}

function execute(extra) {
  // Keep the executable, DB binding, local flag, config and persistence path
  // fixed. User input is SQL-escaped data and never a shell command or path.
  // Absolute ESM preloads need file URLs; Windows drive paths look like schemes.
  const result = spawnSync(process.execPath, [
    '--import', new URL('./sites-env.mjs', import.meta.url).href, wrangler,
    'd1', 'execute', 'DB', '--local', '--config', config,
    '--persist-to', state, '--json', ...extra,
  ], { cwd: projectRoot, encoding: 'utf8', shell: false, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'The local database command failed.').trim());
  }
  let output;
  try { output = JSON.parse(result.stdout.trim()); }
  catch { throw new Error('Wrangler did not return the expected JSON response. Check your local build and database setup.'); }
  const statements = Array.isArray(output) ? output : [output];
  if (statements.some(row => row.success === false)) throw new Error('A local database statement did not complete.');
  return statements.flatMap(row => Array.isArray(row.results) ? row.results : []);
}

function checkBuild() {
  if (!existsSync(wrangler)) throw new Error('Install dependencies with npm ci first.');
  if (!existsSync(config)) throw new Error('Run npm run build first to create the local database configuration.');
  const built = JSON.parse(readFileSync(config, 'utf8'));
  if (!built.d1_databases?.some(binding => binding.binding === 'DB')) {
    throw new Error('The built configuration has no DB binding. Rebuild this Her Haven checkout.');
  }
}

function setup() {
  const existing = execute(['--command', `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${privateTables.map(sqlText).join(',')})`]);
  if (existing.length === 0) {
    execute(['--file', initialMigration]);
    process.stdout.write('Created the local private-practice tables.\n');
  } else if (existing.length !== privateTables.length) {
    throw new Error('The local private schema is incomplete. Restore or finish its initial migration before upgrading; no existing tables have been replaced.');
  }
  execute(['--file', communityMigration]);
  process.stdout.write('Community tables are ready locally. Existing private posts and profiles are preserved.\n');
}

function moderator(userId) {
  const user = sqlText(userId);
  const [profile] = execute(['--command', `SELECT display_name FROM haven_profiles WHERE user_id=${user} AND adult_accepted=1 AND community_accepted=1 LIMIT 1`]);
  if (!profile) throw new Error('First sign in locally and finish My space. The standard local sign-in uses account ID local_seedy. No moderator was granted.');
  const [existing] = execute(['--command', `SELECT id,status,role FROM haven_community_members WHERE user_id=${user} LIMIT 1`]);
  if (existing?.role === 'moderator' && existing.status === 'approved') {
    process.stdout.write('This account is already an approved moderator in the local development database. Refresh Community.\n');
    return;
  }
  const now = sqlText(new Date().toISOString());
  const note = sqlText('Local development access granted by the project operator.');
  const name = sqlText(profile.display_name);
  execute(['--command', `
    INSERT INTO haven_community_members (id,user_id,display_name,status,role,application,decision_note,created_at,updated_at)
    VALUES (${sqlText(randomUUID())},${user},${name},'approved','moderator','Local development moderator setup',${note},${now},${now})
    ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,status='approved',role='moderator',decision_note=excluded.decision_note,updated_at=excluded.updated_at;
    INSERT INTO haven_community_audit (id,actor_id,action,target_type,target_id,reason,created_at)
    SELECT ${sqlText(randomUUID())},id,'local-grant-moderator','member',id,${note},${now}
    FROM haven_community_members WHERE user_id=${user};
  `]);
  process.stdout.write(`Enabled local moderator access for ${profile.display_name}. Refresh Community and open the care desk.\nThis changes only this computer's local database, not the hosted website.\n`);
}

export function main(args) {
  const input = parseArguments(args);
  checkBuild();
  if (input.command === 'setup') setup();
  else moderator(input.userId);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Local community setup failed.'}\n`);
    process.exitCode = 1;
  }
}
