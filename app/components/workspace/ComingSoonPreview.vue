<script setup lang="ts">
/**
 * ComingSoonPreview (Increment 06) — a clearly-labeled EXAMPLE of how each future
 * module will look with content, so a user understands the intended UX before it
 * ships. Honesty rules: everything is badged "Example", nothing is interactive,
 * and no vignette invents a capability the module's promise doesn't already state.
 * DS components only; sentences before charts (the Bible's analytics law).
 */
import { DofText, DofIcon, DofBadge, DofMoney } from '@ds/index'

defineProps<{ moduleId: string }>()
</script>

<template>
  <section aria-label="example preview" class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <DofText role="caption" tone="muted">How it will look</DofText>
      <DofBadge tone="neutral">Example</DofBadge>
    </div>

    <div class="pointer-events-none select-none rounded-large border border-dashed border-line bg-surface-raised p-4" aria-hidden="true">
      <!-- ——— Orders: a short to-do list with money attached -->
      <div v-if="moduleId === 'orders'" class="flex flex-col gap-2">
        <DofText role="caption" class="font-medium">Needs action · 2</DofText>
        <div class="flex items-center gap-3 rounded-medium border border-line bg-surface p-3">
          <span class="flex size-9 items-center justify-center rounded-full bg-accent/10 text-caption font-medium">AK</span>
          <div class="flex min-w-0 flex-1 flex-col">
            <DofText role="body" class="font-medium">Lavender Blanket · pack &amp; ship</DofText>
            <DofText role="caption" tone="muted">Ordered yesterday · promised by Friday</DofText>
          </div>
          <DofMoney :amount="4500" currency="EUR" class="font-medium" />
        </div>
        <div class="flex items-center gap-3 rounded-medium border border-line bg-surface p-3">
          <span class="flex size-9 items-center justify-center rounded-full bg-accent/10 text-caption font-medium">JM</span>
          <div class="flex min-w-0 flex-1 flex-col">
            <DofText role="body" class="font-medium">Cardamom Knots · question about pickup</DofText>
            <DofText role="caption" tone="muted">"Can I collect at 7 instead of 6?"</DofText>
          </div>
          <DofText role="caption" class="text-accent">Reply</DofText>
        </div>
        <DofText role="caption" tone="muted">Everything else is done — 14 orders fulfilled this month.</DofText>
      </div>

      <!-- ——— Customers: the people who came back -->
      <div v-else-if="moduleId === 'customers'" class="flex flex-col gap-2">
        <div v-for="c in [
          { initials: 'AK', name: 'A. from Kreuzberg', line: '4 orders · follows your store · last seen Tuesday' },
          { initials: 'SB', name: 'S. from the market stall days', line: '2 orders · saved your blanket deal' },
        ]" :key="c.initials" class="flex items-center gap-3 rounded-medium border border-line bg-surface p-3">
          <span class="flex size-9 items-center justify-center rounded-full bg-accent/10 text-caption font-medium">{{ c.initials }}</span>
          <div class="flex min-w-0 flex-col">
            <DofText role="body" class="font-medium">{{ c.name }}</DofText>
            <DofText role="caption" tone="muted">{{ c.line }}</DofText>
          </div>
        </div>
        <DofText role="caption" tone="muted">Names stay private until a customer chooses to share them.</DofText>
      </div>

      <!-- ——— Coupons: gifts with your customer's name on them -->
      <div v-else-if="moduleId === 'coupons'" class="flex flex-col gap-2">
        <div class="flex items-center justify-between rounded-medium border border-line bg-surface p-3">
          <div class="flex flex-col">
            <DofText role="body" class="font-medium">Welcome back — 10% off</DofText>
            <DofText role="caption" tone="muted">For returning followers · one tap, no codes</DofText>
          </div>
          <DofBadge tone="positive">7 redeemed</DofBadge>
        </div>
        <DofText role="caption" tone="muted">A coupon is a gift, not a scavenger hunt.</DofText>
      </div>

      <!-- ——— Inventory: counts where your products are -->
      <div v-else-if="moduleId === 'inventory'" class="flex flex-col gap-2">
        <div v-for="row in [
          { title: 'Friday Sourdough', count: '38 in stock', ok: true },
          { title: 'Cardamom Knots (box of 4)', count: '3 left — Saturday will sell out', ok: false },
        ]" :key="row.title" class="flex items-center justify-between rounded-medium border border-line bg-surface p-3">
          <DofText role="body" class="font-medium">{{ row.title }}</DofText>
          <DofText role="caption" :class="row.ok ? 'text-positive' : 'text-caution'">{{ row.count }}</DofText>
        </div>
        <DofText role="caption" tone="muted">Corrections read like one-line stories: "Gave 2 to the school bake sale."</DofText>
      </div>

      <!-- ——— Shipping: promises kept -->
      <div v-else-if="moduleId === 'shipping'" class="flex flex-col gap-2">
        <div class="flex items-center gap-3 rounded-medium border border-line bg-surface p-3">
          <DofIcon name="truck" size="md" class="text-accent" />
          <div class="flex min-w-0 flex-1 flex-col">
            <DofText role="body" class="font-medium">Lavender Blanket → Hamburg</DofText>
            <DofText role="caption" tone="muted">Label ready · promised Friday, on track</DofText>
          </div>
          <DofText role="caption" class="text-accent">Print label</DofText>
        </div>
        <DofText role="caption" tone="muted">You promise "ships in 2 days" once; DOF keeps the receipts.</DofText>
      </div>

      <!-- ——— Returns: fair decisions, evidence assembled -->
      <div v-else-if="moduleId === 'returns'" class="flex flex-col gap-2">
        <div class="flex flex-col gap-2 rounded-medium border border-line bg-surface p-3">
          <DofText role="body" class="font-medium">Wool Scarf · "arrived with a pulled thread"</DofText>
          <DofText role="caption" tone="muted">Photo attached · ordered 6 days ago · first return from this customer</DofText>
          <div class="flex gap-2">
            <DofBadge tone="positive">Refund &amp; keep</DofBadge>
            <DofBadge tone="neutral">Replace</DofBadge>
            <DofBadge tone="neutral">Ask more</DofBadge>
          </div>
        </div>
        <DofText role="caption" tone="muted">Handled generously, a return keeps the customer.</DofText>
      </div>

      <!-- ——— Marketing: reach the people rooting for you -->
      <div v-else-if="moduleId === 'marketing'" class="flex flex-col gap-2">
        <div class="flex items-center justify-between rounded-medium border border-line bg-surface p-3">
          <div class="flex flex-col">
            <DofText role="body" class="font-medium">Your audience</DofText>
            <DofText role="caption" tone="muted">23 followers · 9 kept corners · 4 new this week</DofText>
          </div>
          <DofIcon name="users" size="md" class="text-accent" />
        </div>
        <div class="rounded-medium border border-line bg-surface p-3">
          <DofText role="body" class="font-medium">Weekly note — draft</DofText>
          <DofText role="caption" tone="muted">"This week: the new mill, forty extra loaves, and Saturday knots at six."</DofText>
        </div>
        <DofText role="caption" tone="muted">Audience first, campaigns second — you write to people who chose you.</DofText>
      </div>

      <!-- ——— Analytics: sentences before charts -->
      <div v-else-if="moduleId === 'analytics'" class="flex flex-col gap-2">
        <div class="rounded-medium border border-line bg-surface p-3">
          <DofText role="body" reading>Twice your usual Tuesday — the blanket deal did that.</DofText>
        </div>
        <div class="rounded-medium border border-line bg-surface p-3">
          <DofText role="body" reading>Your story page kept people reading 40 seconds on average. Words are working.</DofText>
        </div>
        <DofText role="caption" tone="muted">One honest sentence per fact — charts only when you ask.</DofText>
      </div>

      <!-- ——— Settings: three doors, clearly split -->
      <div v-else-if="moduleId === 'settings'" class="flex flex-col gap-2">
        <div v-for="door in [
          { icon: 'store', label: 'Store', line: 'Handle, brand, hours, policies' },
          { icon: 'briefcase', label: 'Business', line: 'Legal name, tax, payouts (when Orders arrive)' },
          { icon: 'user', label: 'Account', line: 'Email, passphrase, passkeys, sessions' },
        ]" :key="door.label" class="flex items-center gap-3 rounded-medium border border-line bg-surface p-3">
          <DofIcon :name="door.icon" size="md" class="text-accent" />
          <div class="flex flex-col">
            <DofText role="body" class="font-medium">{{ door.label }}</DofText>
            <DofText role="caption" tone="muted">{{ door.line }}</DofText>
          </div>
        </div>
        <DofText role="caption" tone="muted">Nothing in here is ever required to start selling.</DofText>
      </div>

      <!-- fallback: no vignette designed yet — the promise stands alone -->
      <DofText v-else role="caption" tone="muted">Preview coming with the module.</DofText>
    </div>
  </section>
</template>
