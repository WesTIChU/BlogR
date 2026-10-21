CREATE TABLE IF NOT EXISTS outbound_clicks (
  site_key TEXT PRIMARY KEY,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
