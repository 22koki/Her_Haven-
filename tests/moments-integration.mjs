import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDatabase, addProfile } from './community-fixture.mjs';
import { getMomentsSnapshot, runMomentsAction } from '../lib/moments-service.ts';
import { parseMomentsAction, parseMomentsQuery } from '../lib/moments-validation.ts';
import { getCommunitySnapshot } from '../lib/community-service.ts';

const DAY = '2026-11-04';
const NOW = new Date(`${DAY}T09:00:00.000Z`);
const migration = readFileSync(new URL('../drizzle/0002_private_moments.sql', import.meta.url), 'utf8');
const query = (options = {}) => parseMomentsQuery(new URLSearchParams({ day: DAY, ...options }));
const snapshot = (db, userId, options = {}) => getMomentsSnapshot(db, userId, query(options));
const action = (db, userId, input, options = {}, now = NOW) => runMomentsAction(db, userId, parseMomentsAction(input), query(options), now);
const checkIn = (day = DAY, note = 'A private reflection.') => ({ action: 'save-check-in', day, mood: 'steady', need: 'quiet', note });
const step = (title = 'Try one small creative project.') => ({ action: 'save-goal', title, area: 'joy' });

function database(t, { moments = true } = {}) {
  const db = createDatabase();
  t.after(() => db.close());
  if (moments) db.sqlite.exec(migration);
  return db;
}

function membership(db, userId, status = 'approved', role = 'member') {
  const id = randomUUID();
  db.sqlite.prepare(`INSERT INTO haven_community_members
    (id,user_id,display_name,status,role,application,decision_note,created_at,updated_at)
    VALUES (?,?,?,?,?,'Synthetic test membership','',?,?)`)
    .run(id, userId, userId, status, role, NOW.toISOString(), NOW.toISOString());
  return id;
}

function calendarDay(base, offset = 0) {
  const date = new Date(`${base}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function seedHistory(db, userId, count, lastDay = DAY, prefix = 'Private history') {
  const insert = db.sqlite.prepare(`INSERT INTO haven_private_check_ins
    (user_id,day,mood,need,note,created_at,updated_at) VALUES (?,?,'steady','quiet',?,?,?)`);
  const days = [];
  for (let index = 0; index < count; index++) {
    const day = calendarDay(lastDay, -index);
    days.push(day);
    insert.run(userId, day, `${prefix} ${index}`, NOW.toISOString(), NOW.toISOString());
  }
  return days;
}

async function denied(promise, allowed = [403, 404]) {
  await assert.rejects(promise, error => {
    assert.ok(allowed.includes(error.status), `Expected ${allowed.join('/')}, got ${error.status}: ${error.message}`);
    return true;
  });
}

test('private moments migration is additive, repeatable and preserves existing records', async t => {
  const db = database(t, { moments: false });
  addProfile(db, 'existing-owner');
  const memberId = membership(db, 'existing-owner', 'pending');
  db.sqlite.prepare(`INSERT INTO haven_posts
    (id,user_id,circle_id,body,response_preference,hide_profile,created_at)
    VALUES ('private-practice','existing-owner','everyday','Earlier private practice.','listen',0,?)`)
    .run(NOW.toISOString());
  db.sqlite.exec(migration);
  assert.deepEqual(await snapshot(db, 'existing-owner'), {
    profileReady: true, today: null, history: [], nextCursor: null, goal: null,
  });
  await action(db, 'existing-owner', checkIn());
  const saved = await action(db, 'existing-owner', step());
  db.sqlite.exec(migration);
  db.sqlite.exec(migration);
  const after = await snapshot(db, 'existing-owner');
  assert.equal(after.today.note, 'A private reflection.');
  assert.equal(after.history.length, 1);
  assert.equal(after.goal.id, saved.goal.id);
  assert.equal(db.sqlite.prepare('SELECT body FROM haven_posts WHERE id = ?').get('private-practice').body, 'Earlier private practice.');
  assert.equal(db.sqlite.prepare('SELECT status FROM haven_community_members WHERE id = ?').get(memberId).status, 'pending');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM haven_community_posts').get().count, 0);
});

test('missing or unagreed profiles cannot read or mutate private check-ins and goals', async t => {
  const db = database(t);
  for (const [userId, options] of [
    ['adult-not-accepted', { adultAccepted: false }],
    ['community-not-accepted', { communityAccepted: false }],
  ]) {
    addProfile(db, userId, options);
    seedHistory(db, userId, 1);
  }
  for (const userId of ['no-profile', 'adult-not-accepted', 'community-not-accepted']) {
    assert.deepEqual(await snapshot(db, userId), {
      profileReady: false, today: null, history: [], nextCursor: null, goal: null,
    });
    for (const input of [
      checkIn(), { action: 'delete-check-in', day: DAY }, step(),
      { action: 'goal-completion', id: 'any-step', completed: true },
      { action: 'delete-goal', id: 'any-step' },
    ]) await denied(action(db, userId, input), [403]);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM haven_private_check_ins').get().count, 2);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM haven_personal_goals').get().count, 0);
});

test('private check-ins stay available during pending, declined and suspended community membership', async t => {
  const db = database(t);
  for (const status of ['pending', 'declined', 'suspended']) {
    const userId = `member-${status}`;
    addProfile(db, userId);
    membership(db, userId, status);
    await action(db, userId, checkIn(DAY, `${status} member's private note.`));
    const saved = await action(db, userId, step(`${status} member's personal step.`));
    assert.equal(saved.profileReady, true);
    assert.equal(saved.today.note, `${status} member's private note.`);
    assert.equal(saved.goal.title, `${status} member's personal step.`);
    assert.equal((await getCommunitySnapshot(db, userId)).membership.status, status);
  }
});

