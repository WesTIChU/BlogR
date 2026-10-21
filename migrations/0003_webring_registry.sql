-- The registry is append-only: an ID is never deleted or assigned to another URL.
CREATE TABLE IF NOT EXISTS webring_id_registry (
  webring_id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  membership_status TEXT NOT NULL DEFAULT 'active'
    CHECK (membership_status IN ('active', 'retired')),
  first_assigned_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  retired_at TEXT
);

CREATE INDEX IF NOT EXISTS webring_id_registry_status_idx
  ON webring_id_registry (membership_status, canonical_url);

-- Do not use an ignore-on-conflict insert here.  A collision must abort the migration:
-- silently keeping either the registry row or the membership row would make
-- the append-only ID guarantee impossible to audit.
CREATE TRIGGER webring_registry_membership_id_conflict
BEFORE INSERT ON webring_id_registry
WHEN EXISTS (
  SELECT 1 FROM webring_id_registry
  WHERE webring_id = NEW.webring_id AND canonical_url <> NEW.canonical_url
)
BEGIN
  SELECT RAISE(ABORT, 'webring registry conflict: ID is bound to another URL');
END;

CREATE TRIGGER webring_registry_membership_url_conflict
BEFORE INSERT ON webring_id_registry
WHEN EXISTS (
  SELECT 1 FROM webring_id_registry
  WHERE canonical_url = NEW.canonical_url AND webring_id <> NEW.webring_id
)
BEGIN
  SELECT RAISE(ABORT, 'webring registry conflict: URL is bound to another ID');
END;

-- Preserve IDs already provisioned by the original Webring migration.
INSERT INTO webring_id_registry
  (webring_id, canonical_url, membership_status, first_assigned_at, last_seen_at, retired_at)
SELECT webring_id, canonical_url,
       'active', created_at, updated_at, NULL
FROM webring_members;

DROP TRIGGER webring_registry_membership_id_conflict;
DROP TRIGGER webring_registry_membership_url_conflict;

ALTER TABLE webring_members ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'active'
  CHECK (membership_status IN ('active', 'retired'));
