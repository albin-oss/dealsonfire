#!/usr/bin/env node
/**
 * Token-compliance gate G-1 (DESIGN-SYSTEM-001 §2.1, §14).
 * Raw visual values may exist only in app/design-system/tokens/. Everywhere else in
 * app/ we ban:
 *   - color literals (#hex, rgb(, hsl(, oklch()
 *   - Tailwind arbitrary values carrying raw colors, px, or ms
 *   - raw z-index utilities (z-10, z-[…]) — named layers only
 *   - raw duration utilities (duration-75…) — tempo-* only
 *   - physical direction utilities (ml-/pl-/text-left…) — logical properties only (G-8, RTL law)
 * Also verifies tokens.generated.ts is in sync (DS-4).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'app')

const RULES = [
  // pure-digit short sequences (#1042) are prose (order numbers), not colors:
  // a color needs a hex letter, or 6–8 pure digits
  { name: 'hex color literal', re: /#(?:[0-9a-fA-F]*[a-fA-F][0-9a-fA-F]*|[0-9]{6,8})\b(?<!#[0-9a-fA-F]{5})(?<=#[0-9a-fA-F]{3}|#[0-9a-fA-F]{4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8})/, exts: ['.vue', '.ts', '.css'] },
  { name: 'color function literal', re: /\b(rgba?|hsla?|oklch|oklab)\(/, exts: ['.vue', '.ts', '.css'] },
  { name: 'arbitrary color/length/duration value', re: /\[(#|-?\d+(\.\d+)?(px|ms|rem)\b)/, exts: ['.vue'] },
  { name: 'raw z-index utility (use layer-*)', re: /(?<![\w-])z-(\[|\d)/, exts: ['.vue'] },
  { name: 'raw duration utility (use tempo-*)', re: /(?<![\w-])duration-(\[|\d)/, exts: ['.vue'] },
  { name: 'physical direction utility (use logical: ms-/ps-/text-start…)', re: /(?<![\w-])((m|p)(l|r)-(\[|\d|auto)|text-left\b|text-right\b|left-(\[|\d)|right-(\[|\d))/, exts: ['.vue'] },
]

const violations = []
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'tokens') continue // tokens/ is the sanctioned home
      walk(path)
    } else {
      const ext = entry.slice(entry.lastIndexOf('.'))
      const rules = RULES.filter((r) => r.exts.includes(ext))
      if (rules.length === 0) continue
      const lines = readFileSync(path, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (line.includes('token-gate-allow')) return // explicit, greppable escape hatch
        for (const rule of rules) {
          if (rule.re.test(line)) {
            violations.push(`${relative(root, path)}:${i + 1} — ${rule.name}\n    ${line.trim()}`)
          }
        }
      })
    }
  }
}
walk(appDir)

if (violations.length > 0) {
  console.error(`✗ token gate: ${violations.length} violation(s)\n`)
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
}

execFileSync('node', [join(root, 'scripts/generate-tokens.mjs'), '--check'], { stdio: 'inherit' })
console.log('✓ token gate clean (no raw visual values outside tokens/)')
