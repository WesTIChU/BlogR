/* global console */

import {
  verificationStateAfterCheck,
  verifyWebringInstallation
} from '../shared/webring-verification.js'

// Free Workers: external HTTP subrequests are capped at 50 per invocation.
// A member can require the previous successful URL plus five approved paths.
// D1 uses Cloudflare's separate internal-service subrequest quota.
// Defaults use 48 external fetches (8 members x 6 paths) and six simultaneous
// connections, leaving a small margin under both platform caps.
export const MAX_HTTP_SUBREQUESTS = 50
export const MAX_PAGE_CHECKS_PER_MEMBER = 6
export const MAX_INTERNAL_SUBREQUESTS = 1_000
export const MAX_SAFE_CONCURRENCY = 6
export const MAX_SAFE_BATCH_SIZE = Math.floor(
  MAX_HTTP_SUBREQUESTS / MAX_PAGE_CHECKS_PER_MEMBER
)
export const VERIFICATION_CONCURRENCY = MAX_SAFE_CONCURRENCY
export const MAX_MEMBERS_PER_RUN = MAX_SAFE_BATCH_SIZE
export const URGENT_RESERVE_PER_RUN = 2
export const SCHEDULE_INTERVAL_MINUTES = 5
export const VERIFICATION_TARGET_HOURS = 24
export const VERIFICATION_RUNS =
  (VERIFICATION_TARGET_HOURS * 60) / SCHEDULE_INTERVAL_MINUTES
export const VERIFICATION_CAPACITY = MAX_MEMBERS_PER_RUN * VERIFICATION_RUNS
export const RETRY_INTERVAL_MINUTES = 15
export const MAX_RETRY_INTERVAL_MINUTES = 8 * 60
export const VERIFIED_FAILURE_GRACE_HOURS = 48
export const NEW_MEMBER_WINDOW_MINUTES = 15
export const LEASE_MINUTES = 15
export const D1_OPERATIONS_PER_RUN = 2
export const D1_OPERATIONS_PER_MEMBER = 2
export const MAX_HTTP_FETCHES_PER_RUN =
  MAX_MEMBERS_PER_RUN * MAX_PAGE_CHECKS_PER_MEMBER
export const MAX_D1_OPERATIONS_PER_RUN =
  D1_OPERATIONS_PER_RUN + MAX_MEMBERS_PER_RUN * D1_OPERATIONS_PER_MEMBER

const positiveInteger = (value, fallback, maximum) => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

export const retryDelayMinutes = (consecutiveFailures) =>
  Math.min(
    MAX_RETRY_INTERVAL_MINUTES,
    RETRY_INTERVAL_MINUTES *
      2 ** Math.max(0, Math.min(Number(consecutiveFailures || 1) - 1, 6))
  )

export const verificationSettings = (env = {}) => {
  const batchSize = positiveInteger(
    env.WEBRING_VERIFY_BATCH_SIZE,
    MAX_MEMBERS_PER_RUN,
    MAX_SAFE_BATCH_SIZE
  )
  const concurrency = Math.min(
    positiveInteger(
      env.WEBRING_VERIFY_CONCURRENCY,
      VERIFICATION_CONCURRENCY,
      MAX_SAFE_CONCURRENCY
    ),
    batchSize
  )
  return { batchSize, concurrency }
}

export const verificationCapacity = (members, settings = {}) => {
  const batchSize = settings.batchSize ?? MAX_MEMBERS_PER_RUN
  const invocations = Math.ceil(members / batchSize)
  return {
    memberships: members,
    batchSize,
    invocations,
    externalFetchesExpected: members,
    externalFetchesWorstCase: members * MAX_PAGE_CHECKS_PER_MEMBER,
    httpSubrequestsPerInvocation: batchSize * MAX_PAGE_CHECKS_PER_MEMBER,
    d1OperationsPerInvocation:
      D1_OPERATIONS_PER_RUN + batchSize * D1_OPERATIONS_PER_MEMBER,
    targetHoursCapacity: batchSize * VERIFICATION_RUNS,
    withinTargetHours: members <= batchSize * VERIFICATION_RUNS,
    spareCapacity: batchSize * VERIFICATION_RUNS - members
  }
}

export const runWithConcurrency = async (items, concurrency, callback) => {
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

export const compareDueMembers = (a, b) => {
  const priority = (member) => {
    if (member.last_checked_at == null) return 0
    if (Number(member.consecutive_failures || 0) > 0) return 1
    return 2
  }
  return (
    priority(a) - priority(b) ||
    String(a.last_checked_at ?? a.created_at ?? '').localeCompare(
      String(b.last_checked_at ?? b.created_at ?? '')
    ) ||
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) ||
    String(a.webring_id).localeCompare(String(b.webring_id))
  )
}

const memberColumns = `webring_id, canonical_url, successful_installation_url,
                       verification_status, membership_status, consecutive_failures,
                       last_checked_at, created_at, verification_lease_until`

const dueConditions = `
          AND (
            last_checked_at IS NULL
            OR (
              consecutive_failures > 0
              AND julianday(last_checked_at) < julianday(
                'now',
                printf(
                  '-%d minutes',
                  MIN(${MAX_RETRY_INTERVAL_MINUTES}, ${RETRY_INTERVAL_MINUTES} * (1 << MIN(consecutive_failures - 1, 5)))
                )
              )
            )
            OR (
              consecutive_failures = 0
                AND julianday(last_checked_at) < julianday('now', '-24 hours')
            )
          )`

