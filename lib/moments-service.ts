import type { CommunityDatabase } from './community-service.ts';
import type { MomentsAction, MomentsQuery, MomentsSnapshot, PersonalGoal, PrivateCheckIn } from './moments-contract.ts';

export class MomentsError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = 'MomentsError'; this.status = status; }
}

type CheckInRow = {
  day: string; mood: PrivateCheckIn['mood']; need: PrivateCheckIn['need']; note: string;
  created_at: string; updated_at: string;
};
type GoalRow = {
  id: string; title: string; area: PersonalGoal['area']; completed: number;
  created_at: string; updated_at: string;
};
const CHECK_INS = 'haven_private_check_ins';
const GOALS = 'haven_personal_goals';
const HISTORY_PAGE_SIZE = 14;
const CHECK_IN_LIMIT = 365;
// Used inside each data statement as well as the initial profile check. A
// concurrent reset or agreement change cannot authorize a later write.
const PROFILE_GATE = 'EXISTS (SELECT 1 FROM haven_profiles WHERE user_id = ? AND adult_accepted = 1 AND community_accepted = 1)';
const query = (db: CommunityDatabase, sql: string, args: unknown[] = []) => db.prepare(sql).bind(...args);

async function profileReady(db: CommunityDatabase, userId: string): Promise<boolean> {
  const row = await query(db,
    'SELECT user_id FROM haven_profiles WHERE user_id = ? AND adult_accepted = 1 AND community_accepted = 1',
    [userId]).first();
  return !!row;
}

async function requireProfile(db: CommunityDatabase, userId: string): Promise<void> {
  if (!await profileReady(db, userId)) {
    throw new MomentsError(403, 'Set up your chosen-name profile and welcome agreement before saving in your haven.');
  }
}

function checkIn(row: CheckInRow): PrivateCheckIn {
  return { day: row.day, mood: row.mood, need: row.need, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at };
}

