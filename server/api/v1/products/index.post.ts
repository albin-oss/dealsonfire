/** POST /api/v1/products — create product (IMP-COM-001B). */
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { createProductRequest } from '@contracts/schemas/commerce/product.schema'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { asVariantId } from '@domains/commerce/shared-kernel/ids'
import { ok, err, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.product.create',
  schema: createProductRequest,
  successStatus: 201,
  rateLimit: { limit: 60, windowSeconds: 3600 },
  async handler({ body, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const result = await getContainer().commerce.commands.createProduct({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      businessId: body.business_id,
      publishToStoreId: body.publish_to_store_id ?? null,
      title: body.title,
      description: body.description ?? null,
      fulfillmentKind: body.fulfillment_kind,
      categoryRef: body.category_path ?? null,
      options: body.options,
      variants: body.variants?.map((v) => ({
        sku: v.sku,
        optionValues: v.option_values,
        price: v.price,
        sale: v.sale ? { amount: v.sale.amount, startsAt: new Date(v.sale.starts_at), endsAt: new Date(v.sale.ends_at) } : null,
        kindData: v.kind_data ?? null,
      })),
      defaultPrice: body.default_price,
      media: body.media?.map((m) => ({
        mediaId: m.media_id,
        variantId: m.variant_id ? asVariantId(m.variant_id) : null,
        role: m.role,
        altText: m.alt_text ?? null,
      })),
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
