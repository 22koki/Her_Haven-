-- Additive community tables. Existing private posts/replies are never copied.
-- Membership has no profile FK: private reset must not erase suspensions.
CREATE TABLE IF NOT EXISTS haven_community_members (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL,
 display_name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT haven_community_members_status_check CHECK(status IN ('pending','approved','declined','suspended')),
 role TEXT NOT NULL DEFAULT 'member' CONSTRAINT haven_community_members_role_check CHECK(role IN ('member','moderator')),
 application TEXT NOT NULL,
 decision_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS haven_community_members_user_idx ON haven_community_members(user_id);
CREATE INDEX IF NOT EXISTS haven_community_members_review_idx ON haven_community_members(status,updated_at);
CREATE TABLE IF NOT EXISTS haven_community_posts (
 id TEXT PRIMARY KEY NOT NULL,
 member_id TEXT NOT NULL REFERENCES haven_community_members(id),
 circle_id TEXT NOT NULL,
 body TEXT NOT NULL,
 response_preference TEXT NOT NULL,
 quiet INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'visible' CONSTRAINT haven_community_posts_state_check CHECK(state IN ('visible','hidden','deleted')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS haven_community_posts_feed_idx ON haven_community_posts(circle_id,state,created_at,id);
CREATE INDEX IF NOT EXISTS haven_community_posts_member_idx ON haven_community_posts(member_id,created_at);
CREATE TABLE IF NOT EXISTS haven_community_replies (
 id TEXT PRIMARY KEY NOT NULL,
 post_id TEXT NOT NULL REFERENCES haven_community_posts(id),
 member_id TEXT NOT NULL REFERENCES haven_community_members(id),
 body TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'visible' CONSTRAINT haven_community_replies_state_check CHECK(state IN ('visible','hidden','deleted')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS haven_community_replies_thread_idx ON haven_community_replies(post_id,state,created_at,id);
CREATE INDEX IF NOT EXISTS haven_community_replies_member_idx ON haven_community_replies(member_id,created_at);
CREATE TABLE IF NOT EXISTS haven_community_reports (
 id TEXT PRIMARY KEY NOT NULL,
 reporter_id TEXT NOT NULL REFERENCES haven_community_members(id),
 target_type TEXT NOT NULL CONSTRAINT haven_community_reports_target_check CHECK(target_type IN ('post','reply')),
 target_id TEXT NOT NULL,
 target_body TEXT NOT NULL,
 target_author_id TEXT NOT NULL REFERENCES haven_community_members(id),
 target_post_id TEXT NOT NULL,
 target_circle_id TEXT NOT NULL,
 target_quiet INTEGER NOT NULL DEFAULT 0,
 reason TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open' CONSTRAINT haven_community_reports_status_check CHECK(status IN ('open','actioned','dismissed')),
 resolution TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS haven_community_reports_queue_idx ON haven_community_reports(status,created_at);
CREATE INDEX IF NOT EXISTS haven_community_reports_reporter_idx ON haven_community_reports(reporter_id,created_at);
CREATE TABLE IF NOT EXISTS haven_community_blocks (
 id TEXT PRIMARY KEY NOT NULL,
 blocker_id TEXT NOT NULL REFERENCES haven_community_members(id),
 blocked_id TEXT NOT NULL REFERENCES haven_community_members(id),
 label TEXT NOT NULL,
 created_at TEXT NOT NULL,
 CONSTRAINT haven_community_blocks_self_check CHECK(blocker_id <> blocked_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS haven_community_blocks_pair_idx ON haven_community_blocks(blocker_id,blocked_id);
CREATE INDEX IF NOT EXISTS haven_community_blocks_reverse_idx ON haven_community_blocks(blocked_id,blocker_id);
CREATE TABLE IF NOT EXISTS haven_community_audit (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES haven_community_members(id),
 action TEXT NOT NULL,
 target_type TEXT NOT NULL,
 target_id TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS haven_community_audit_created_idx ON haven_community_audit(created_at,id);
CREATE TABLE IF NOT EXISTS haven_community_rate_limits (
 id TEXT PRIMARY KEY NOT NULL,
 count INTEGER NOT NULL,
 expires_at TEXT NOT NULL
);
