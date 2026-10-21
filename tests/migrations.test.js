import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migration = (name) =>
  readFileSync(resolve(root, 'migrations', name), 'utf8')
const run = (database, sql) =>
  execFileSync('sqlite3', [database], { input: sql, encoding: 'utf8' })

test('0002 and 0003 apply in order without changing outbound click data', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blogr-migrations-'))
  const database = resolve(directory, 'test.db')
  try {
    run(
      database,
      `${migration('0001_outbound_clicks.sql')}\n` +
        `INSERT INTO outbound_clicks VALUES ('https://example.test/', 7, '2026-01-01T00:00:00Z');\n` +
        migration('0002_webring.sql') +
        '\n' +
        migration('0003_webring_registry.sql') +
        '\n' +
        migration('0004_webring_verification_lease.sql')
    )
    assert.equal(
      run(
        database,
        "SELECT site_key || '|' || total_clicks || '|' || updated_at FROM outbound_clicks;"
      ).trim(),
      'https://example.test/|7|2026-01-01T00:00:00Z'
    )
    assert.match(
      run(
        database,
        "SELECT sql FROM sqlite_master WHERE name = 'webring_members';"
      ),
      /verification_lease_until/
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('0003 aborts when an existing registry binding conflicts with a membership', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'blogr-migration-conflict-'))
  const database = resolve(directory, 'test.db')
  try {
    run(
      database,
      `${migration('0001_outbound_clicks.sql')}\n${migration('0002_webring.sql')}\n` +
        "INSERT INTO webring_members VALUES ('br-0123456789abcdef0123456789abcdef', 'https://member.test/', 'pending', NULL, NULL, NULL, 0, '2026-01-01', '2026-01-01');\n" +
        "CREATE TABLE webring_id_registry (webring_id TEXT PRIMARY KEY, canonical_url TEXT NOT NULL UNIQUE, membership_status TEXT NOT NULL DEFAULT 'active', first_assigned_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, retired_at TEXT);\n" +
        "INSERT INTO webring_id_registry VALUES ('br-0123456789abcdef0123456789abcdef', 'https://different.test/', 'active', '2026-01-01', '2026-01-01', NULL);"
    )
    assert.throws(
      () => run(database, migration('0003_webring_registry.sql')),
      /webring registry conflict|ID is bound/
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
