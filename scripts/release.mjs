#!/usr/bin/env node
/**
 * The release procedure, executable (LONG_TERM_MAINTAINABILITY_REVIEW MH-2).
 * Replaces the inline-Python ritual that mistagged two releases (v1.25.0: tag
 * chained after a failed merge; v1.29.0: apostrophe SyntaxError killed the PR
 * step but not the tag). The law this script encodes: THE TAG IS CREATED ONLY
 * AFTER THE MERGE IS VERIFIED, and always on the pulled merge commit.
 *
 * Usage: node scripts/release.mjs --title "..." --body-file notes.md --tag v1.35.0
 * (branch = current; base = main; requires a clean tree and a pushed-or-pushable branch)
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

const title = arg('title')
const tag = arg('tag')
const bodyFile = arg('body-file')
if (!title || !tag) {
  console.error('usage: node scripts/release.mjs --title "..." --tag vX.Y.Z [--body-file notes.md]')
  process.exit(1)
}
const branch = sh('git branch --show-current')
if (branch === 'main') { console.error('refusing: run from a feature branch'); process.exit(1) }
if (sh('git status --porcelain')) { console.error('refusing: working tree not clean'); process.exit(1) }

const body = (bodyFile ? readFileSync(bodyFile, 'utf8') : title) +
  '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'

const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n', encoding: 'utf8' })
const token = cred.split('\n').find((l) => l.startsWith('password='))?.slice(9)
const origin = sh('git config remote.origin.url')
const repo = /github\.com[:/](.+?)(?:\.git)?$/.exec(origin)?.[1]
if (!token || !repo) { console.error('refusing: no GitHub credential or origin'); process.exit(1) }

async function api(path, data, method) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method: method ?? (data ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: data ? JSON.stringify(data) : undefined,
    })
    if (res.ok) return res.json()
    // 405 = mergeability still computing; 5xx = transient — both retry
    if (res.status >= 500 || res.status === 405) {
      await new Promise((r) => setTimeout(r, 6000))
      continue
    }
    throw new Error(`${method ?? 'POST'} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  throw new Error(`${path}: retries exhausted`)
}

sh(`git push -u origin ${branch}`)
const pr = await api('/pulls', { title, head: branch, base: 'main', body })
console.log(`PR #${pr.number} ${pr.html_url}`)
await new Promise((r) => setTimeout(r, 4000))
const merge = await api(`/pulls/${pr.number}/merge`, { merge_method: 'merge', commit_title: `Merge pull request #${pr.number}: ${title}` }, 'PUT')

// ——— THE LAW: no verified merge, no tag. Ever.
if (merge?.merged !== true) {
  console.error(`merge NOT verified (${JSON.stringify(merge).slice(0, 200)}) — NOT tagging. Resolve on GitHub, then tag manually on the merge commit.`)
  process.exit(1)
}
sh('git switch main && git pull')
sh(`git tag ${tag} && git push origin ${tag}`)
console.log(`merged ✓  tagged ${tag} on ${sh('git rev-parse --short HEAD')} ✓`)
