import { execFileSync } from 'node:child_process'

const generatedPaths = [
  'docs/blogs.md',
  'docs/recently-added.md',
  'docs/personal-writing.md',
  'docs/collections',
  'docs/country'
]

execFileSync('git', ['diff', '--exit-code', '--', ...generatedPaths], {
  stdio: 'inherit'
})
