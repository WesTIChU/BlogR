/* global console */

import {
  verificationStateAfterCheck,
  verifyWebringInstallation
} from '../shared/webring-verification.js'

// Free Workers: external HTTP subrequests are capped at 50 per invocation.
// A member can require the previous successful URL plus five approved paths.
// D1 uses Cloudflare's separate internal-service subrequest quota.
export const MAX_HTTP_SUBREQUESTS = 50
export const MAX_PAGE_CHECKS_PER_MEMBER = 6
export const MAX_INTERNAL_SUBREQUESTS = 1_000
export const VERIFICATION_CONCURRENCY = 6
export const MAX_MEMBERS_PER_RUN = 6
export const SCHEDULE_INTERVAL_MINUTES = 5
export const VERIFICATION_TARGET_HOURS = 12
export const VERIFICATION_RUNS =
  (VERIFICATION_TARGET_HOURS * 60) / SCHEDULE_INTERVAL_MINUTES
export const VERIFICATION_CAPACITY = MAX_MEMBERS_PER_RUN * VERIFICATION_RUNS
export const LEASE_MINUTES = 15
export const D1_OPERATIONS_PER_RUN = 2
export const D1_OPERATIONS_PER_MEMBER = 2
export const MAX_HTTP_FETCHES_PER_RUN =
  MAX_MEMBERS_PER_RUN * MAX_PAGE_CHECKS_PER_MEMBER
export const MAX_D1_OPERATIONS_PER_RUN =
  D1_OPERATIONS_PER_RUN + MAX_MEMBERS_PER_RUN * D1_OPERATIONS_PER_MEMBER

export const verificationCapacity = (members) => ({
  memberships: members,
  batchSize: MAX_MEMBERS_PER_RUN,
  invocations: Math.ceil(members / MAX_MEMBERS_PER_RUN),
  externalFetchesExpected: members,
  externalFetchesWorstCase: members * MAX_PAGE_CHECKS_PER_MEMBER,
  httpSubrequestsPerInvocation: MAX_HTTP_FETCHES_PER_RUN,
  d1OperationsPerInvocation: MAX_D1_OPERATIONS_PER_RUN,
  twelveHourCapacity: VERIFICATION_CAPACITY,
  withinTwelveHours: members <= VERIFICATION_CAPACITY,
  spareCapacity: VERIFICATION_CAPACITY - members
})

const runWithConcurrency = async (items, concurrency, callback) => {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      await callback(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  )
}

export const claimDueMember = async (db, member) => {
  const result = await db
    .prepare(
      `UPDATE webring_members
       SET verification_lease_until = datetime('now', '+${LEASE_MINUTES} minutes')
       WHERE webring_id = ?
         AND membership_status = 'active'
         AND verification_status != 'retired'
         AND (verification_lease_until IS NULL OR julianday(verification_lease_until) <= julianday('now'))`
    )
    .bind(member.webring_id)
    .run()
  return result.meta?.changes === 1
}

const verifyOne = async (db, member, env) => {
  const result = await verifyWebringInstallation(member, {
    blogrBaseUrl: env.BLOGR_BASE_URL || 'https://blogr.directory'
  })
  const now = new Date().toISOString()
  const state = verificationStateAfterCheck(member, result, now)
  const columns = Object.keys(state)
  await db
    .prepare(
      `UPDATE webring_members SET ${columns.map((column) => `${column} = ?`).join(', ')},
       verification_lease_until = NULL, updated_at = ? WHERE webring_id = ?`
    )
    .bind(...columns.map((column) => state[column]), now, member.webring_id)
    .run()
}

export default {
  async scheduled(_event, env, ctx) {
    if (env.WEBRING_VERIFY_ENABLED !== 'true' || !env.OUTBOUND_CLICKS) return
    const count = await env.OUTBOUND_CLICKS.prepare(
      `SELECT COUNT(*) AS membership_count FROM webring_members
       WHERE membership_status = 'active' AND verification_status != 'retired'`
    ).first()
    const membershipCount = Number(count?.membership_count || 0)
    if (membershipCount > VERIFICATION_CAPACITY)
      console.error(
        `Webring verification capacity is insufficient for a 12-hour target: ${VERIFICATION_CAPACITY}/${membershipCount} memberships`
      )
    const due = await env.OUTBOUND_CLICKS.prepare(
      `SELECT webring_id, canonical_url, successful_installation_url,
              verification_status, membership_status, consecutive_failures
         , verification_lease_until
         FROM webring_members
        WHERE membership_status = 'active'
          AND verification_status != 'retired'
          AND (verification_lease_until IS NULL OR julianday(verification_lease_until) <= julianday('now'))
          AND (last_checked_at IS NULL OR julianday(last_checked_at) < julianday('now', '-12 hours'))
        ORDER BY CASE WHEN verification_status = 'pending' THEN 0 ELSE 1 END,
                 CASE WHEN last_checked_at IS NULL THEN 0 ELSE 1 END,
                 COALESCE(last_checked_at, '')
        LIMIT ?`
    )
      .bind(MAX_MEMBERS_PER_RUN)
      .all()
    const claimed = []
    for (const member of due.results ?? [])
      if (await claimDueMember(env.OUTBOUND_CLICKS, member))
        claimed.push(member)
    ctx.waitUntil(
      runWithConcurrency(claimed, VERIFICATION_CONCURRENCY, (member) =>
        verifyOne(env.OUTBOUND_CLICKS, member, env)
      )
    )
  }
}
