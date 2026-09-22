-- User profile (avatar from Google) + per-user/global daily rate limiting
-- (see DESIGN_SYSTEM.md's profile/rate-limit grilling session). Neurons is
-- an account-wide free-tier budget shared by every user, so limiting only
-- per-user isn't enough - usage_global_daily is the second, tighter layer.

ALTER TABLE user_account ADD COLUMN avatar_url TEXT;

CREATE TABLE usage_daily (
  user_account_id TEXT NOT NULL,
  usage_date TEXT NOT NULL, -- YYYY-MM-DD, UTC
  meeting_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_account_id, usage_date)
);

CREATE TABLE usage_global_daily (
  usage_date TEXT PRIMARY KEY, -- YYYY-MM-DD, UTC
  meeting_count INTEGER NOT NULL DEFAULT 0
);
