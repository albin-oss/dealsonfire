# DOF Merchant Experience — MERCHANT_SIGNATURE_MOMENTS

**Status:** For Founder approval (design only) · v1.0 · 2026-07-27
The moments a merchant will remember and retell about *building* on DOF. Same discipline as the buyer set: rare, earned by one real event, skippable, never confetti-by-default. The Moment Ledger (UX-BIBLE §14.3) is the delivery mechanism — each fires once, ever.

---

## MM-1 · Doors open (exists — Ignite → PublishedBar)
"Your store is live" with the real URL. Already the platform's best moment. One refinement under this design: the sentence names the street — "Rosa Knits is on the street. Here's your door: dof.dev/rosas-knits" — belonging from minute one.

## MM-2 · The first sale ⭐ (C5 — `orders.order.confirmed`, frozen trigger A7-9)
The strongest emotion DOF will ever deliver. Design:
- **The sentence leads with the buyer's reality, not the money:** "Someone just bought the Lavender Blanket. It's your first sale." Then, quietly: the amount, and what happens next (pack it by Thursday to keep the promise).
- **The ceremony is theirs, not ours:** no platform fireworks. One full-width moment card in the workspace, the ember motif at its calmest, dismissible forever. The craft is the star; DOF is the messenger.
- **The keepsake:** the moment is preserved (Moment Ledger) — six months later, "your first sale — March 14, the Lavender Blanket" remains visitable. Makers frame their first dollar; DOF keeps it framed.
- **Arrives only at `confirmed`** (money + stock certain, A7-8): the platform never celebrates what might still fail.

## MM-3 · The first kept promise (C6 — delivery confirmation)
"Your first promise, kept. Delivered two days early. This is the start of your record." The pivot moment where the merchant discovers the promise ledger is *theirs* — reputation as a made thing. Shown merchant-side first (confidence system: they always see their record before buyers do).

## MM-4 · The first payout (C4/C12 — `payout.completed`)
Money arriving is real-world proof the whole thing works: "€40.50 from your first sale is on its way to your bank." One sentence, exact number, no dashboard detour. (For held balances the release moment carries the same weight: "your first funds released — the blanket arrived.")

## MM-5 · The first return buyer (C5+ — second confirmed order, same buyer)
"Someone came back. Second order from the same person." No name (buyer privacy — aggregate side only shows counts; the merchant sees the order regardless). For makers this is the moment the shop becomes a *business*: repeat custom is the craftsman's true currency.

## MM-6 · The first stranger's fire (exists today, unceremonied — candidate refinement)
The first 🔥 from a visitor who doesn't follow them (a true stranger on the street). Currently invisible as a distinct fact. Cheap composition (engagement facts already exist); emotionally large: "a stranger stopped at your stall today."

## MM-7 · The hundredth order (C5+, thresholds 10/100/1000)
Quiet scale moments, always counts + span, never graphs: "One hundred orders. Ninety-six arrived on time. You've built something that keeps its word." The design law for scale ceremonies: **pride in the record, not the revenue** — revenue is private arithmetic; kept promises are identity.

## The anti-moments (banned)
Celebrating logins, celebrating spark #N (cadence is not an achievement), platform-birthday moments ("your DOFiversary!" — the relationship is theirs with their buyers, not with us), any moment triggered by a percentage or a comparison ("top 10% of shops!" is Etsy's poison, refused).
