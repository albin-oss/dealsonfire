# Founder Observation Protocol

How to be in the room without changing what happens in it. The journey
watch-points live in [OBSERVATION_MERCHANT.md](OBSERVATION_MERCHANT.md); this
is the conduct that makes those observations trustworthy.

**The founding order:** observe before helping · questions before explanations
· behavior before opinions · verbatim before interpretation · evidence before
conclusions.

---

## 1 · Session preparation (the night before, 15 minutes)

- Re-read the journey watch-points; **write the expectation lines into the
  OBS file before the session** (the template requires it — retrofitting
  expectations to outcomes is the subtlest way to lie to yourself).
- Prepare capture: notes file open from the template, phone timestamps or a
  visible clock, screen-recording consent question ready.
- Check the merchant's device will be *theirs* — their phone, their photos,
  their network. A founder's clean laptop observes a product that doesn't exist.
- Decide the stopping time and say it in the intro. Sessions that overrun
  drift into teaching.

## 2 · Introducing the session (say approximately this, then stop)

> "Thanks for doing this. I'm going to be quiet and take notes — I'm testing
> the product, not you. Nothing you can do is wrong; the confusing parts are
> exactly what I'm here to find. Think out loud if it's natural. If you get
> stuck, do whatever you'd do if I weren't here. We'll stop after about an
> hour and I'll ask a few questions at the end. OK to start?"

Ask recording consent separately and plainly. If they decline, notes only.

## 3 · What to say — and not say — during the session

**May say** (sparingly): the neutral probes in §7, and minimal continuity
("mm-hm", "take your time").

**Never say:**
- Any interface explanation before confusion has *fully surfaced* ("that
  button there…" destroys the observation that they couldn't find it)
- Any terminology definition before they ask ("a spark is…" — their guess IS
  the data)
- Any defense of a product decision ("the reason it works that way…") — log
  the friction, thank them, move on
- Any leading construction: "Why didn't you…", "Wouldn't it be easier to…",
  "Did you see the…"
- Any promise ("we'll fix that") — it converts an observer into a vendor and
  every subsequent reaction into feedback-for-the-vendor

**Never do:** finish their task, touch their device unasked, or convert an
observation into a feature idea *out loud* — mid-session solutioning changes
what they do next.

## 4 · When to remain silent

Default state: silent. Specifically hold silence through —
- hesitation (>10s stillness — start counting, note where their eyes are)
- rereading, backtracking, wrong taps (note; do not rescue)
- their direct questions, first pass: answer with a probe from §7
  ("what would you try?"), then *stay silent through the discomfort*
- their self-criticism ("I'm being stupid") — respond once: "the product is
  being tested, not you," then silence again

## 5 · Intervention policy (exhaustive — everything else is observed first)

Intervene immediately, log the intervention itself as an event, when:

1. **Security or privacy risk** — they're about to paste a real password into
   the wrong field, share credentials, expose someone else's data.
2. **Risk of real data loss** — their actual work (photos, drafted words) is
   about to be destroyed. (Losing *DOF* state through the product's own fault
   is an S1 finding — let it happen to the test data, never to their life.)
3. **Participant asks to stop, or shows real distress.** Stop fully, no
   negotiation.
4. **Completely blocked** — after two unassisted attempts AND a §7 probe,
   the journey cannot continue. Unblock with the *minimum* words, mark the
   observation "assisted from here," and file S2 minimum.
5. **Session-breaking environment failure** (network down, deployment down)
   — fix the environment, note the timestamp gap.

An intervention is never deleted from the notes. "I helped here" is data.

## 6 · Capturing verbatim

- Quote marks mean *exact words* — including grammar, hesitation, profanity.
  Everything else is paraphrase and must not wear quote marks.
- Write the quote first, context after. Trying to capture context first loses
  the sentence.
- Timestamp every quote (`00:14 "I thought spark meant discount"`).
- Their guesses at meanings are the highest-value quotes; capture them even
  when correct.
- Same day: quotes move into `research/verbatims/VERB-Mn.md` (append-only).

## 7 · Neutral question library (the only in-session questions permitted)

- "What were you expecting?"
- "What made you pause?"
- "What would you try next?"
- "What does that word mean to you?"
- "What nearly stopped you?"
- "What do you think just happened?"
- "Where would you look for that?"
- "Talk me through what you're seeing."
- "What would you do if I weren't here?"

Banned forms: "Why didn't you…", "Did you notice…", "Wouldn't it be better
if…", "Do you like…", anything containing the product's own vocabulary before
the participant has used it first.

## 8 · Closing the session

1. "That's everything I wanted to watch. Thank you — this was genuinely
   useful." (Specific gratitude; no product apology tour.)
2. Run the day-1 interview (playbook/INTERVIEW.md) while the session is warm.
3. Ask permission to follow up on day 10.
4. **Do not** demo the "right way" to do anything they struggled with unless
   they explicitly ask — and if they ask, note that they asked.

## 9 · The write-up (same day, before anything else — memory decays by morning)

Order of operations, strictly:
1. Verbatims → `research/verbatims/VERB-Mn.md` (raw, first, before any
   interpretive sentence is written anywhere)
2. Observation file → `research/observations/OBS-…` from the template
   (facts and timestamps; the Recommendation field last)
3. Frictions → `playbook/FRICTION_LOG.md` (one entry per friction)
4. Hypotheses touched → `research/HYPOTHESES.md` evidence lines
5. The debrief → `research/templates/debrief.md` copy, filled (§10)
6. One commit, same day: the provenance chain is the git history

## 10 · Observation quality checklist (in the debrief, answered honestly)

- Did I explain anything too early? (where — timestamp)
- Did I interrupt? (count)
- Did I ask a leading question? (quote myself verbatim)
- Did I defend the product? (where)
- Did I record exact quotes? (or reconstruct from memory — say which)
- Did I separate facts from interpretation? (spot-check two entries)
- Did I promise anything? (what)

**Discard criteria** — an observation is marked `reliability: compromised`
(kept, never counted toward the Rule of Three) when any of: expectations were
written after the session · the founder taught the interface before the
journey completed · quotes were reconstructed from memory next day · the
participant was materially coached · the device/account wasn't theirs ·
the participant is a founder, friend-being-polite, or probe.

## Moderator card (print this)

```
BEFORE  expectations written · template open · their device · consent asked
DURING  silent by default · probes only (§7) · timestamp everything ·
        quotes exact · interventions: security / data loss / stop request /
        fully blocked ×2+probe / environment — nothing else
NEVER   teach · define · defend · lead · finish · promise · solution aloud
AFTER   interview → verbatims FIRST → OBS → frictions → hypotheses →
        debrief → one commit, today
```
