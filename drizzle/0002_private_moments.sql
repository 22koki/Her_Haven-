-- Additive, account-private check-ins and one saved personal step.
-- No existing private or community content is copied or changed.
CREATE TABLE IF NOT EXISTS haven_private_check_ins (
  user_id TEXT NOT NULL REFERENCES haven_profiles(user_id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  mood TEXT NOT NULL,
  need TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT haven_private_check_ins_owner_day_pk PRIMARY KEY(user_id,day),
  CONSTRAINT haven_private_check_ins_day_check CHECK(length(day) = 10 AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(day,1,4) <> '0000' AND date(day,'+0 days') IS NOT NULL AND date(day,'+0 days') = day),
  CONSTRAINT haven_private_check_ins_mood_check CHECK(mood IN ('heavy','tired','steady','hopeful','bright')),
  CONSTRAINT haven_private_check_ins_need_check CHECK(need IN ('quiet','connection','growth','joy','unsure')),
  CONSTRAINT haven_private_check_ins_note_check CHECK(length(note) <= 1200)
);
CREATE TABLE IF NOT EXISTS haven_personal_goals (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES haven_profiles(user_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT haven_personal_goals_title_check CHECK(length(title) BETWEEN 1 AND 160 AND length(trim(title)) > 0),
  CONSTRAINT haven_personal_goals_area_check CHECK(area IN ('care','connection','work-money','joy')),
  CONSTRAINT haven_personal_goals_completed_check CHECK(completed IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS haven_personal_goals_id_idx ON haven_personal_goals(id);
