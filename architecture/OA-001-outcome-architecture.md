# OA-001 — DOF Outcome Architecture

**Status:** Permanent strategic handbook. Ensures every engineering decision is traceable to measurable customer and business value.
**Bindings (immutable):** Platform Bible, Engineering Constitution, BCA-001 (capabilities C1–C17), VSA-001 (value streams VS1–VS12), PDS-001 (differentiation), DPS-001, approved ADRs. Introduces **no new capability** and duplicates no strategy doc; it makes them *measurable*.
**Operating rule:** every sprint begins with an outcome (§1) and ends with a demonstrated change in its metric (§7).

---

## 1. Strategic Outcomes (example list challenged → 12)

The example list mixes outcomes with metrics ("increase repeat purchases" is a metric of "shopper habit"). Reframed as **12 durable outcomes**, each owning its metrics and traced to VSA-001 streams / BCA-001 capabilities.

| # | Outcome | Why it matters | Success metric | Leading indicator | Lagging indicator | Streams | Capabilities |
|---|---|---|---|---|---|---|---|
| O1 | **Frictionless launch** | Five-Minute Business is the promise | Median time idea→published store | Ignite step completion | activated-merchant rate | VS2 | C2, C13, C3 |
| O2 | **First sale sooner** | Revenue is the real activation | Median days signup→first sale | first product added, first listing live | 30-day activation | VS3 | C3, C4, C5 |
| O3 | **Merchant retention** | LTV and network supply side | 6-/12-month merchant retention | weekly active selling | churned-merchant rate | VS4, VS6 | C2, C14 |
| O4 | **Merchant growth** | Thriving, not just surviving | median merchant revenue growth | opportunity-accept rate | merchants crossing scale tiers | VS4 | C14, C13, C3 |
| O5 | **Shopper habit** | Return without buying → durable demand | weekly returning shoppers | follows, Sparks opens | repeat-purchase rate | VS5, VS7, VS9 | C8, C10, C3 |
| O6 | **Purchase confidence** | Trust converts and retains | checkout conversion; guest→account | cart→checkout rate | post-purchase trust score | VS8 | C4, C5, C1 |
| O7 | **Trust perception** | A marketplace is its trust | verified-seller %, trust NPS | verification completion | dispute/scam rate | VS11 | C15, C2 |
| O8 | **Creator monetization** | Owns the creator segment (PDS-001) | creators earning recurring revenue | first subscriber, audience growth | creator 12-mo retention | VS5, VS3 | C8, C3, C5 |
| O9 | **Deal value** | The namesake loop | GMV via honest deals | deal views→redemptions | deal repeat rate | VS9 | C3(Offers), C10 |
| O10 | **Issue resolution** | Trust is kept at failure | median resolution time | refund latency | retention-after-issue | VS10 | C4, C5, C15 |
| O11 | **AI adoption with control** | The co-pilot advantage | % actions AI-proposed & human-accepted | proposal impressions | AI-assisted revenue | all | C13 |
| O12 | **Operational efficiency** | Scale without support collapse | support contacts per 100 orders | self-serve resolution | cost-to-serve | VS6, VS10 | C7, C11, C13 |

**Design note:** every outcome pairs a *leading* (movable this sprint) with a *lagging* (proves durability) indicator — so teams can act early and verify late.

---

## 2. North Star Metrics (and why they resist gaming)

| Audience | North Star | Why it is hard to game |
|---|---|---|
| **Company** | **Realized Merchant Earnings** — money that actually reached merchants (settled GMV net of refunds/chargebacks) | Requires real buyers paying real money that clears — vanity signups, views, and GMV-before-refunds can't inflate it |
| **Merchant** | **Merchants reaching a meaningful earnings milestone** (e.g., sustained monthly revenue) | Counts *success*, not activity; can't be gamed by feature usage or logins |
| **Shopper** | **Weekly returning shoppers who transact within N days** | Couples habit (return) with intent (transact) — pure traffic or engagement won't move it |
| **Creator** | **Creators earning recurring revenue** | Requires a paying audience over time — a follower count or a viral post alone fails it |
| **Community** | **Conversations that resolve into a purchase** (Spark→sale) | Ties social to commerce value — engagement-farming produces no purchases, so it doesn't count |
| **Trust** | **Verified, good-standing merchants as a share of GMV** | Weights trust by real economic activity — you can't inflate it with dormant verified accounts |

**Anti-gaming principle:** every North Star is anchored to **real money movement or repeated real behavior over time**. Proxy metrics (signups, pageviews, GMV-before-refunds, raw engagement) are explicitly *not* North Stars — they are leading indicators at most.

---

## 3. KPI Hierarchy (code → business value traceability)

```
Strategic Outcome        O2 First sale sooner
      ↓
Business KPI             median days signup→first sale
      ↓
Capability KPI           C4 Orders: checkout completion %; C3: listing-live rate
      ↓
Operational Metric       cart→order conversion; reservation success rate
      ↓
Engineering Metric       checkout p95 latency; oversell errors=0; price-reverify pass %
```

**Traceability contract:** every engineering metric rolls up to exactly one capability KPI, which rolls up to a business KPI, which serves ≥1 strategic outcome. A metric with no upward link is noise and is not tracked; an outcome with no downward engineering metric is unfalsifiable and is rejected. This is what makes "every sprint ends with measurable improvement" enforceable — the chain exists before the work starts.

