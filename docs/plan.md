# LearnPurse implementation plan

Source product concept: LearnPurse. Target: Stellar Testnet only.

## Stack decision (22 November 2026)

User-directed change: use standard PostgreSQL instead of the managed database/auth stack in
the original PRD. The application connects through Postgres.js using server-only
`DATABASE_URL`, with SQL migrations and an optional Docker Compose database. Authentication
will use application-owned users and hashed sessions, with ownership checks in server
services. Do not rely on provider-specific auth schemas or database policies.
Use PrimeVue 4 for Vue form/action components, in unstyled mode with LearnPurse's existing CSS.
The original DOCX is retained unchanged as the product source, not the final stack decision.

## Delivery strategy

Build small verified slices. The first slice works without cloud credentials: an editable creator studio, validated pricing and curriculum, and explicit local draft storage. It is not AI generation or cloud persistence. Next, prove facilitator/wallet compatibility before committing to a payment SDK. Finish with the full creator-to-student flow and failure recovery.

## Milestones and acceptance gates

| Milestone | Scope | Exit gate |
| --- | --- | --- |
| M0: Foundation | Nuxt, TypeScript, Tailwind, server health, environment templates, Rust target | Production app boots and health responds. Complete. |
| M1: Creator draft | Course domain, exact token amounts, editable studio, local save/reload | Invalid data rejected, local draft survives reload, no false publish/AI claims. In progress. |
| M2: Identity and persistence | PostgreSQL migrations, application-owned email auth/sessions, creator/student profiles, wallet association, authenticated draft routes | Two accounts cannot read or change each other's private data. |
| M3: Testnet feasibility | Select facilitator, inspect `/supported`, select browser wallet, verify exact asset and recipient rules, prove settlement | Real Testnet payment with stored evidence, no real funds. Must precede checkout implementation. |
| M4: Course registry | Pin SDK/CLI to network protocol, implement auth/course/entitlement methods, tests, deploy | Negative authorization, duplication, price, capacity, pause, rotation and TTL tests pass. |
| M5: AI and publishing | Gemini/Groq adapter, validated allow-listed tools, owned drafts, explicit publish review, creator-authorized registration | Natural language to editable draft, publication only after approval and registry confirmation. |
| M6: Checkout and recovery | Persist purchase intents, exact x402 protocol, verify settlement, registrar write, reconciliation | Wrong payment rejected, duplicate callbacks harmless, settled-but-unrecorded purchase never asks buyer to pay again. |
| M7: Learning and operations | Public course pages, protected lessons, student library, creator analytics, payment filters | Entitlement required on backend, dashboard reflects verified records only. |
| M8: Demo readiness | Responsive/a11y checks, security and failure tests, deployment, receipts, demo recording | PRD AC-01 through AC-09 demonstrated with transaction references and documented limitations. |

## Architecture and invariants

- Nuxt app and server routes, PrimeVue controls, standard PostgreSQL via Postgres.js, application-owned auth/sessions, provider adapter for AI, Stellar x402 adapter, Soroban registry service.
- Full lessons, identities, conversations and operational records remain off-chain. Contract stores opaque identifiers, hashes and entitlements.
- Token values use integer base units. Stellar USDC uses seven decimal places, subject to verification against the selected asset. Never compute payment amounts using floating point.
- Client, LLM and facilitator responses are untrusted until deterministic validation matches a server-created intent.
- Creator approval is required for publishing, pricing and recipient changes. Model output cannot choose asset, network or contract IDs.
- Settlement and registry writes are separate operations. Persist each state transition and reconcile idempotently.
- No mainnet, real funds, custody, refunds, subscriptions or video hosting in MVP.

## Initial UI direction

Follow the PRD: aubergine `#281b3d`, violet `#7056c5`, lavender `#eee8fa`, warm white `#faf8fc`, ink `#30283b`, amber `#865b15`. System sans for interface text, restrained serif title for the course preview. Desktop uses a narrow creator navigation rail, editing canvas and readable course preview. Mobile stacks editor before preview. Avoid fake analytics, pretend conversations and inactive navigation. The memorable element is a live learning-product preview, not decorative dashboard cards.

## Dependencies and risks

1. System disk is nearly full. Do not install heavy SDK/CLI packages or remove unrelated user files without approval. Source work and existing web checks can continue.
2. A persistent PostgreSQL deployment and AI credentials are not configured. Keep the local studio usable and label storage accurately.
3. Facilitator, supported asset and browser wallet are not selected. Payment integration is not ready until `/supported` and an end-to-end signature/settlement proof succeed.
4. The registry contract is implemented and locally tested, but not deployed. Do not infer on-chain publication or access until the registrar adapter and Testnet deployment are configured.
5. Auth precedes exposed write APIs. Never ship anonymous global draft storage as a production shortcut.

## Verification

Every implementation slice runs unit tests, TypeScript checks, production build and HTTP smoke tests where applicable. External workflows require representative Testnet/PostgreSQL checks, not mocks presented as acceptance. Test adversarial amount input, stored draft corruption, ownership violations, duplicate payment references, capacity limits, partial settlement failures and protected-content access. Update `docs/tasks.md` with observed results and blockers at each checkpoint.
