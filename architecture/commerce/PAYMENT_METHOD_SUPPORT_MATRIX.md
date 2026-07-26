# DOF Commerce Foundation — PAYMENT_METHOD_SUPPORT_MATRIX

**Status:** For Founder Review · v1.0 · 2026-07-26 · Launch methods only (scope law: Stripe supporting more is not a reason to launch more). All facts verified 2026-07-26; re-verify at C4 against the pinned API version.

| | Cards | Apple Pay | Google Pay | Link |
|---|---|---|---|---|
| Rails | card networks | card rails (tokenized) | card rails (tokenized) | card rails (saved) |
| Manual capture (auth + delayed capture) | ✅ | ✅ (card rails) | ✅ (card rails) | ✅ |
| Ordinary auth window (CNP) | Visa 7d CIT / 5d MIT; MC/Amex/Discover 7d | same as underlying card | same as underlying card | same as underlying card |
| Partial capture (single, remainder released) | ✅ | ✅ | ✅ | ✅ |
| Multicapture | ⚠️ IC+ only, per-card `status`, online cards only | ❌ not guaranteed (wallet) | ❌ not guaranteed (wallet) | ❌ excluded from extended-auth docs; not assumed |
| Extended authorization (30d) | ⚠️ IC+ only, per-card signaling | ⚠️ not assumed | ⚠️ not assumed | ❌ ("not available for Link payments") |
| Destination charges + application fee | ✅ | ✅ | ✅ | ✅ |
| Launch countries/currencies | EU merchants, EUR (platform region = merchant region; no `on_behalf_of` needed) | same | same | availability varies by buyer; graceful absence |
| **Option A compatibility (one full capture at confirmation)** | ✅ | ✅ | ✅ | ✅ |

## Fallback rules

- **The launch policy requires nothing beyond manual capture + one (possibly partial) capture** — every launch method supports it, so there is no per-method fallback branching in v1. This uniformity is itself the strongest argument for Option A.
- If a method ever fails manual capture at runtime (Stripe expands the wallet set, a method degrades): the Payment Element is configured to offer **only** methods supporting the selected capture policy — misconfigured methods never reach the buyer.
- Future capture-policy upgrades (per-merchant capture-on-ready, extended auth for eligible cards) must branch on the **per-charge signals** (`capture_before`, `multicapture.status`), never on assumptions — the facts register in PAYMENT_REALITY_REVIEW.md is the checklist.

## Explicitly out of launch scope

SEPA Direct Debit / iDEAL / Bancontact (no manual capture or async settlement — they break the authorize-then-capture saga shape), Klarna/Afterpay (BNPL — different capture windows and dispute economics; own review when evidence demands), PayPal (separate integration surface). Each arrives, if ever, through this same matrix + a policy row, never ad hoc.
