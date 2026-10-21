import { canonicalWebringUrl, isValidWebringId } from './webring.js'

export const catalogueMemberships = (catalogues) => {
  if (!Array.isArray(catalogues))
    throw new Error('Webring catalogues could not be loaded')
  const byId = new Map()
  const byUrl = new Map()
  for (const entry of catalogues.flat()) {
    const url = canonicalWebringUrl(entry.url)
    if (!isValidWebringId(entry.webringId))
      throw new Error(`Invalid or missing Webring ID for ${entry.url}`)
    if (byId.has(entry.webringId) && byId.get(entry.webringId) !== url)
      throw new Error(
        `Webring ID is assigned to different URLs: ${entry.webringId}`
      )
    if (byUrl.has(url) && byUrl.get(url) !== entry.webringId)
      throw new Error(`Website has multiple Webring IDs: ${url}`)
    byId.set(entry.webringId, url)
    byUrl.set(url, entry.webringId)
  }
  return { byId, byUrl }
}

export const planRegistrySync = (catalogues, registered) => {
  const current = catalogueMemberships(catalogues)
  const rows = new Map(registered.map((row) => [row.webring_id, row]))
  const byRegisteredUrl = new Map(
    registered.map((row) => [row.canonical_url, row])
  )
  const upserts = []
  for (const [id, url] of current.byId) {
    const oldById = rows.get(id)
    const oldByUrl = byRegisteredUrl.get(url)
    if (oldById && oldById.canonical_url !== url)
      throw new Error(
        `Webring ID is permanently bound to ${oldById.canonical_url}`
      )
    if (oldByUrl && oldByUrl.webring_id !== id)
      throw new Error(
        `Restore ${url} with its original Webring ID ${oldByUrl.webring_id}`
      )
    upserts.push({ webring_id: id, canonical_url: url })
  }
  const retired = registered
    .filter(
      (row) =>
        !current.byId.has(row.webring_id) && row.membership_status !== 'retired'
    )
    .map((row) => row.webring_id)
  return { upserts, retired }
}