function goal(row: GoalRow): PersonalGoal {
  return { id: row.id, title: row.title, area: row.area, completed: row.completed === 1, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Returns only this authenticated account's records, regardless of community role. */
export async function getMomentsSnapshot(db: CommunityDatabase, userId: string, options: MomentsQuery): Promise<MomentsSnapshot> {
  if (!await profileReady(db, userId)) {
    return { profileReady: false, today: null, history: [], nextCursor: null, goal: null };
  }
  const [today, page, savedGoal] = await Promise.all([
    query(db, `SELECT day,mood,need,note,created_at,updated_at FROM ${CHECK_INS} WHERE user_id = ? AND day = ? AND ${PROFILE_GATE}`,
      [userId, options.day, userId]).first<CheckInRow>(),
    query(db, `SELECT day,mood,need,note,created_at,updated_at FROM ${CHECK_INS} WHERE user_id = ? AND ${PROFILE_GATE}
      ${options.before ? 'AND day < ?' : ''} ORDER BY day DESC LIMIT ?`,
      [userId, userId, ...(options.before ? [options.before] : []), HISTORY_PAGE_SIZE + 1]).all<CheckInRow>(),
    query(db, `SELECT id,title,area,completed,created_at,updated_at FROM ${GOALS} WHERE user_id = ? AND ${PROFILE_GATE}`,
      [userId, userId]).first<GoalRow>(),
  ]);
  const more = page.results.length > HISTORY_PAGE_SIZE;
  const history = page.results.slice(0, HISTORY_PAGE_SIZE).map(checkIn);
  return {
    profileReady: true, today: today ? checkIn(today) : null, history,
    nextCursor: more ? history[history.length - 1].day : null,
    goal: savedGoal ? goal(savedGoal) : null,
  };
}

function requireCurrentDay(day: string, now: Date): void {
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const savedDay = new Date(`${day}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(savedDay) || Math.abs(savedDay - currentDay) > 86_400_000) {
    throw new MomentsError(400, 'A check-in is for today. Please check your device date and try again.');
  }
}

export async function runMomentsAction(
  db: CommunityDatabase,
  userId: string,
  action: MomentsAction,
  options: MomentsQuery,
  now: Date = new Date(),
): Promise<MomentsSnapshot> {
  await requireProfile(db, userId);
  const timestamp = now.toISOString();
  switch (action.action) {
    case 'save-check-in': {
      requireCurrentDay(action.day, now);
      // Capacity, ownership and agreement are checked in the same statement as
      // the upsert. Updating an existing day remains possible at the limit.
      const result = await query(db, `INSERT INTO ${CHECK_INS} (user_id,day,mood,need,note,created_at,updated_at)
        SELECT ?,?,?,?,?,?,? WHERE ${PROFILE_GATE}
        AND ((SELECT COUNT(*) FROM ${CHECK_INS} WHERE user_id = ?) < ?
          OR EXISTS (SELECT 1 FROM ${CHECK_INS} WHERE user_id = ? AND day = ?))
        ON CONFLICT(user_id,day) DO UPDATE SET mood = excluded.mood,need = excluded.need,
          note = excluded.note,updated_at = excluded.updated_at WHERE ${PROFILE_GATE}`,
      [userId, action.day, action.mood, action.need, action.note, timestamp, timestamp,
        userId, userId, CHECK_IN_LIMIT, userId, action.day, userId]).run();
      if (!result.meta.changes) {
        await requireProfile(db, userId);
        throw new MomentsError(409, 'Your haven holds up to 365 check-ins. Remove an older check-in before saving a new day.');
      }
      break;
    }
    case 'delete-check-in': {
      const result = await query(db, `DELETE FROM ${CHECK_INS} WHERE user_id = ? AND day = ? AND ${PROFILE_GATE}`,
        [userId, action.day, userId]).run();
      if (!result.meta.changes) {
        await requireProfile(db, userId);
        throw new MomentsError(404, 'This check-in is no longer saved in your haven.');
      }
      break;
    }
    case 'save-goal': {
      // One row per owner. Every replacement gets a new ID, so an old tab
      // cannot complete or delete the newly saved step using a stale ID.
      const result = await query(db, `INSERT INTO ${GOALS} (user_id,id,title,area,completed,created_at,updated_at)
        SELECT ?,?,?,?,0,?,? WHERE ${PROFILE_GATE}
        ON CONFLICT(user_id) DO UPDATE SET id = excluded.id,title = excluded.title,area = excluded.area,
          completed = 0,created_at = excluded.created_at,updated_at = excluded.updated_at WHERE ${PROFILE_GATE}`,
        [userId, crypto.randomUUID(), action.title, action.area, timestamp, timestamp, userId, userId]).run();
      if (!result.meta.changes) {
        await requireProfile(db, userId);
        throw new MomentsError(409, 'Your small step changed before it could be saved. Please refresh and try again.');
      }
      break;
    }
    case 'goal-completion': {
      const result = await query(db, `UPDATE ${GOALS} SET completed = ?,updated_at = ?
        WHERE user_id = ? AND id = ? AND ${PROFILE_GATE}`,
        [action.completed ? 1 : 0, timestamp, userId, action.id, userId]).run();
      if (!result.meta.changes) {
        await requireProfile(db, userId);
        throw new MomentsError(404, 'This small step is no longer the one saved in your haven. Please refresh.');
      }
      break;
    }
    case 'delete-goal': {
      const result = await query(db, `DELETE FROM ${GOALS} WHERE user_id = ? AND id = ? AND ${PROFILE_GATE}`,
        [userId, action.id, userId]).run();
      if (!result.meta.changes) {
        await requireProfile(db, userId);
        throw new MomentsError(404, 'This small step is no longer saved in your haven.');
      }
      break;
    }
  }
  return getMomentsSnapshot(db, userId, options);
}
