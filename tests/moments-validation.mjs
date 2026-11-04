import test from 'node:test';
import assert from 'node:assert/strict';
import { MomentsInputError, parseMomentsAction, parseMomentsQuery } from '../lib/moments-validation.ts';
import { MOMENT_MOODS, MOMENT_NEEDS, GOAL_AREAS } from '../lib/moments-contract.ts';

const checkIn = { action: 'save-check-in', day: '2026-11-04', mood: 'steady', need: 'unsure', note: '' };
const goal = { action: 'save-goal', title: 'Make time for a small creative project.', area: 'joy' };

test('private moments accept only their declared actions and fields', () => {
  assert.deepEqual(parseMomentsAction(checkIn), checkIn);
  assert.deepEqual(parseMomentsAction(goal), goal);
  for (const value of [null, [], 'save-check-in', 1, {}, { action: 'publish' }]) {
    assert.throws(() => parseMomentsAction(value), MomentsInputError);
  }
  for (const unexpected of [
    { userId: 'another-account' }, { ownerId: 'another-account' }, { role: 'moderator' },
    { createdAt: '2020-01-01' }, { updatedAt: '2020-01-01' }, { shared: true },
  ]) {
    assert.throws(() => parseMomentsAction({ ...checkIn, ...unexpected }), MomentsInputError);
    assert.throws(() => parseMomentsAction({ ...goal, ...unexpected }), MomentsInputError);
  }
  assert.throws(() => parseMomentsAction({ ...goal, completed: true }), MomentsInputError);
  assert.throws(() => parseMomentsAction({ ...checkIn, id: 'another-record' }), MomentsInputError);
});

test('mood, need and goal area are explicit choices rather than arbitrary input', () => {
  for (const mood of MOMENT_MOODS) assert.equal(parseMomentsAction({ ...checkIn, mood }).mood, mood);
  for (const need of MOMENT_NEEDS) assert.equal(parseMomentsAction({ ...checkIn, need }).need, need);
  for (const area of GOAL_AREAS) assert.equal(parseMomentsAction({ ...goal, area }).area, area);
  for (const value of [undefined, null, '', 'unknown', ['quiet'], 1]) {
    assert.throws(() => parseMomentsAction({ ...checkIn, mood: value }), MomentsInputError);
    assert.throws(() => parseMomentsAction({ ...checkIn, need: value }), MomentsInputError);
    assert.throws(() => parseMomentsAction({ ...goal, area: value }), MomentsInputError);
  }
});

test('notes stay optional plain text with bounded length and normalized newlines', () => {
  const literal = '<img src=x onerror="alert(1)">';
  assert.equal(parseMomentsAction({ ...checkIn, note: literal }).note, literal);
  assert.equal(parseMomentsAction({ ...checkIn, note: '  First\r\nSecond\rThird  ' }).note, 'First\nSecond\nThird');
  assert.equal(parseMomentsAction({ ...checkIn, note: '   ' }).note, '');
  assert.equal(parseMomentsAction({ ...checkIn, note: 'a'.repeat(1200) }).note.length, 1200);
  for (const note of ['a'.repeat(1201), 'A\u0000B', 'A\u001bB', 'A\u007fB', 42, {}, null]) {
    assert.throws(() => parseMomentsAction({ ...checkIn, note }), MomentsInputError);
  }
});

test('personal steps have bounded nonempty titles and literal completion booleans', () => {
  assert.equal(parseMomentsAction({ ...goal, title: '  One gentle step.  ' }).title, 'One gentle step.');
  assert.equal(parseMomentsAction({ ...goal, title: 'a'.repeat(160) }).title.length, 160);
  assert.equal(parseMomentsAction({ ...goal, title: '<script>literal text</script>' }).title, '<script>literal text</script>');
  for (const title of ['', '  ', 'a'.repeat(161), 'A\u0000B', false, null]) {
    assert.throws(() => parseMomentsAction({ ...goal, title }), MomentsInputError);
  }
  for (const completed of [true, false]) {
    assert.equal(parseMomentsAction({ action: 'goal-completion', id: 'goal-one', completed }).completed, completed);
  }
  for (const completed of [undefined, 'true', 'false', 1, 0, null]) {
    assert.throws(() => parseMomentsAction({ action: 'goal-completion', id: 'goal-one', completed }), MomentsInputError);
  }
});

test('calendar days reject impossible dates and timestamp-shaped values', () => {
  for (const day of ['2024-02-29', '2026-11-04', '2026-12-31']) {
    assert.equal(parseMomentsAction({ ...checkIn, day }).day, day);
    assert.deepEqual(parseMomentsAction({ action: 'delete-check-in', day }), { action: 'delete-check-in', day });
  }
  for (const day of [
    '', null, 20261104, '2026-02-29', '2024-02-30', '2026-04-31', '2026-13-01',
    '2026-00-01', '2026-11-00', '2026-11-32', '2026-1-04', '04-11-2026',
    '2026-11-04T00:00:00Z', '2026-11-04\n', "2026-11-04' OR 1=1--",
  ]) {
    assert.throws(() => parseMomentsAction({ ...checkIn, day }), MomentsInputError, String(day));
    assert.throws(() => parseMomentsAction({ action: 'delete-check-in', day }), MomentsInputError, String(day));
  }
});

test('goal identifiers cannot contain traversal, SQL fragments, or arbitrary objects', () => {
  for (const id of ['', '../goal', "goal' OR 1=1--", '<script>', 'a'.repeat(101), null, {}]) {
    assert.throws(() => parseMomentsAction({ action: 'delete-goal', id }), MomentsInputError);
    assert.throws(() => parseMomentsAction({ action: 'goal-completion', id, completed: true }), MomentsInputError);
  }
  assert.deepEqual(parseMomentsAction({ action: 'delete-goal', id: 'goal-one' }), { action: 'delete-goal', id: 'goal-one' });
});

test('private history queries require one valid day and reject extra account selectors', () => {
  assert.deepEqual(parseMomentsQuery(new URLSearchParams('day=2026-11-04')), { day: '2026-11-04' });
  assert.deepEqual(parseMomentsQuery(new URLSearchParams('day=2026-11-04&before=2026-10-31')), { day: '2026-11-04', before: '2026-10-31' });
  for (const query of [
    '', 'before=2026-11-04', 'day=', 'day=2026-02-29', 'day=2026-11-04&before=',
    'day=2026-11-04&before=2026-04-31', 'day=2026-11-04&day=2026-11-05',
    'day=2026-11-04&before=2026-11-01&before=2026-10-01',
    'day=2026-11-04&userId=another', 'day=2026-11-04&moderator=true',
    'day=2026-11-04&limit=10000', 'day=2026-11-04&cursor=anything',
  ]) assert.throws(() => parseMomentsQuery(new URLSearchParams(query)), MomentsInputError, query);
});
