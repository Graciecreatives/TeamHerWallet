# Project limitations

Working notes from the audit of the LearnPulse project. Ranked by risk/impact.

## Architectural / Deployment

1. **The Nuxt server is the payment brain.** x402 verification and settlement run from `server/api/courses/[id]/access.get.ts` via `server/utils/x402.ts` (facilitator-mediated, server-side). Hosting it behind a firewall or on Cloudflare Workers breaks payments — the architecture is Node-only today.
2. **Single external trust dependency** — the public facilitator `https://www.x402.org/facilitator` has no failover.

## Security / Trust

3. **Two custody models coexist**: agent wallets are encrypted with `NUXT_AGENT_WALLET_KEY`; student "wallets" are bearer tokens in `enrolments.access_token` (exposed in the x402 PAYMENT-RESPONSE header).
4. **Agent approvals are in-app**: new agents use a dedicated server-signing Testnet wallet, with encrypted agent and approval co-signing keys. The owner link authorizes approval, and the server co-signs above-threshold purse releases. No Freighter popup is required. This is server-managed signing, not independent hardware-wallet authorization. Older address-only agents must be recreated and are blocked from payment. Personal wallet keys are not accepted at setup.

## Operational

5. **State divergence**: purchase can fail after `releaseFromPurse` succeeds — released USDC sits in the agent wallet with no retry or audit of the failure.
6. **TOCTOU on enrolment seats** — seat check and insert are in one statement in the D1 worker, so single-seat races are mostly handled; the guard exists.

## Data / Migration

7. **`learning_agents.secret_enc TEXT NOT NULL`** vs. the user-wallet model ("no secret") — handled with `''` sentinel; schema could allow NULL for cleanliness.

## Functional gaps

8. **Student library is wired** (`/api/courses/mine`, `/api/payments`, `StudentLibraryView.vue` at `/library`, "My classes" link in ClassView) — see also `enrolments.user_id` (migration `0008_student_library.sql`).
9. Installments half-implemented (policy + logic exist; no studio UI yet).