test('one owner cannot read another owner’s moments, even with moderator privileges', async t => {
  const db = database(t);
  const owner = 'private-owner';
  const other = "other-account' OR 1=1 --";
  for (const userId of [owner, other, 'moderator']) addProfile(db, userId);
  membership(db, owner);
  membership(db, 'moderator', 'approved', 'moderator');
  const privateNote = 'Unshared owner reflection 4187.';
  const privateTitle = 'Unshared personal goal 9632.';
  await action(db, owner, checkIn(DAY, privateNote));
  await action(db, owner, step(privateTitle));
  await action(db, other, checkIn(DAY, 'A second account’s own reflection.'));
  await action(db, other, step('A second account’s own step.'));
  const own = await snapshot(db, owner);
  assert.equal(own.today.note, privateNote);
  assert.equal(own.goal.title, privateTitle);
  const second = await snapshot(db, other);
  assert.equal(second.today.note, 'A second account’s own reflection.');
  assert.equal(second.history.length, 1);
  assert.equal(second.goal.title, 'A second account’s own step.');
  const moderator = await snapshot(db, 'moderator');
  assert.deepEqual(moderator.history, []);
  assert.equal(moderator.today, null);
  assert.equal(moderator.goal, null);
  for (const state of [second, moderator, await getCommunitySnapshot(db, owner), await getCommunitySnapshot(db, 'moderator')]) {
    const serialized = JSON.stringify(state);
    assert.equal(serialized.includes(privateNote), false);
    assert.equal(serialized.includes(privateTitle), false);
  }
  for (const record of [own.today, ...own.history, own.goal]) {
    for (const key of ['userId', 'user_id', 'ownerId', 'email']) assert.equal(key in record, false);
  }
});

test('same-day saves replace one private check-in while preserving its creation date', async t => {
  const db = database(t);
  addProfile(db, 'owner');
  const initial = await action(db, 'owner', checkIn(DAY, 'First reflection.'));
  const later = new Date(`${DAY}T18:15:00.000Z`);
  const changed = await action(db, 'owner', {
    ...checkIn(), mood: 'hopeful', need: 'connection', note: '<script>Still literal text.</script>',
  }, {}, later);
  assert.equal(changed.history.length, 1);
  assert.equal(changed.today.day, DAY);
  assert.equal(changed.today.mood, 'hopeful');
  assert.equal(changed.today.need, 'connection');
  assert.equal(changed.today.note, '<script>Still literal text.</script>');
  assert.equal(changed.today.createdAt, initial.today.createdAt);
  assert.equal(changed.today.updatedAt, later.toISOString());
  assert.equal((await snapshot(db, 'owner')).today.note, changed.today.note);
});

test('saving accepts local dates around UTC midnight but rejects old or future backfills', async t => {
  const db = database(t);
  addProfile(db, 'owner');
  for (const day of ['2026-11-03', '2026-11-04', '2026-11-05']) {
    const saved = await action(db, 'owner', checkIn(day), { day }, new Date(`${DAY}T00:01:00.000Z`));
    assert.equal(saved.today.day, day);
  }
  for (const day of ['2026-11-02', '2026-11-06', '2025-01-01', '2099-01-01']) {
    await denied(action(db, 'owner', checkIn(day), { day }), [400]);
  }
  const leap = '2024-02-29';
  const savedLeap = await action(db, 'owner', checkIn(leap), { day: leap }, new Date(`${leap}T23:59:00.000Z`));
  assert.equal(savedLeap.today.day, leap);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM haven_private_check_ins').get().count, 4);
});