---

## 4. Outcome-to-Capability Matrix

●●● primary owner · ● secondary influence · ⚠ conflict to manage.

| Capability | Primary outcomes | Secondary | Conflicts to manage |
|---|---|---|---|
| C1 Identity | O6 | O2, O7 | friction (O6) vs security (O7) — resolve via progressive/step-up, never a wall |
| C2 Merchant | O1, O3 | O4, O7 | — |
| C3 Commerce | O2, O9 | O4, O5, O6 | deal depth (O9) vs merchant margin (O4) — honest-deal guardrail |
| C4 Orders | O2, O6, O10 | O12 | conversion speed (O6) vs fraud checks (O7) |
| C5 Payments | O6 | O2, O8, O10 | approval rate (O6) vs fraud loss (O7) |
| C7 Operations | O12 | O3, O6 | — |
| C8 Community | O5, O8 | O7 | engagement vs Calm (PDS-001) — rank for usefulness, not time-on-site |
| C10 Discovery | O5, O9 | O2, O7 | relevance vs merchant fairness (paid vs organic) |
| C13 AI | O11 | O1, O4, O12 | automation (O11) vs human control (O7) — advisory-only invariant |
| C14 Analytics | O4 | O3, O12 | insight volume vs Calm — one sentence, not dashboards |
| C15 Trust & Safety | O7, O10 | O6 | enforcement strictness vs merchant friction — proportionality |

**Master conflict:** **growth/conversion vs. trust/calm.** The constitution resolves it in trust's favor — a first-success or trust moment (VSA-001 §4) outranks a conversion optimization. OA-001 encodes that as a scoring penalty (§6, Trust impact).

---

## 5. Sprint Planning Framework (mandatory template)

Every engineering effort opens with this filled in; it is rejected if any field is blank:

```
SPRINT OUTCOME BRIEF
1. Desired business outcome     — which O# from §1 (or an amendment)
2. Success metric(s)            — the specific KPI + current baseline + target delta
3. Capabilities involved        — BCA-001 IDs (owner + supporting)
4. Value streams affected       — VSA-001 VS#; which critical moment (§4) it touches
5. Risks                        — trust/regression risk, esp. first-success & money paths
6. Experiments                  — what we'll measure to learn (A/B, funnel, guardrail metrics)
7. Acceptance criteria          — outcome metric moved AND guardrails held AND tests/gates green
```

**Definition of done (outcome-level):** the target metric moved in the intended direction, no guardrail metric (trust, oversell=0, price-correctness, a11y) regressed, and the engineering→business trace (§3) is wired so the movement is *attributable*.

---

## 6. Decision Framework (prioritization scoring)

Score each initiative 1–5 per factor; weighted sum ranks the backlog. Weights encode DOF's strategy (differentiation + trust + network compounding over raw effort).

| Factor | Weight | Notes |
|---|---|---|
| User value | ×3 | does it hand a real opportunity? (PDS-001 gate 1) |
| Strategic differentiation | ×3 | deepens a PDS-001 pillar? copyable? |
| Network-effect contribution | ×3 | compounds a §8 loop, or just adds? |
| Revenue impact | ×2 | to Realized Merchant Earnings (North Star) |
| Trust impact | ×2 | **can be negative** — a trust regression subtracts |
| AI leverage | ×1 | advisory, human-controlled uplift |
| — Engineering effort | ÷ (cost) | divisor: score ÷ effort = leverage |
| — Risk | penalty | money/trust-path risk applies a multiplier <1 |

**Score = (3·UserValue + 3·Differentiation + 3·Network + 2·Revenue + 2·Trust + 1·AI) ÷ Effort × RiskFactor.**
**Hard gates (before scoring):** an initiative that fails any PDS-001 §9 principle, or would regress a first-success/trust moment, is not scored — it is redesigned or rejected. Scoring ranks only constitutionally-valid work.

---

## 7. Governance

1. **No feature is approved without an associated outcome** (§1) and a filled Sprint Outcome Brief (§5).
2. **Every outcome has a single accountable owner** (a capability lead per BCA-001).
3. **Every KPI has one source of truth** — a named event/read-model (VSA-001 event trail); no metric computed two ways.
4. **Every capability reports measurable value** each cycle against its capability KPIs (§3).
5. **Every major release demonstrates outcome improvement** — a movement on ≥1 strategic outcome with no guardrail regression, or it does not ship as "major."
6. **North Stars are not gamed by construction** (§2) — proxy metrics may never be reported *as* North Stars.
7. **Trust and money outcomes have veto power** — a positive score cannot override a trust/oversell/price-correctness regression (the §4 master conflict, resolved for trust).
8. **Amending an outcome or North Star is an OA-001 change** with rationale — the metric set is stable so teams can trust it across quarters.

---

## Definition of authority
OA-001 governs *measurement and execution discipline*: what success is, how it traces to code, and how work is prioritized. It sits beneath PDS-001 (why), BCA-001 (what capabilities), and VSA-001 (how value flows), and above sprint execution. It defines no capability and no feature — it ensures every capability and feature *proves* its value. A new strategic outcome or North Star, or a change to the decision weights, is an OA-001 amendment.
