<script setup lang="ts">
/**
 * KeystoneNote (UI contract R3.5) — THE one recourse sentence, versioned platform
 * copy, rendered identically at its three sites (product page, cart, checkout).
 * Stores never restyle it; increments never paraphrase it locally.
 *
 * KEYSTONE_VERSION 0 (pre-legal): mechanics-true per PAYMENT_POLICY_DECISION
 * Option A; final wording passes the legal gate at C4 before any real charge.
 */
import { DofText, DofIcon } from '@ds/index'
</script>

<template>
  <div class="flex items-start gap-2">
    <DofIcon name="shield-check" size="sm" class="mt-0.5 shrink-0 text-foreground/50" />
    <DofText role="caption" class="text-foreground/70">
      You’re charged when your order is confirmed. The maker isn’t paid until it ships —
      and if it doesn’t ship, your refund is automatic.
    </DofText>
  </div>
</template>
