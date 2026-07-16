/**
 * Integration HTTP harness: mounts the REAL endpoint handlers (server/api/**) on an h3
 * app served over a real socket — the same handlers Nitro mounts in production
 * (DECISIONS D-12 is what makes this possible).
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, createRouter, toNodeListener } from 'h3'
import { getContainer } from '../../server/utils/container'
import { defineEventHandler, getCookie } from 'h3'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import workspaceGet from '../../server/api/v1/workspace.get'
import workspaceProgressGet from '../../server/api/v1/workspace/progress.get'
import onboardingGet from '../../server/api/v1/onboarding/index.get'
import onboardingPut from '../../server/api/v1/onboarding/index.put'
import onboardingComplete from '../../server/api/v1/onboarding/complete.post'
import handleAvailabilityGet from '../../server/api/v1/handles/[handle]/availability.get'
import publicStorefrontGet from '../../server/api/v1/public/stores/[handle].get'
import publicProductGet from '../../server/api/v1/public/stores/[handle]/products/[productId].get'
import dealsPost from '../../server/api/v1/deals/index.post'
import dealsGet from '../../server/api/v1/deals/index.get'
import dealEndPost from '../../server/api/v1/deals/[dealId]/end.post'
import publicDealGet from '../../server/api/v1/public/stores/[handle]/deals/[dealId].get'
import dealReactPost from '../../server/api/v1/public/deals/[dealId]/react.post'
import dealSavePost from '../../server/api/v1/public/deals/[dealId]/save.post'
import storeFollowPost from '../../server/api/v1/public/stores/[handle]/follow.post'
import dealsFeedGet from '../../server/api/v1/public/deals/index.get'
import dealEngagementGet from '../../server/api/v1/public/deals/[dealId]/engagement.get'
import sparksPost from '../../server/api/v1/sparks/index.post'
import sparksGet from '../../server/api/v1/sparks/index.get'
import sparkDeletePost from '../../server/api/v1/sparks/[sparkId]/delete.post'
import publicSparkGet from '../../server/api/v1/public/stores/[handle]/sparks/[sparkId].get'
import sparkReactPost from '../../server/api/v1/public/sparks/[sparkId]/react.post'
import sparkEngagementGet from '../../server/api/v1/public/sparks/[sparkId]/engagement.get'
import publishToStorePost from '../../server/api/v1/products/[productId]/publish-to-store.post'
import unpublishFromStorePost from '../../server/api/v1/products/[productId]/unpublish-from-store.post'
import mediaUploadPost from '../../server/api/v1/media/index.post'
import attributeSetsPost from '../../server/api/v1/attribute-sets/index.post'
import attributeSetsGet from '../../server/api/v1/attribute-sets/index.get'
import brandsPost from '../../server/api/v1/brands/index.post'
import brandsGet from '../../server/api/v1/brands/index.get'
import businessesPost from '../../server/api/v1/businesses/index.post'
import storesPost from '../../server/api/v1/businesses/[businessId]/stores.post'
import brandKitPut from '../../server/api/v1/stores/[storeId]/brand-kit.put'
import brandKitGet from '../../server/api/v1/stores/[storeId]/brand-kit.get'
import publishPost from '../../server/api/v1/stores/[storeId]/publish.post'
import productsPost from '../../server/api/v1/products/index.post'
import productsGet from '../../server/api/v1/products/index.get'
import productGet from '../../server/api/v1/products/[productId]/index.get'
import productPatch from '../../server/api/v1/products/[productId]/index.patch'
import productArchive from '../../server/api/v1/products/[productId]/archive.post'
import productRestore from '../../server/api/v1/products/[productId]/restore.post'
import variantsPost from '../../server/api/v1/products/[productId]/variants/index.post'
import variantPatch from '../../server/api/v1/products/[productId]/variants/[variantId].patch'
import mediaPost from '../../server/api/v1/products/[productId]/media/index.post'
import mediaDelete from '../../server/api/v1/products/[productId]/media/[productMediaId].delete'
import optionsPost from '../../server/api/v1/products/[productId]/options/index.post'
import optionPatch from '../../server/api/v1/products/[productId]/options/[optionName].patch'
import optionDelete from '../../server/api/v1/products/[productId]/options/[optionName].delete'
import optionValuesPost from '../../server/api/v1/products/[productId]/options/[optionName]/values/index.post'
import optionValueDelete from '../../server/api/v1/products/[productId]/options/[optionName]/values/[value].delete'
import locationsPost from '../../server/api/v1/businesses/[businessId]/locations.post'
import locationsGet from '../../server/api/v1/businesses/[businessId]/locations.get'
import locationPatch from '../../server/api/v1/locations/[locationId].patch'
import locationClose from '../../server/api/v1/locations/[locationId]/close.post'
import authRegister from '../../server/api/v1/auth/register.post'
import authLogin from '../../server/api/v1/auth/login.post'
import authLogout from '../../server/api/v1/auth/logout.post'
import authLogoutAll from '../../server/api/v1/auth/logout-all.post'
import authSession from '../../server/api/v1/auth/session.get'
import authStepUp from '../../server/api/v1/auth/step-up.post'
import authRecoveryRequest from '../../server/api/v1/auth/recovery/request.post'
import authRecoveryReset from '../../server/api/v1/auth/recovery/reset.post'
import authVerifyEmail from '../../server/api/v1/auth/verify-email.post'
import authResendVerification from '../../server/api/v1/auth/resend-verification.post'
import mediaOrderPut from '../../server/api/v1/products/[productId]/media/order.put'

export interface TestHttp {
  request(method: string, path: string, opts?: { body?: unknown; headers?: Record<string, string> }): Promise<{ status: number; body: any; headers: Headers }>
  close(): Promise<void>
}

export async function startTestApp(): Promise<TestHttp> {
  const app = createApp()
  // Test harness resolves a session cookie unconditionally (a cookie means "use it");
  // dev-header requests send no cookie and are unaffected. This exercises the real
  // SessionService.resolve spine that the production middleware runs in session mode.
  app.use(defineEventHandler(async (event) => {
    const token = getCookie(event, SESSION_COOKIE)
    if (!token) return
    const resolved = await getContainer().identity.sessions.resolve(token)
    if (resolved) {
      event.context.auth = { userId: resolved.userId, stepUpVerified: resolved.stepUpVerified }
      event.context.sessionId = resolved.sessionId
    }
  }))
  const router = createRouter()
  router.get('/api/v1/workspace', workspaceGet)
  router.get('/api/v1/workspace/progress', workspaceProgressGet)
  router.get('/api/v1/onboarding', onboardingGet)
  router.put('/api/v1/onboarding', onboardingPut)
  router.post('/api/v1/onboarding/complete', onboardingComplete)
  router.get('/api/v1/handles/:handle/availability', handleAvailabilityGet)
  router.get('/api/v1/public/stores/:handle', publicStorefrontGet)
  router.get('/api/v1/public/stores/:handle/products/:productId', publicProductGet)
  router.post('/api/v1/deals', dealsPost)
  router.get('/api/v1/deals', dealsGet)
  router.post('/api/v1/deals/:dealId/end', dealEndPost)
  router.get('/api/v1/public/stores/:handle/deals/:dealId', publicDealGet)
  router.post('/api/v1/public/deals/:dealId/react', dealReactPost)
  router.post('/api/v1/public/deals/:dealId/save', dealSavePost)
  router.post('/api/v1/public/stores/:handle/follow', storeFollowPost)
  router.get('/api/v1/public/deals', dealsFeedGet)
  router.get('/api/v1/public/deals/:dealId/engagement', dealEngagementGet)
  router.post('/api/v1/sparks', sparksPost)
  router.get('/api/v1/sparks', sparksGet)
  router.post('/api/v1/sparks/:sparkId/delete', sparkDeletePost)
  router.get('/api/v1/public/stores/:handle/sparks/:sparkId', publicSparkGet)
  router.post('/api/v1/public/sparks/:sparkId/react', sparkReactPost)
  router.get('/api/v1/public/sparks/:sparkId/engagement', sparkEngagementGet)
  router.post('/api/v1/products/:productId/publish-to-store', publishToStorePost)
  router.post('/api/v1/products/:productId/unpublish-from-store', unpublishFromStorePost)
  router.post('/api/v1/media', mediaUploadPost)
  router.post('/api/v1/attribute-sets', attributeSetsPost)
  router.get('/api/v1/attribute-sets', attributeSetsGet)
  router.post('/api/v1/brands', brandsPost)
  router.get('/api/v1/brands', brandsGet)
  router.post('/api/v1/businesses', businessesPost)
  router.post('/api/v1/businesses/:businessId/stores', storesPost)
  router.put('/api/v1/stores/:storeId/brand-kit', brandKitPut)
  router.get('/api/v1/stores/:storeId/brand-kit', brandKitGet)
  router.post('/api/v1/stores/:storeId/publish', publishPost)
  router.post('/api/v1/products', productsPost)
  router.get('/api/v1/products', productsGet)
  router.get('/api/v1/products/:productId', productGet)
  router.patch('/api/v1/products/:productId', productPatch)
  router.post('/api/v1/products/:productId/archive', productArchive)
  router.post('/api/v1/products/:productId/restore', productRestore)
  router.post('/api/v1/products/:productId/variants', variantsPost)
  router.patch('/api/v1/products/:productId/variants/:variantId', variantPatch)
  router.post('/api/v1/products/:productId/media', mediaPost)
  router.put('/api/v1/products/:productId/media/order', mediaOrderPut)
  router.delete('/api/v1/products/:productId/media/:productMediaId', mediaDelete)
  router.post('/api/v1/products/:productId/options', optionsPost)
  router.patch('/api/v1/products/:productId/options/:optionName', optionPatch)
  router.delete('/api/v1/products/:productId/options/:optionName', optionDelete)
  router.post('/api/v1/products/:productId/options/:optionName/values', optionValuesPost)
  router.delete('/api/v1/products/:productId/options/:optionName/values/:value', optionValueDelete)
  router.post('/api/v1/businesses/:businessId/locations', locationsPost)
  router.get('/api/v1/businesses/:businessId/locations', locationsGet)
  router.patch('/api/v1/locations/:locationId', locationPatch)
  router.post('/api/v1/locations/:locationId/close', locationClose)
  router.post('/api/v1/auth/register', authRegister)
  router.post('/api/v1/auth/login', authLogin)
  router.post('/api/v1/auth/logout', authLogout)
  router.post('/api/v1/auth/logout-all', authLogoutAll)
  router.get('/api/v1/auth/session', authSession)
  router.post('/api/v1/auth/step-up', authStepUp)
  router.post('/api/v1/auth/recovery/request', authRecoveryRequest)
  router.post('/api/v1/auth/recovery/reset', authRecoveryReset)
  router.post('/api/v1/auth/verify-email', authVerifyEmail)
  router.post('/api/v1/auth/resend-verification', authResendVerification)
  app.use(router)

  const server: Server = createServer(toNodeListener(app))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`

  return {
    async request(method, path, opts = {}) {
      // FormData passes through untouched (fetch sets the multipart boundary itself)
      const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData
      const response = await fetch(base + path, {
        method,
        headers: {
          ...(isForm ? {} : { 'content-type': 'application/json' }),
          ...(opts.headers ?? {}),
        },
        body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      })
      const text = await response.text()
      let body: any
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = text
      }
      return { status: response.status, body, headers: response.headers }
    },
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  }
}
