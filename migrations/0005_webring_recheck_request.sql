ALTER TABLE webring_members ADD COLUMN verification_requested_at TEXT;

CREATE INDEX IF NOT EXISTS webring_members_recheck_queue_idx
  ON webring_members (verification_requested_at, membership_status, verification_status);
