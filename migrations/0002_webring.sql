CREATE TABLE IF NOT EXISTS webring_members (
  webring_id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'active', 'suspended', 'retired')),
  last_successful_verification TEXT,
  last_checked_at TEXT,
  successful_installation_url TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webring_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webring_id TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  navigation_type TEXT NOT NULL CHECK (navigation_type IN ('previous', 'random', 'next')),
  referring_webring_id TEXT,
  event_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (webring_id) REFERENCES webring_members (webring_id),
  FOREIGN KEY (referring_webring_id) REFERENCES webring_members (webring_id)
);

CREATE INDEX IF NOT EXISTS webring_members_active_idx
  ON webring_members (verification_status, webring_id);
CREATE INDEX IF NOT EXISTS webring_clicks_member_idx
  ON webring_clicks (webring_id, created_at);
