<script setup lang="ts">
/**
 * StorefrontPreview — the Mirror's heart (UI-COM-002 §5): the merchant's idea
 * reflected back as a real storefront. A NESTED storefront theme scope re-resolves
 * the sys tokens from the identity's palette (the D-34 cascade, in production) —
 * every change lands live, smoothly, with no JS theming.
 */
import { computed } from 'vue'
import { useBrandKit, DofText, DofMoney, cx } from '@ds/index'
import type { IdentityDraft } from '../../composables/ignite/intelligence'

const props = withDefaults(defineProps<{
  identity: IdentityDraft
  /** Hero line — the merchant's idea, dignified. */
  heroLine: string
  productTitle?: string
  priceMinor?: number | null
  compactCard?: boolean
}>(), { productTitle: '', priceMinor: null, compactCard: false })

const { scopeAttrs } = useBrandKit(computed(() => ({
  accent: props.identity.palette.primary,
  accentStrong: props.identity.palette.primary,
  onAccent: props.identity.palette.surface,
  surface: props.identity.palette.surface,
  surfaceRaised: props.identity.palette.surface,
  text: props.identity.palette.text,
  textMuted: props.identity.palette.text,
})))
</script>

<template>
  <div
    v-bind="scopeAttrs"
    :class="cx('flex flex-col overflow-hidden rounded-large border border-line bg-surface font-ui shadow-raised transition-colors tempo-deliberate ease-settle')"
    role="img"
    :aria-label="`Preview of the ${identity.name} storefront`"
  >
    <div class="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-2.5">
      <span class="truncate text-emphasis font-semibold text-foreground">{{ identity.name }}</span>
      <nav aria-hidden="true" class="flex shrink-0 gap-3 text-caption text-foreground/90">
        <span>Home</span><span>Shop</span><span>About</span>
      </nav>
    </div>
    <div class="flex flex-col gap-1 px-4 py-5">
      <DofText role="title" as="p" class="text-foreground">{{ heroLine }}</DofText>
      <DofText role="caption" as="p" class="text-foreground/90">{{ identity.voice }}</DofText>
    </div>
    <div v-if="productTitle" class="px-4 pb-4">
      <div :class="cx('flex flex-col gap-1 rounded-medium bg-foreground/5 p-3', compactCard ? 'w-full' : 'w-52')">
        <div class="flex h-16 items-center justify-center rounded-small bg-accent/15 text-caption text-foreground/90" aria-hidden="true">
          your photo here
        </div>
        <span class="truncate text-body text-foreground">{{ productTitle }}</span>
        <DofMoney v-if="priceMinor !== null && priceMinor > 0" :amount="priceMinor" currency="EUR" class="text-body font-medium text-foreground" />
      </div>
    </div>
    <div class="flex items-center gap-1.5 border-t border-foreground/10 px-4 py-2">
      <span class="size-2 rounded-full bg-accent" aria-hidden="true" />
      <span class="text-caption text-foreground/90">dof.dev/{{ identity.handle }}</span>
    </div>
  </div>
</template>