const urgentConditions = `
          AND (
            (
              last_checked_at IS NULL
              AND julianday(created_at) >= julianday('now', '-${NEW_MEMBER_WINDOW_MINUTES} minutes')
            )
            OR (
              consecutive_failures > 0
              AND julianday(last_checked_at) < julianday(
                'now',
                printf(
                  '-%d minutes',
                  MIN(${MAX_RETRY_INTERVAL_MINUTES}, ${RETRY_INTERVAL_MINUTES} * (1 << MIN(consecutive_failures - 1, 5)))
                )
              )
            )
          )`

const queueOrder = `
         ORDER BY CASE WHEN last_checked_at IS NULL THEN 0
                       WHEN consecutive_failures > 0 THEN 1
                       ELSE 2 END,
                  COALESCE(last_checked_at, created_at, ''),
                  created_at,
                  webring_id`

export const dueMembersQuery = ({ urgent = false } = {}) =>
  `SELECT ${memberColumns}
     FROM webring_members
    WHERE membership_status = 'active'
      AND verification_status != 'retired'
      AND (verification_lease_until IS NULL OR julianday(verification_lease_until) <= julianday('now'))${dueConditions}${urgent ? urgentConditions : ''}${queueOrder}
    LIMIT ?`

const verifyOne = async (db, member, env) => {
  const startedAt = Date.now()
  try {
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
    console.log(
      JSON.stringify({
        event: 'webring_verification_result',
        webringId: member.webring_id,
        status: result.status,
        latencyMs: Date.now() - startedAt
      })
    )
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'webring_verification_error',
        webringId: member.webring_id,
        latencyMs: Date.now() - startedAt,
        error: String(error?.message ?? error)
      })
    )
    throw error
  }
}

export default {
  async scheduled(_event, env, ctx) {
    if (env.WEBRING_VERIFY_ENABLED !== 'true' || !env.OUTBOUND_CLICKS) return
    const settings = verificationSettings(env)
    const count = await env.OUTBOUND_CLICKS.prepare(
      `SELECT COUNT(*) AS membership_count,
              SUM(verification_status = 'pending') AS pending_count,
              SUM(last_checked_at IS NULL) AS never_checked_count,
              SUM(consecutive_failures > 0) AS failed_count,
              SUM(
                last_checked_at IS NULL
                OR (
                  consecutive_failures > 0
                  AND julianday(last_checked_at) < julianday(
                    'now',
                    printf(
                      '-%d minutes',
                      MIN(${MAX_RETRY_INTERVAL_MINUTES}, ${RETRY_INTERVAL_MINUTES} * (1 << MIN(consecutive_failures - 1, 5)))
                    )
                  )
                )
                OR (
                  consecutive_failures = 0
                  AND julianday(last_checked_at) < julianday('now', '-24 hours')
                )
              ) AS queue_backlog_count,
              MIN(last_checked_at) AS oldest_check_at,
              MAX(last_checked_at) AS newest_check_at
         FROM webring_members
        WHERE membership_status = 'active' AND verification_status != 'retired'`
    ).first()
    const membershipCount = Number(count?.membership_count || 0)
    const capacity = settings.batchSize * VERIFICATION_RUNS
    if (membershipCount > capacity)
      console.error(
        JSON.stringify({
          event: 'webring_verification_capacity_warning',
          targetHours: VERIFICATION_TARGET_HOURS,
          capacity,
          memberships: membershipCount
        })
      )
    const urgent = await env.OUTBOUND_CLICKS.prepare(
      dueMembersQuery({ urgent: true })
    )
      .bind(URGENT_RESERVE_PER_RUN)
      .all()
    const claimed = []
    for (const member of urgent.results ?? [])
      if (await claimDueMember(env.OUTBOUND_CLICKS, member))
        claimed.push(member)
    const remaining = settings.batchSize - claimed.length
    if (remaining > 0) {
      const due = await env.OUTBOUND_CLICKS.prepare(dueMembersQuery())
        .bind(remaining)
        .all()
      for (const member of due.results ?? [])
        if (await claimDueMember(env.OUTBOUND_CLICKS, member))
          claimed.push(member)
    }
    console.log(
      JSON.stringify({
        event: 'webring_verification_run',
        startedAt: new Date().toISOString(),
        memberships: membershipCount,
        pending: Number(count?.pending_count || 0),
        neverChecked: Number(count?.never_checked_count || 0),
        failed: Number(count?.failed_count || 0),
        queueBacklog: Number(count?.queue_backlog_count || 0),
        oldestCheckAt: count?.oldest_check_at ?? null,
        newestCheckAt: count?.newest_check_at ?? null,
        batchSize: settings.batchSize,
        concurrency: settings.concurrency,
        claimed: claimed.length,
        capacityPerTargetHours: capacity,
        targetHours: VERIFICATION_TARGET_HOURS
      })
    )
    ctx.waitUntil(
      runWithConcurrency(claimed, settings.concurrency, async (member) => {
        try {
          await verifyOne(env.OUTBOUND_CLICKS, member, env)
        } catch {
          // The lease expires and makes this member eligible for recovery.
        }
      })
    )
  }
}
