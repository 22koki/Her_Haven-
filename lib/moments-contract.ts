/** Private account data. These records are never included in community snapshots. */
export const MOMENT_MOODS = ['heavy', 'tired', 'steady', 'hopeful', 'bright'] as const;
export const MOMENT_NEEDS = ['quiet', 'connection', 'growth', 'joy', 'unsure'] as const;
export const GOAL_AREAS = ['care', 'connection', 'work-money', 'joy'] as const;

export type MomentMood = typeof MOMENT_MOODS[number];
export type MomentNeed = typeof MOMENT_NEEDS[number];
export type GoalArea = typeof GOAL_AREAS[number];
export type PrivateCheckIn = {
  day: string;
  mood: MomentMood;
  need: MomentNeed;
  note: string;
  createdAt: string;
  updatedAt: string;
};
export type PersonalGoal = {
  id: string;
  title: string;
  area: GoalArea;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};
export type MomentsQuery = { day: string; before?: string };
export type MomentsSnapshot = {
  profileReady: boolean;
  today: PrivateCheckIn | null;
  history: PrivateCheckIn[];
  nextCursor: string | null;
  goal: PersonalGoal | null;
};
export type MomentsAction =
  | { action: 'save-check-in'; day: string; mood: MomentMood; need: MomentNeed; note: string }
  | { action: 'delete-check-in'; day: string }
  | { action: 'save-goal'; title: string; area: GoalArea }
  | { action: 'goal-completion'; id: string; completed: boolean }
  | { action: 'delete-goal'; id: string };
