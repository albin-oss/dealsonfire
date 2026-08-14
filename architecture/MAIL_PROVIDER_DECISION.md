# MAIL PROVIDER DECISION — C12-1

**Status:** DECIDED (Founder-delegated, 2026-08-11) · reversible behind `MailPort`
**Provider selected: Resend** (transactional email API, api.resend.com)

## Why

Chosen against the delegated requirements as the **simplest provider that satisfies all of them**:

| Requirement | Resend |
|---|---|
| Transactional deliverability | Transactional-first product; per-domain reputation; no shared marketing pool |
| GDPR / EU posture | DPA available (self-serve); GDPR-documented processing; EU region option for data residency |
| DPA | Standard DPA, no enterprise contract required |
| Signed bounce/complaint webhooks | Svix envelope — HMAC-SHA256 signatures, timestamped, replay-window verifiable (implemented in `server/api/webhooks/mail.post.ts` with no SDK) |
| Clean HTTP API | One `POST /emails` with JSON — the whole adapter is ~50 lines, no SDK dependency |
| Domain authentication | SPF + DKIM records per sending domain; DMARC-alignment compatible |
| **Provider-side idempotency** | **Native `Idempotency-Key` header** — the one requirement most alternatives fail; it makes the §7 crash-window semantics exact rather than approximate |
| Sandbox/test mode | Test API keys + `delivered@resend.dev` / `bounced@resend.dev` test addresses that exercise the real pipeline incl. bounce webhooks |
| Launch-scale pricing | Free tier 3,000 letters/month, 100/day — comfortably above expected launch volume; first paid tier $20/mo at 50k |
| Suppression/export portability | Suppression and audiences readable via API; bounce facts are OURS (`mail_bounces`) regardless — the exit path never depends on the provider's copy |
| No marketing-platform dependency | Transactional API is the core product; no forced contact-list/campaign coupling |

## Alternatives considered (not a vendor study — the shortlist and the disqualifier)

- **Postmark** — best-in-class transactional deliverability reputation, but webhooks authenticate by basic-auth/IP allowlist rather than cryptographic signatures, and there is no native send idempotency key. Two binding requirements missed.
- **Mailgun (EU region)** — EU residency and HMAC-signed webhooks, but no native idempotency key and a heavier, older API surface. Strong second choice if Resend disappoints.
- **AWS SES** — cheapest at scale, but outcome intake requires SNS assembly, no idempotency key, and the most integration surface — optimizing for a scale DOF does not have.
- **SendGrid / Brevo** — marketing-platform gravity; disqualified on the no-forced-marketing-dependency requirement.

## Cost at expected launch scale

Founding-cohort volume (≪3,000 letters/month): **€0**. The paid threshold sits far beyond the Living Street's launch.

## Data-processing posture

Processor under a standard DPA; recipient addresses and letter content transit the provider. DOF keeps letter content **plaintext-only** (no tracking pixels, no open/click tracking — calm-commerce posture in email, and less data shared). Bounce facts persist in DOF's own `mail_bounces` (manifest-declared, 12-month retention); the provider's copy is convenience, not authority.

## Webhook / security capabilities

Svix-signed events (`svix-id`/`svix-timestamp`/`svix-signature`), verified constant-time with a ±5-minute replay window and provider-event-id dedup; secret via `NUXT_MAIL_WEBHOOK_SECRET`, key via `NUXT_RESEND_API_KEY` — environment only, never logged, rotatable independently.

## Portability / exit path

The adapter is one class behind `MailPort` (`platform/mail.ts`); the webhook is one route; bounce truth is DOF-owned. Moving providers = new adapter + new webhook parser + DNS re-authentication. No template, list, or suppression state lives with the provider. **A material change of legal/commercial posture (e.g., an enterprise contract) returns to the Founder per the delegation.**