test('history pages preserve calendar order, owner boundaries and a separate today entry', async t => {
  const db = database(t);
  addProfile(db, 'owner');
  addProfile(db, 'other');
  const expected = seedHistory(db, 'owner', 31);
  seedHistory(db, 'other', 40, DAY, 'Other owner must stay private');
  const seen = [];
  let before;
  let pages = 0;
  do {
    const state = await snapshot(db, 'owner', before ? { before } : {});
    assert.ok(state.history.length <= 14);
    assert.equal(state.today.day, DAY);
    assert.equal(state.today.note, 'Private history 0');
    assert.equal(JSON.stringify(state).includes('Other owner must stay private'), false);
    seen.push(...state.history.map(item => item.day));
    before = state.nextCursor;
    if (before) assert.equal(before, state.history.at(-1).day);
    assert.ok(++pages <= 3, 'History should advance and terminate');
  } while (before);
  assert.equal(pages, 3);
  assert.equal(new Set(seen).size, 31);
  assert.deepEqual(seen, expected);
});

test('deleting a dated check-in only affects the caller and can remove historical entries', async t => {
  const db = database(t);
  for (const userId of ['owner', 'other', 'moderator']) addProfile(db, userId);
  membership(db, 'moderator', 'approved', 'moderator');
  const historicalDay = '2024-02-29';
  seedHistory(db, 'owner', 1, historicalDay, 'Owner’s old note');
  seedHistory(db, 'other', 1, historicalDay, 'Other account’s old note');
  await denied(action(db, 'moderator', { action: 'delete-check-in', day: historicalDay }), [404]);
  const removed = await action(db, 'owner', { action: 'delete-check-in', day: historicalDay });
  assert.deepEqual(removed.history, []);
  assert.equal((await snapshot(db, 'other', { day: historicalDay })).today.note, 'Other account’s old note 0');
  await denied(action(db, 'owner', { action: 'delete-check-in', day: historicalDay }), [404]);
});

test('personal steps complete, reopen and replace atomically without granting access through stale IDs', async t => {
  const db = database(t);
  for (const userId of ['owner', 'other', 'moderator']) addProfile(db, userId);
  membership(db, 'moderator', 'approved', 'moderator');
  const first = (await action(db, 'owner', step())).goal;
  assert.equal(first.completed, false);
  let state = await action(db, 'owner', { action: 'goal-completion', id: first.id, completed: true });
  assert.equal(state.goal.completed, true);
  state = await action(db, 'owner', { action: 'goal-completion', id: first.id, completed: false });
  assert.equal(state.goal.completed, false);
  await action(db, 'owner', { action: 'goal-completion', id: first.id, completed: true });
  const replacement = (await action(db, 'owner', { ...step('Write a few lines for my portfolio.'), area: 'work-money' })).goal;
  assert.notEqual(replacement.id, first.id);
  assert.equal(replacement.completed, false);
  assert.equal(replacement.area, 'work-money');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM haven_personal_goals WHERE user_id = ?').get('owner').count, 1);
  for (const input of [
    { action: 'goal-completion', id: first.id, completed: true },
    { action: 'delete-goal', id: first.id },
  ]) await denied(action(db, 'owner', input), [404]);
  for (const actor of ['other', 'moderator']) {
    await denied(action(db, actor, { action: 'goal-completion', id: replacement.id, completed: true }), [404]);
    await denied(action(db, actor, { action: 'delete-goal', id: replacement.id }), [404]);
  }
  assert.equal((await snapshot(db, 'owner')).goal.id, replacement.id);
  assert.equal((await snapshot(db, 'owner')).goal.completed, false);
  assert.equal((await action(db, 'owner', { action: 'delete-goal', id: replacement.id })).goal, null);
});

