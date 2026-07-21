/**
 * Dev-media route (Release 1.6) — serves sandbox uploads from .data/media so the
 * merchant journey's "add a photo → see your photo" works locally. REFUSES to run in
 * production (the Blob adapter owns production bytes; this route must never be a
 * fallback there).
 */
import { defineEventHandler, getRouterParam, setResponseHeader, setResponseStatus } from 'h3'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { getServerConfig } from '../../utils/config'

const BASE = join(process.cwd(), '.data', 'media')
const TYPES: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }

export default defineEventHandler(async (event) => {
  if (getServerConfig().isProduction) {
    setResponseStatus(event, 404)
    return 'not found'
  }
  const raw = getRouterParam(event, 'path') ?? ''
  const safe = normalize(raw).replace(/^(\.\.[/\\])+/, '')
  if (safe.includes('..')) {
    setResponseStatus(event, 400)
    return 'bad path'
  }
  try {
    const data = await readFile(join(BASE, safe))
    const ext = safe.split('.').pop() ?? ''
    setResponseHeader(event, 'Content-Type', TYPES[ext] ?? 'application/octet-stream')
    setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
    return data
  } catch {
    setResponseStatus(event, 404)
    return 'not found'
  }
})
