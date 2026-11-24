# LearnPurse task backlog

Status: `[x]` implemented/checked, `[ ]` pending. Keep external integration gates distinct from local code completion.

## M0: Foundation
- [x] Nuxt/Vue/Tailwind scaffold and private runtime config.
- [x] Typecheck, build and real HTTP health/homepage smoke test.
- [x] Soroban Rust workspace, pinned SDK, WebAssembly target and local contract tests.
- [x] Free sufficient disk space for SDK/CLI and contract builds, without deleting unrelated user files. Workspace storage now has sufficient free capacity.

## M1: Creator draft (current slice)
- [x] DRAFT-01: Typed draft model and deterministic field validation.
- [x] DRAFT-02: Exact decimal-string to integer-unit conversion with boundary tests.
- [x] DRAFT-03: Editable studio with curriculum add/remove and live preview.
- [x] DRAFT-04: Explicit device-local save/restore, safe handling of malformed storage and storage failure.
- [x] DRAFT-05: Accessible labels, inline validation and honest unavailable-service states.
- [x] DRAFT-06: Unit tests, typecheck, build and production smoke verification.
- [ ] DRAFT-08: Browser acceptance: edit/save/reload, blocked-storage failure, module add/remove, keyboard focus and mobile layout. Implementation above is code-checked, not browser-accepted.

## M2: Auth and cloud drafts
- [ ] AUTH-01: Provision a PostgreSQL database and configure server-only DATABASE_URL.
- [x] DB-01: Provider-neutral PostgreSQL schema for users/sessions, profiles, courses, modules, lessons, intents, payments, registry writes, enrolments and audit events with keys/indexes.
- [x] DB-03: Lazy server connection pool, migration ledger/checksums/advisory lock, connectivity CLI and optional Docker Compose setup.
- [x] DB-04: Real PostgreSQL tests for repeat/concurrent migration runs, constraints, exact bigint values, changed migrations and atomic failure rollback.
- [x] UI-01: PrimeVue Button, InputText and Textarea integrated into the studio without changing its visual branding.
- [ ] AUTH-02: Application-owned email sign-in, hashed sessions, secure cookies, sign-out and role onboarding.
- [ ] AUTH-03: Wallet public-address validation and explicit association confirmation. Never accept user seeds.
- [ ] DB-02: Server-side ownership scoping and private-content authorization, including two-user adversarial checks.
- [ ] DRAFT-07: Authenticated course CRUD/validate routes and local-to-cloud draft migration.

Authentication checkpoint: server routes for registration, login, current-user, logout,
scrypt password hashing, hashed session cookies, opt-in synced signup, session restore, and
migrations `0003_auth_credentials.sql` and `0004_profile_focus.sql` are implemented and
typechecked. AUTH-02 remains open until private-route ownership checks are integrated.

## M3: Payment feasibility gate
- [ ] PAY-01: Select facilitator, call `/supported`, record network/scheme/asset compatibility.
- [ ] PAY-02: Prove browser wallet signing, correct recipient eligibility and Testnet USDC availability.
- [ ] PAY-03: Complete a real Testnet settlement and preserve evidence without secrets.

## M4: Registry
- [x] SC-01: Pin Soroban SDK, finalize data keys, events and payment policy limits.
- [x] SC-02: Initialize, course register/update/read and creator authorization.
- [x] SC-03: Registrar purchase record, entitlement query and uniqueness/capacity validation.
- [x] SC-04: Revocation, pause, resume and registrar rotation.
- [x] SC-05: Compile and run contract unit coverage for single payments and installment progress.
- [ ] SC-06: Compile with the installed Rust toolchain, deploy/initialize Testnet registry and record public contract metadata.

## M5: AI and publication
- [x] AI-01: Gemini adapter, deterministic fallback and structured output validation.
- [ ] AI-02: Allow-listed tools with creator scope and untrusted-content protection.
- [x] AI-03: Creator conversation UI, draft generation, edits and follow-up questions.
- [x] PUB-01: Creator review/confirmation with exact course and payment details.
- [ ] PUB-02: Creator-authorized registry registration followed by publication, with safe retry.
- [x] PUB-03: Public course detail and shareable URL, no protected lesson leakage.

