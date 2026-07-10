<script setup lang="ts">
/**
 * DofIcon — the curated, build-time-bundled icon set (DS-15: no runtime fetching).
 * Names are typed against the generated subset; decorative by default (aria-hidden)
 * unless a label makes it meaningful.
 */
import { Icon, addCollection } from '@iconify/vue'
import { computed } from 'vue'
import { ICON_COLLECTION, type IconName } from '../icons/icons.generated'
import { cx } from '../utils/cx'

let registered = false
if (!registered) {
  addCollection(ICON_COLLECTION)
  registered = true
}

const SIZE_CLASS = { sm: 'size-4', md: 'size-5', lg: 'size-6' } as const

const props = withDefaults(defineProps<{
  name: IconName
  size?: keyof typeof SIZE_CLASS
  /** Provide when the icon carries meaning on its own; otherwise it is decorative. */
  label?: string
}>(), { size: 'md' })

const iconId = computed(() => `dof:${props.name}`)
</script>

<template>
  <Icon
    :icon="iconId"
    :class="cx('inline-block shrink-0 align-middle', SIZE_CLASS[size])"
    :aria-hidden="label ? undefined : 'true'"
    :aria-label="label"
    :role="label ? 'img' : undefined"
  />
</template>