test('private-profile reset removes private moments while preserving community decisions and other owners', async t => {
  const db = database(t);
  for (const userId of ['owner', 'other']) {
    addProfile(db, userId);
    await action(db, userId, checkIn(DAY, `${userId}'s private reflection.`));
    await action(db, userId, step(`${userId}'s personal goal.`));
  }
  const memberId = membership(db, 'owner', 'suspended');
  db.sqlite.prepare('DELETE FROM haven_profiles WHERE user_id = ?').run('owner');
  assert.deepEqual(await snapshot(db, 'owner'), {
    profileReady: false, today: null, history: [], nextCursor: null, goal: null,
  });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM haven_private_check_ins WHERE user_id = ?').get('owner').count, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM haven_personal_goals WHERE user_id = ?').get('owner').count, 0);
  assert.equal(db.sqlite.prepare('SELECT status FROM haven_community_members WHERE id = ?').get(memberId).status, 'suspended');
  assert.equal((await snapshot(db, 'other')).today.note, "other's private reflection.");
  assert.equal((await snapshot(db, 'other')).goal.title, "other's personal goal.");
  addProfile(db, 'owner');
  const recreated = await snapshot(db, 'owner');
  assert.equal(recreated.profileReady, true);
  assert.deepEqual(recreated.history, []);
  assert.equal(recreated.goal, null);
  assert.equal((await getCommunitySnapshot(db, 'owner')).membership.status, 'suspended');
});

test('concurrent check-ins cannot exceed the owner limit and existing days remain editable at capacity', async t => {
  const db = database(t);
  addProfile(db, 'full-owner');
  addProfile(db, 'other');
  const oldDays = seedHistory(db, 'full-owner', 364, '2026-11-02');
  const candidates = ['2026-11-03', '2026-11-04', '2026-11-05'];
  const results = await Promise.allSettled(candidates.map(day => action(db, 'full-owner', checkIn(day), { day })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  for (const result of results.filter(result => result.status === 'rejected')) assert.equal(result.reason.status, 409);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM haven_private_check_ins WHERE user_id = ?').get('full-owner').count, 365);
  const savedDay = candidates[results.findIndex(result => result.status === 'fulfilled')];
  const edited = await action(db, 'full-owner', checkIn(savedDay, 'Updated at capacity.'), { day: savedDay });
  assert.equal(edited.today.note, 'Updated at capacity.');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM haven_private_check_ins WHERE user_id = ?').get('full-owner').count, 365);
  assert.equal((await action(db, 'other', checkIn())).history.length, 1);
  await action(db, 'full-owner', { action: 'delete-check-in', day: oldDays.at(-1) });
  const freshDay = candidates.find(day => day !== savedDay);
  assert.equal((await action(db, 'full-owner', checkIn(freshDay), { day: freshDay })).today.day, freshDay);
});

test('agreement changes and profile resets are rechecked before private writes', async t => {
  for (const kind of ['new-check-in', 'updated-check-in', 'new-goal', 'replacement-goal', 'completed-goal', 'reset-before-save']) {
    const db = database(t);
    addProfile(db, 'owner');
    if (kind === 'updated-check-in') await action(db, 'owner', checkIn(DAY, 'Original note.'));
    let goal;
    if (kind === 'replacement-goal' || kind === 'completed-goal') goal = (await action(db, 'owner', step('Original personal step.'))).goal;
    let scheduled = true;
    db.beforeExecute = sql => {
      if (!scheduled || !/^\s*(?:INSERT INTO|UPDATE)\s+haven_(?:private_check_ins|personal_goals)\b/i.test(sql)) return;
      scheduled = false;
      if (kind === 'reset-before-save') db.sqlite.prepare('DELETE FROM haven_profiles WHERE user_id = ?').run('owner');
      else db.sqlite.prepare('UPDATE haven_profiles SET community_accepted = 0 WHERE user_id = ?').run('owner');
    };
    const input = kind === 'completed-goal' ? { action: 'goal-completion', id: goal.id, completed: true }
      : kind.includes('goal') ? step('A stale replacement should not be saved.') : checkIn(DAY, 'A stale write should not be saved.');
    await denied(action(db, 'owner', input), [403]);
    assert.equal(scheduled, false, `The ${kind} race was exercised`);
    const notes = db.sqlite.prepare('SELECT note FROM haven_private_check_ins WHERE user_id = ?').all('owner');
    assert.deepEqual(notes.map(row => row.note), kind === 'updated-check-in' ? ['Original note.'] : []);
    const goals = db.sqlite.prepare('SELECT title,completed FROM haven_personal_goals WHERE user_id = ?').all('owner');
    assert.deepEqual(goals.map(row => ({ ...row })), goal ? [{ title: 'Original personal step.', completed: 0 }] : []);
  }
});