## M6: Purchase and recovery
- [ ] PAY-04: Server-created purchase intent and idempotency keys.
- [x] PAY-05: Official x402 adapter and exact supported protocol headers.
- [x] PAY-06: Verify amount/asset/network/recipient/reference through the facilitator.
- [ ] PAY-07: Registrar submission and local activation only after confirmation.
- [ ] PAY-08: Durable reconciliation, safe retries and pending/support status UI.
- [ ] PAY-09: Wrong amounts, replay, timeout, duplicate callback and settlement/registry split failure tests.

## M7: Student experience and creator operations
- [x] LEARN-01: Backend token entitlement checks, paid access links and protected lesson delivery.
- [x] OPS-01: Course listings, verified enrolments and settled revenue.
- [ ] OPS-02: Payment activity filters and auditable transaction/state references.
- [ ] OPS-03: Authenticated internal reconciliation operation and structured redacted logs.

## M8: Delivery
- [ ] QA-01: PRD AC-01 to AC-09 end-to-end acceptance evidence.
- [ ] QA-02: Mobile/keyboard/contrast/error-state checks.
- [ ] QA-03: Secret scanning, authorization review and protected-content tests.
- [ ] DEPLOY-01: Node-compatible deployment, runtime secrets and health checks.
- [ ] DEMO-01: Testnet demo data, fallback recording and final architecture/limitations docs.

## First implementation checkpoint

Implemented the local-first studio, deterministic domain validation and versioned draft storage.
11 unit tests cover valid/invalid amounts, int64 price boundaries, u32 capacity limits,
module/text validation, corrupt or oversized stored data and incomplete-draft round trips.
Typecheck, production build and HTTP smoke checks cover the rendered studio, CSS and health.
No browser interaction or external-service acceptance is claimed. Next engineering slice is
PostgreSQL-backed auth/sessions and owned draft persistence, with payment feasibility run before checkout.

## PostgreSQL/component-library checkpoint

Replaced managed-provider configuration with standard DATABASE_URL and SQL migrations.
PrimeVue 4 supplies the editor's form controls and actions. Vue was deduplicated to fix
an SSR runtime conflict, and the old custom bundling workaround was removed.
14 unit tests, real disposable PostgreSQL migration/CLI/constraint tests, TypeScript checks,
production build and HTTP checks for all three PrimeVue control types pass. No persistent
production database has been provisioned and authenticated cloud drafts are still pending.

## Guided studio redesign checkpoint

- [x] UX-01: Research-led palette, typography, large controls and documented design tokens.
- [x] UX-02: Four-step creator journey with validation gating, focus and completed states.
- [x] UX-03: Explicit starter examples with confirmation before replacing entered work.
- [x] UX-04: Add/reorder/remove modules, with bounds and nonempty-removal confirmation.
- [x] UX-05: Live preview, full-preview/help dialogs and review edit shortcuts.
- [x] UX-06: Device save/restore, dirty state, unload guard and JSON export.
- [x] UX-07: Self-hosted friendly font, Lucide state transitions and reduced-motion fallback.
- [x] UX-08: Native flow/contrast checks and actual Vue/PrimeVue DOM interaction tests.
- [ ] UX-09: Real-browser responsive visual, keyboard-only and screen-reader acceptance.

The [design system](design-system.md) records research references, tokens and interaction
intent. DOM tests exercise real components, not a duplicated helper-only implementation.
They do not measure browser layout, visual quality or assistive-technology behavior.
Existing local storage remains compatible. No account sync, AI, payment, publication or
contract deployment is implied by the redesigned UI.

## Apple-style redesign checkpoint

- [x] UX-10: Clean glass design system inspired by bunaistore.shop. Inter font, pill buttons, spring motion.
- [x] UX-11: Landing page with hero, live course card, features, how it works and call to action.
- [x] UX-12: Three-step signup with Freighter connect, checksum-validated address paste, or skip.
- [x] UX-13: Minimal studio with segmented steps, floating labels, live preview and frosted sheets.
- [x] UX-14: Tests updated: profile/checksum unit tests, gradient contrast checks, full DOM flow.
- [ ] UX-15: Real-browser visual pass and a live Freighter handshake on Testnet.
- [ ] AUTH-01: Replace device-local profile with server sessions (wallet sign-in or email).

## Photographic and colorful refinement checkpoint

