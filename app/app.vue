<script setup lang="ts">
/**
 * App root (UI-COM-001): theme scope + mode on <html>, then the workspace shell
 * renders through the default layout. Feature modules plug in as pages.
 */
import { useTheme } from '@ds/index'

useHead({ title: 'DOF — Deals On Fire' })

const { mode } = useTheme()
useHead({ htmlAttrs: { lang: 'en', 'data-scope': 'workspace', 'data-mode': mode } })
</script>

<template>
  <NuxtLoadingIndicator color="var(--color-accent)" :height="2" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
