import { execFileSync } from 'node:child_process'

export const CLICK_COUNT_FILES = ['data/blogs.json', 'data/websites.json']
export const ALLOWED_CLICK_FIELDS = new Set(['clicks'])

const withoutClickFields = (entry) => {
  const copy = { ...entry }
  for (const field of ALLOWED_CLICK_FIELDS) delete copy[field]
  return copy
}

export function validateClickChanges(before, after, file = 'catalogue') {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    throw new Error(`${file} must remain a JSON array`)
  }
  if (before.length !== after.length) {
    throw new Error(`${file} entries cannot be added, removed, or reordered`)
  }

  for (let index = 0; index < before.length; index += 1) {
    const previous = before[index]
    const current = after[index]
    if (
      JSON.stringify(withoutClickFields(previous)) !==
      JSON.stringify(withoutClickFields(current))
    ) {
      throw new Error(
        `${file} contains a non-click metadata change at index ${index}`
      )
    }
    if (!Number.isSafeInteger(current.clicks) || current.clicks < 0) {
      throw new Error(`${file} has an invalid clicks value at index ${index}`)
    }
  }
}

const stagedFile = (path) =>
  execFileSync('git', ['show', `:${path}`], { encoding: 'utf8' })

if (process.argv[1]?.endsWith('/scripts/validate-click-count-changes.js')) {
  for (const path of CLICK_COUNT_FILES) {
    const before = JSON.parse(
      execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' })
    )
    const after = JSON.parse(stagedFile(path))
    validateClickChanges(before, after, path)
  }
}
