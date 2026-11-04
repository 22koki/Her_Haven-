import { GOAL_AREAS, MOMENT_MOODS, MOMENT_NEEDS } from './moments-contract.ts';
import type { MomentsAction, MomentsQuery } from './moments-contract.ts';

export class MomentsInputError extends Error {
  constructor(message: string) { super(message); this.name = 'MomentsInputError'; }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MomentsInputError('Please send a valid request for your private haven.');
  }
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new MomentsInputError('This request includes an unsupported field.');
  }
}

function text(value: unknown, label: string, max: number, min = 1): string {
  if (typeof value !== 'string') throw new MomentsInputError(`${label} must be text.`);
  const clean = value.replace(/\r\n?/g, '\n').trim();
  if (clean.length < min || clean.length > max) {
    throw new MomentsInputError(`${label} must contain ${min}–${max} characters.`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)) {
    throw new MomentsInputError(`${label} contains unsupported control characters.`);
  }
  return clean;
}

function day(value: unknown): string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MomentsInputError('Choose a valid calendar date in YYYY-MM-DD format.');
  }
  const timestamp = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString().slice(0, 10) !== value) {
    throw new MomentsInputError('Choose a valid calendar date in YYYY-MM-DD format.');
  }
  return value;
}

function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new MomentsInputError(`Please choose a valid ${label}.`);
  }
  return value as T;
}

function id(value: unknown): string {
  const clean = text(value, 'Step identifier', 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(clean)) {
    throw new MomentsInputError('This step identifier is invalid.');
  }
  return clean;
}

export function parseMomentsAction(value: unknown): MomentsAction {
  const data = object(value);
  switch (data.action) {
    case 'save-check-in':
      fields(data, ['action', 'day', 'mood', 'need', 'note']);
      return {
        action: 'save-check-in', day: day(data.day),
        mood: choice(data.mood, MOMENT_MOODS, 'feeling'),
        need: choice(data.need, MOMENT_NEEDS, 'need'),
        note: text(data.note === undefined ? '' : data.note, 'Your note', 1200, 0),
      };
    case 'delete-check-in':
      fields(data, ['action', 'day']);
      return { action: 'delete-check-in', day: day(data.day) };
    case 'save-goal':
      fields(data, ['action', 'title', 'area']);
      return { action: 'save-goal', title: text(data.title, 'Your small step', 160), area: choice(data.area, GOAL_AREAS, 'step area') };
    case 'goal-completion':
      fields(data, ['action', 'id', 'completed']);
      if (typeof data.completed !== 'boolean') throw new MomentsInputError('Step completion must be on or off.');
      return { action: 'goal-completion', id: id(data.id), completed: data.completed };
    case 'delete-goal':
      fields(data, ['action', 'id']);
      return { action: 'delete-goal', id: id(data.id) };
    default:
      throw new MomentsInputError('This private-haven action is not supported.');
  }
}

export function parseMomentsQuery(params: URLSearchParams): MomentsQuery {
  for (const key of params.keys()) {
    if (!['day', 'before'].includes(key) || params.getAll(key).length !== 1) {
      throw new MomentsInputError('This private-haven query is invalid.');
    }
  }
  const result: MomentsQuery = { day: day(params.get('day')) };
  if (params.has('before')) result.before = day(params.get('before'));
  return result;
}
