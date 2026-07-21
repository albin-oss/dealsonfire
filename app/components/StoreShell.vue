<script setup lang="ts">
/**
 * StoreShell (Release 1.7) — the ONE public chrome for a merchant's pages. Storefront,
 * product, deal, and spark pages previously each hand-rolled their header/footer with
 * drifting widths (2xl vs 4xl) — the clearest "different products" signal in the app.
 * One header, one footer, one width scale, one visual language.
 */
import { computed } from 'vue'
import { DofText } from '@ds/index'

const props = withDefaults(defineProps<{
  storeName: string
  handle: string
  /** wide = storefront/product (grids); narrow = deal/spark (reading) */
  width?: 'wide' | 'narrow'
  /** true on the storefront itself: the name is the page's h1, nav anchors to the shelf */
  current?: boolean
}>(), { width: 'narrow', current: false })

const widthClass = computed(() => (props.width === 'wide' ? 'max-w-4xl' : 'max-w-2xl'))
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-surface font-ui text-foreground">
    <header class="border-b border-foreground/10">
      <div :class="widthClass" class="mx-auto flex w-full items-center justify-between gap-3 px-4 py-4">
        <DofText v-if="current" role="title" as="h1">{{ storeName }}</DofText>
        <NuxtLink v-else :to="`/s/${handle}`" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">
          <DofText role="title" as="span">{{ storeName }}</DofText>
        </NuxtLink>
        <nav aria-label="store" class="flex gap-4 text-caption text-foreground/80">
          <a v-if="current" href="#shelf" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Shop</a>
          <NuxtLink v-else :to="`/s/${handle}`" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">Shop</NuxtLink>
        </nav>
      </div>
    </header>

    <slot />

    <footer class="mt-auto border-t border-foreground/10">
      <div :class="widthClass" class="mx-auto flex w-full items-center justify-between px-4 py-4 text-caption text-foreground/60">
        <span v-if="current">{{ storeName }}</span>
        <NuxtLink v-else :to="`/s/${handle}`" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">{{ storeName }}</NuxtLink>
        <NuxtLink to="/home" class="dof-interactive rounded-small px-1 focus-visible:focus-ring">powered by DOF</NuxtLink>
      </div>
    </footer>
  </div>
</template>