export const createD1RegistryClient = ({
  accountId,
  databaseId,
  apiToken,
  fetchImpl = globalThis.fetch
}) => {
  if (!accountId || !databaseId || !apiToken)
    throw new Error('Cloudflare D1 registry credentials are required')
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`
  const redactCredentials = (value) =>
    [apiToken, accountId, databaseId].reduce(
      (text, credential) => text.replaceAll(credential, '[redacted]'),
      value
    )
  const describeErrors = (body) => {
    const errors = Array.isArray(body?.errors) ? body.errors : []
    const messages = Array.isArray(body?.messages) ? body.messages : []
    const details = [...errors, ...messages]
      .map((item) => {
        const code = item?.code == null ? '' : `[${item.code}] `
        const message = redactCredentials(String(item?.message ?? item ?? ''))
          .replace(
            /(authorization|api[-_ ]?token|password|secret|credential)\s*[:=]\s*\S+/gi,
            '$1=[redacted]'
          )
          .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
        return `${code}${message}`.trim()
      })
      .filter(Boolean)
    const permissionHint = [...errors, ...messages].some(
      (item) => Number(item?.code) === 7500
    )
      ? '; check that the API token has D1 Write permission'
      : ''
    return details.length > 0
      ? `${details.join('; ')}${permissionHint}`
      : `No error details returned${permissionHint}`
  }
  const readResponse = async (response, operation) => {
    const status = Number.isInteger(response?.status)
      ? response.status
      : 'unknown'
    let raw
    try {
      raw = await response.text()
    } catch {
      throw new Error(
        `Cloudflare D1 registry ${operation} failed (HTTP ${status}): unable to read response body`
      )
    }
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      throw new Error(
        `Cloudflare D1 registry ${operation} failed (HTTP ${status}): invalid JSON response`
      )
    }
    if (!response.ok || !body.success)
      throw new Error(
        `Cloudflare D1 registry ${operation} failed (HTTP ${status}): ${describeErrors(body)}`
      )
    return body
  }
  return {
    async query(sql, params = []) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql, params })
      })
      const body = await readResponse(response, 'request')
      return body.result?.[0]?.results ?? []
    },
    async batch(statements) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          batch: statements.map(({ sql, params = [] }) => ({ sql, params }))
        })
      })
      const body = await readResponse(response, 'batch request')
      return body.result ?? []
    }
  }
}

const statement = (db, sql, params) =>
  db.prepare ? db.prepare(sql).bind(...params) : { sql, params }

export const synchroniseWebringMembers = async (
  db,
  catalogues,
  now = new Date().toISOString()
) => {
  const current = catalogueMemberships(catalogues)
  const registered = await (db.query
    ? db.query('SELECT webring_id, canonical_url FROM webring_members')
    : db
        .prepare('SELECT webring_id, canonical_url FROM webring_members')
        .all()
        .then((result) => result.results ?? []))
  const rows = registered.results ?? registered
  const byId = new Map(rows.map((row) => [row.webring_id, row]))
  const byUrl = new Map(rows.map((row) => [row.canonical_url, row]))
  for (const [webring_id, canonical_url] of current.byId) {
    const oldById = byId.get(webring_id)
    const oldByUrl = byUrl.get(canonical_url)
    if (oldById && oldById.canonical_url !== canonical_url)
      throw new Error(
        `Webring membership ID is bound to another URL: ${webring_id}`
      )
    if (oldByUrl && oldByUrl.webring_id !== webring_id)
      throw new Error(
        `Webring membership URL is bound to another ID: ${canonical_url}`
      )
  }
  const upserts = [...current.byId].map(([webring_id, canonical_url]) =>
    statement(
      db,
      `INSERT INTO webring_members
       (webring_id, canonical_url, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(webring_id) DO UPDATE SET
         membership_status = 'active',
         verification_status = CASE WHEN verification_status = 'retired' THEN 'pending' ELSE verification_status END,
         updated_at = excluded.updated_at`,
      [webring_id, canonical_url, now, now]
    )
  )
  for (let index = 0; index < upserts.length; index += 100)
    await (db.batch
      ? db.batch(upserts.slice(index, index + 100))
      : Promise.all(
          upserts
            .slice(index, index + 100)
            .map((item) => db.query(item.sql, item.params))
        ))
  const ids = [...current.byId.keys()]
  if (rows.some((row) => !current.byId.has(row.webring_id))) {
    const placeholders = ids.map(() => '?').join(', ')
    const params = [now, ...ids]
    await (db.batch
      ? db.batch([
          statement(
            db,
            `UPDATE webring_members
             SET membership_status = 'retired', updated_at = ?
             WHERE webring_id NOT IN (${placeholders})`,
            params
          )
        ])
      : db.query(
          `UPDATE webring_members
           SET membership_status = 'retired', updated_at = ?
           WHERE webring_id NOT IN (${placeholders})`,
          params
        ))
  }
  return { synchronised: current.byId.size }
}

export const synchroniseWebringRegistry = async (
  db,
  catalogues,
  now = new Date().toISOString()
) => {
  if (
    !Array.isArray(catalogues) ||
    catalogues.length === 0 ||
    catalogues.flat().length === 0
  )
    throw new Error('Webring catalogues could not be loaded')
  const query = (sql, params = []) =>
    db.query
      ? db.query(sql, params)
      : db
          .prepare(sql)
          .bind(...params)
          .all()
          .then((result) => result.results ?? [])
  const registered = await query(
    'SELECT webring_id, canonical_url, membership_status FROM webring_id_registry'
  )
  const plan = planRegistrySync(catalogues, registered)
  if (db.batch) {
    const statements = [
      ...plan.upserts.map(({ webring_id, canonical_url }) =>
        statement(
          db,
          `INSERT INTO webring_id_registry
           (webring_id, canonical_url, membership_status, first_assigned_at, last_seen_at, retired_at)
           VALUES (?, ?, 'active', ?, ?, NULL)
            ON CONFLICT(webring_id) DO UPDATE SET
              membership_status = 'active', last_seen_at = ?, retired_at = NULL`,
          [webring_id, canonical_url, now, now, now]
        )
      ),
      ...plan.retired.map((id) =>
        statement(
          db,
          `UPDATE webring_id_registry
             SET membership_status = 'retired', retired_at = COALESCE(retired_at, ?)
             WHERE webring_id = ?`,
          [now, id]
        )
      )
    ]
    for (let index = 0; index < statements.length; index += 100)
      await db.batch(statements.slice(index, index + 100))
  } else {
    for (const { webring_id, canonical_url } of plan.upserts)
      await query(
        `INSERT INTO webring_id_registry
         (webring_id, canonical_url, membership_status, first_assigned_at, last_seen_at, retired_at)
         VALUES (?, ?, 'active', ?, ?, NULL)
         ON CONFLICT(webring_id) DO UPDATE SET
           membership_status = 'active', last_seen_at = ?, retired_at = NULL`,
        [webring_id, canonical_url, now, now, now]
      )
    for (const id of plan.retired)
      await query(
        `UPDATE webring_id_registry
         SET membership_status = 'retired', retired_at = COALESCE(retired_at, ?)
         WHERE webring_id = ?`,
        [now, id]
      )
  }
  return plan
}