- [x] UX-16: Purposeful berry, blush and lilac surfaces with deep-plum text, tested text/control contrast and restrained shadows.
- [x] UX-17: Longer editorial landing with responsive local photography, three interactive course outlines, studio and wallet explanations, process, FAQ and clear availability boundaries.
- [x] UX-18: Focused three-step setup with large custom-styled fields, keyboard-operable choices, inline errors and accurate device-local privacy copy.
- [x] UX-19: Custom unsaved-change dialog with stay, discard and save-before-leaving behavior, including blocked-storage recovery.
- [x] UX-20: Chromium acceptance at 320, 390, 640, 768, 1024, 1440 and 1920 pixels plus short landscape, with layout bounds, keyboard flow, image loading and no page errors.
- [x] UX-21: Photography sources/license recorded in [photography](photography.md), responsive variants stored locally and asset-size checks included.

Verification: 33 native tests, actual Vue/PrimeVue DOM interaction checks, typecheck,
production build, HTTP smoke and eight Chromium acceptance tests pass. The earlier
checkpoint notes describe historical coverage. Current browser evidence supplements
those checks, but does not claim screen-reader, Safari, live Freighter or payment acceptance.

## Connected interface polish checkpoint

- [x] UX-22: Replace the enclosing top navbar with a simple brand/action header and a floating three-position dock with an observed current section and moving selection surface.
- [x] UX-23: Recompose the landing with larger Outfit typography, one hero paragraph, framed photography, blush/lilac color fields, restored frosted depth and an interactive studio demonstration. Remove repeated tiny marketing labels.
- [x] UX-24: Connect existing course photographs to their preview sheets and the hero panel to setup and the editor using native shared-element View Transitions. Setup progress and selections change geometrically rather than using page-load fade-up reveals.
- [x] UX-25: Verify image expansion and reversal, setup-to-editor continuity, unsupported/snapshot-failure/reduced-motion fallbacks, keyboard interactions and viewport bounds from 320 to 1920px plus short landscape.

Verification on November 22, 2026: 39 native tests, the actual Vue/PrimeVue interaction
suite, typecheck, production build, HTTP asset/health smoke and all 12 Chromium
acceptance tests pass. The motion-enabled test checks successful native snapshot
readiness and shared animation groups, not merely the destination screen. A retained
PrimeVue dialog image initially collided with its source card on close. Its shared
name is now released after the old snapshot and before the card reclaims it, and the
reverse animation passes. The dev UI remains available on port 3000.

Desktop signup, phone landing and course showcase screenshots were visually inspected.
Automated layout checks cover all seven viewport widths, while live Freighter,
Safari/iOS and screen-reader acceptance remain pending. This checkpoint does not
claim user approval or introduce authentication, payments or contract execution.

## AI agent and Stellar x402 checkpoint

- [x] AI-01/AI-03: One-message course assistant (`POST /api/agent/course`). Extracts subject, level, price, class size and length, plans lessons and returns a validated draft. Uses Gemini when `NUXT_AI_API_KEY` is set, with the creator's explicit price and size always overriding the model. A deterministic planner is the offline fallback.
- [x] PUB-01/PUB-03: Publish creates a stored class listing (`POST /api/courses`) and a shareable student page at `/class/:id`. Lesson content is withheld until payment.
- [x] PAY-05/PAY-06: `GET /api/courses/:id/access` is protected with the official `@x402/core` and `@x402/stellar` packages (exact scheme, `stellar:testnet`, USDC, `payTo` = creator wallet). No payment returns HTTP 402 with `PAYMENT-REQUIRED`. A `PAYMENT-SIGNATURE` is verified and settled through the facilitator, then the student is enrolled automatically.
- [x] PAY-03: Real Testnet settlement evidence via `node scripts/x402-testnet-e2e.mjs`: tx `82c76491484692ed2bfc1a35a58cc0251526c2dbf9074597bc9f34c2928eda1a`, creator received 1 USDC, enrolment and seat count updated.
- [x] OPS-01: Studio lists live classes with enrolments, seats and earnings, refreshed while open.
- [x] Capacity is enforced under a per-class lock before settlement, so a full class never takes payment. Returning students reopen with a bearer access token and are never charged twice.
- [ ] Browser wallet payment with Freighter `signAuthEntry` is implemented but not yet accepted with a live extension.
- [ ] Listings persist in `.data/courses` on the server file system. A PostgreSQL-backed store is still pending for multi-instance deployment.

## Current blockers

A persistent PostgreSQL deployment and external API credentials are not configured.
Payment facilitator selection and live wallet acceptance remain pending. Registry
implementation/deployment has not started. These do not block the local editor.
Profile setup is device-local, not authenticated sign-in. Publication and payments remain unavailable.
