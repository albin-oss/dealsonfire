/**
 * Dev-only outbox pump: in development there is no Vercel cron, so pending events are
 * dispatched on an interval. Production relies on the cron route + opportunistic dispatch.
 */
import { defineNitroPlugin } from 'nitropack/runtime'
import { getContainer } from '../utils/container'
import { getServerConfig } from '../utils/config'

export default defineNitroPlugin(() => {
  const config = getServerConfig()
  if (config.isProduction || !config.databaseUrl) return
  const timer = setInterval(() => {
    try {
      void getContainer().dispatcher.dispatchPending().catch(() => {})
      void getContainer().commerce.dispatcher.dispatchPending().catch(() => {})
    } catch {
      // container not ready (e.g. DB down in dev) — retry next tick
    }
  }, 5000)
  timer.unref?.()
})
