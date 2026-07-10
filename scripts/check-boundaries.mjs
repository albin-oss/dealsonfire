#!/usr/bin/env node
/**
 * CI seam-enforcement rule (BLUEPRINT-001 §10, extended by BLUEPRINT-002 Batch 1/K1):
 *  1. Subdomains within a domain (merchant: core|catalog|storefront|trust; commerce:
 *     catalog|publishing|inventory|pricing|merchandising) may not import each other —
 *     only that domain's shared-kernel and shared/. These are service-extraction seams.
 *  2. domains/ is framework-free: no nuxt, vue, h3, nitropack, #imports, server/, app/,
 *     zod (schemas live in contracts/; validators cross via shared/).
 *  3. Domain layers (domains/x/y/domain/**) may not touch the db driver (pg) and may
 *     import from platform/ ONLY its pg-free type modules (types, events).
 *  4. platform/ is domain-agnostic: it may import shared/ and node built-ins + pg only —
 *     never domains/, server/, app/, contracts/, or frameworks.
 *  5. Cross-DOMAIN imports: a domain may import another domain's shared-kernel contracts
 *     only (ADR-003 F2/F5); importing another domain's core/application/infrastructure
 *     is a violation.
 * Fails the build on any violation.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SUBDOMAINS = {
  merchant: ['core', 'catalog', 'storefront', 'trust'],
  commerce: ['catalog', 'publishing', 'inventory', 'pricing', 'merchandising'],
}
const FRAMEWORK_FORBIDDEN = [/^nuxt/, /^vue/, /^h3$/, /^nitropack/, /^#imports/, /^#app/, /\/server\//, /^@?\/?app\//, /^zod$/]
const DOMAIN_LAYER_FORBIDDEN = [/^pg$/]
const DOMAIN_LAYER_PLATFORM_ALLOWED = /(@platform|platform)\/(types|events)$/

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, files)
    else if (/\.(ts|vue|mjs)$/.test(name)) files.push(p)
  }
  return files
}

const importRe = /(?:^|\n)\s*(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g
const violations = []

// ——— domains/
let domainFiles = []
try {
  domainFiles = walk(join(ROOT, 'domains'))
} catch {
  console.error('domains/ not found — nothing to check')
  process.exit(1)
}

for (const file of domainFiles) {
  const rel = relative(ROOT, file)
  const source = readFileSync(file, 'utf8')
  const myDomain = Object.keys(SUBDOMAINS).find((d) => rel.startsWith(`domains/${d}/`))
  const mySubdomain = myDomain
    ? SUBDOMAINS[myDomain].find((s) => rel.includes(`/${myDomain}/${s}/`))
    : undefined
  const inDomainLayer = rel.includes('/domain/')

  for (const match of source.matchAll(importRe)) {
    const spec = match[1]
    for (const bad of FRAMEWORK_FORBIDDEN) {
      if (bad.test(spec)) violations.push(`${rel}: framework/server import "${spec}"`)
    }
    if (inDomainLayer) {
      for (const bad of DOMAIN_LAYER_FORBIDDEN) {
        if (bad.test(spec)) violations.push(`${rel}: domain layer must not import the db driver ("${spec}")`)
      }
      if (/(@platform|\/platform)\//.test(spec) && !DOMAIN_LAYER_PLATFORM_ALLOWED.test(spec)) {
        violations.push(`${rel}: domain layer may import only platform/types|events ("${spec}")`)
      }
    }
    // Same-domain subdomain seams
    if (myDomain && mySubdomain) {
      for (const other of SUBDOMAINS[myDomain]) {
        if (other === mySubdomain) continue
        if (spec.includes(`${myDomain}/${other}/`)) {
          violations.push(`${rel}: cross-subdomain import into "${other}" ("${spec}")`)
        }
      }
    }
    // Cross-domain: only the other domain's shared-kernel is importable
    if (myDomain) {
      for (const otherDomain of Object.keys(SUBDOMAINS)) {
        if (otherDomain === myDomain) continue
        const marker = `${otherDomain}/`
        if (spec.includes(`domains/${marker}`) || spec.includes(`@domains/${marker}`)) {
          if (!spec.includes(`${otherDomain}/shared-kernel/`)) {
            violations.push(`${rel}: cross-domain import beyond shared-kernel ("${spec}") — ADR-003 F2/F5`)
          }
        }
      }
    }
  }
}

// ——— platform/
let platformFiles
try {
  platformFiles = walk(join(ROOT, 'platform'))
} catch {
  platformFiles = []
}
for (const file of platformFiles) {
  const rel = relative(ROOT, file)
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(importRe)) {
    const spec = match[1]
    for (const bad of FRAMEWORK_FORBIDDEN) {
      if (bad.test(spec)) violations.push(`${rel}: framework/server import "${spec}"`)
    }
    if (/domains\//.test(spec) || /^@domains/.test(spec)) {
      violations.push(`${rel}: platform/ must not import domains/ ("${spec}") — K1 direction`)
    }
    if (/contracts\//.test(spec) || /^@contracts/.test(spec)) {
      violations.push(`${rel}: platform/ must not import contracts/ ("${spec}")`)
    }
  }
}

// ——— app/design-system/ (DESIGN-SYSTEM-001 §1.2): tokens ← primitives ← patterns ← layouts.
// Strictly downward; domain-blind; no Pinia; no network; features import only the @ds index.
const DS_ROOT = join(ROOT, 'app/design-system')
const DS_LAYER_ORDER = { tokens: 0, utils: 0, icons: 0, types: 0, i18n: 0, a11y: 1, motion: 1, theme: 1, primitives: 2, patterns: 3, layouts: 4, surfaces: 4 }
let dsFiles
try {
  dsFiles = walk(DS_ROOT).filter((f) => /\.(ts|vue)$/.test(f))
} catch {
  dsFiles = []
}
function dsLayerOf(rel) {
  const first = rel.split('/')[0].replace(/\.(ts|vue)$/, '')
  return DS_LAYER_ORDER[first] ?? 0
}
for (const file of dsFiles) {
  const rel = relative(ROOT, file)
  const dsRel = relative(DS_ROOT, file)
  if (dsRel === 'index.ts') continue // the curated public API may reach every layer
  const source = readFileSync(file, 'utf8')
  const myLayer = dsLayerOf(dsRel)
  for (const match of source.matchAll(importRe)) {
    const spec = match[1]
    if (/^(pinia|@pinia)/.test(spec)) violations.push(`${rel}: design system must not use Pinia ("${spec}") — DS §1.2`)
    if (/^@nuxt\/ui/.test(spec) || spec === '#imports' || /^#app/.test(spec)) {
      violations.push(`${rel}: design system must stay Nuxt-runtime-free ("${spec}") — DS §1.2`)
    }
    if (/^(@domains|@platform|@shared)/.test(spec) || /(^|\/)domains\//.test(spec) || /(^|\/)server\//.test(spec)) {
      violations.push(`${rel}: design system is domain-blind ("${spec}") — DS §1.2`)
    }
    if (/^@contracts/.test(spec) && !/^import\s+type/.test(match[0])) {
      violations.push(`${rel}: contracts may be imported as types only ("${spec}") — DS §1.2`)
    }
    if (spec.startsWith('.') && !dsRel.endsWith('.stories.ts')) {
      // stories are gate evidence, not runtime modules — they may stage any layer
      const target = spec.replace(/^(\.\.\/)+|^\.\//, '')
      const targetLayer = dsLayerOf(target)
      if (targetLayer > myLayer) {
        violations.push(`${rel}: upward import into higher layer ("${spec}") — DS layers are strictly downward`)
      }
    }
  }
}

if (violations.length) {
  console.error('Boundary violations:')
  for (const v of violations) console.error('  ✗ ' + v)
  process.exit(1)
}
console.log(`✓ boundaries clean (${domainFiles.length} domain files, ${platformFiles.length} platform files, ${dsFiles.length} design-system files)`)
