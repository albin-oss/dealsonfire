# C11 MERCHANT EXPERIENCE VALIDATION — The Payout Experience, Read as a Craftsperson

**Method:** every planned merchant-visible sentence of Slice 2, read aloud as Rosa —
someone who knits blankets, not someone who reconciles ledgers. The engineering is
not reviewed; the words and the mental model are.

---

## 1. Executive verdict

**The planned experience is right in structure and wrong in five words.** The
three-bucket money story survives a craftsperson's reading; the word "payable"
does not, the dispute set-aside was invisible (a number-surprise waiting to
happen), the below-minimum wait had no *why*, failure copy risked banking
jargon, and payout statuses leaked provider vocabulary. All five are copy-level
corrections inside already-planned surfaces — **no engineering change is
required beyond one API-shape choice inside the already-planned money block**
(exposing the set-aside separately so the card never shows a number that the
payout then contradicts).

## 2. Mental model review

The maker's natural money story has exactly three places money can be, plus one
expectation:

| Platform concept | The maker's sentence |
|---|---|
| holding (unreleased) | **"Waiting on deliveries"** — yours once things ship and the quiet week passes |
| payable, net of set-asides | **"Ready for your next payout"** |
| paid (ledger history) | **"Paid to your bank"** |
| period/schedule | **"Payouts go out about once a week"** |

This maps one-to-one onto the keystone wording the maker has seen since their
first sale ("money becomes payable when orders ship" → now "ready for your next
payout"). Nothing requires them to know that a journal, a ledger, a provider
operation, reconciliation, or settlement exists. Validated: **the mental model
holds** — three numbers, one rhythm, zero accounting.

## 3. Copy improvements (binding for Slice 2)

1. **"Payable" is banned from merchant surfaces.** It is accounting vocabulary.
   The card says "Ready for your next payout — €132.50". (Internal names keep
   `payable`; the boundary between platform vocabulary and street vocabulary is
   exactly the API response.)
2. **The dispute set-aside must be visible, or numbers will surprise.** If €26.50
   of €132.50 is netted against an open dispute, a card saying "ready: €132.50"
   followed by a €106 payout is a broken promise. The card shows the NET as the
   ready number and explains the difference in one sentence: *"€26.50 is set
   aside while a bank question about one payment is settled — it comes back to
   you when it's answered."* Same voice as the dispute letter the maker already
   received. **(The one API-shape consequence: the money block returns
   `ready` (net) and `set_aside` separately.)**
3. **The minimum needs its why.** Not "minimum payout €10" (a rule) but
   *"Small amounts wait until they reach €10, then travel together."* (a reason).
4. **Failure copy stays on the maker's side of the counter.** Never "payout
   failed" as a state label. The letter says: *"Your payout needs another try —
   the bank transfer didn't go through. Your money is safe with us and we'll
   retry on our own. If it keeps happening, your bank details at Stripe may need
   a look."* Three sentences: what happened, what's safe, what (maybe) to do.
5. **Payout status vocabulary is three phrases, ever:** "on its way to your
   bank" (created) · "arrived" (paid) · "needs another try" (failed). The words
   `pending`, `in transit`, `succeeded`, `settled` never render.

## 4. Complexity reductions

- History rows are one sentence: "€132.50 → your bank · arrived Aug 12". No
  status column, no period numbers ("this week's payout" if a label is ever
  needed).
- The paid letter carries ONE actionable fact (it's on its way; banks take a day
  or two) and no composition table — a maker who wants the detail has the card.
- When the platform fee is non-zero, the history row appends "after DOF's part"
  — one honest phrase, not a fee-breakdown table. (At launch the fee is zero and
  the phrase never renders.)
- Risk-pause on the card reuses the till-pause voice already validated in C10:
  *"Payouts are paused while we look at something together — your money stays
  yours."* No second pause vocabulary.

## 5. Merchant confusion risks (and their answers)

| Risk | Answer |
|---|---|
| Ready-number ≠ payout amount when a dispute nets | Net-as-ready + the set-aside sentence (§3.2) |
| "Why hasn't my €6 paid out?" | The minimum's *why* (§3.3) on the card, exactly where the small number shows |
| "Why is my money 'waiting on deliveries'?" | The sentence carries its own why ("once things ship and the quiet week passes") — the keystone promise the maker already knows |
| A failed payout reads as lost money | "Your money is safe with us and we'll retry on our own" — safety first, action last |
| Bank-timing questions after the paid letter | "Banks usually take a day or two" in the letter — expectation set at the moment it forms |

## 6. Final merchant journey (as validated)

Rosa ships the blanket. A week of quiet passes; the card's "Waiting on
deliveries" number slides into "Ready for your next payout". Around Tuesday, the
sweep runs; Wednesday she reads: *"€132.50 is on its way to your bank — banks
usually take a day or two. It covers your sales through Monday. Nothing to do."*
The card now says "Paid to your bank so far — €1,022.50". When a buyer's bank
once opens a dispute, €26.50 quietly steps aside with one explaining sentence
and steps back when the dispute is won — and because DOF carries good-faith
losses, losing it would cost her nothing and the card would say exactly that. If
a transfer ever bounces, she learns her money is safe before she learns anything
else. At no point does she meet a ledger, a journal, a settlement, or the word
"payable."

## 7. Recommendation

**APPROVED with the five copy corrections of §3 adopted as binding Slice 2
copy.** The planned structure already satisfied the Workshop philosophy; the
corrections close the gap between structure and voice. One API-shape note
(ready/set-aside split) rides inside already-planned work. Per the Founder's
instruction, Slice 2 begins immediately after this document lands.
