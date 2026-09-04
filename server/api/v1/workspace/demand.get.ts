/**
 * GET /api/v1/workspace/demand?business_id= (LS-7) — the maker's demand
 * receipts. Merchant-isolated: resolveAccess gates by staff membership and
 * masks with NOT_FOUND, so one merchant can never read another's evidence.
 */
import { getQuery, setResponseHeader } from 'h3'
import { defineQueryEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import type { DemandReceipts } from '../../../utils/demand-receipts'
import { demandReceipts } from '../../../utils/demand-receipts'

const EMPTY: DemandReceipts = {
  any_attention: false, found: { people: 0, glances: 0 }, doors: [], searches: [],
  caught: null, did: { follows: 0, saves: 0, fires: 0 }, returned: 0, sentences: [],
}

export default defineQueryEndpoint<DemandReceipts>({
  async handler({ event, auth }): Promise<DemandReceipts> {
    const bid = String(getQuery(event).business_id ?? '')
    if (!bid) return EMPTY
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx) => {
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, bid)
      if (!access.ok) return EMPTY // masked: not yours → nothing, never someone else's evidence
      setResponseHeader(event, 'Cache-Control', 'private, no-store')
      return demandReceipts(tx, bid)
    })
  },
})
