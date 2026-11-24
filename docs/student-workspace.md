# Student workspace

Learner accounts open `/student`, not the creator studio. Signup, login, session restoration and workspace guards use the same role-based destination. Unknown roles fail closed to sign-in. `/library` remains an alias for classes.

## Pages and learning features

- `/student`: overview with actual enrolled classes, receipts and learning shortcuts.
- `/student/chat`: authenticated assistant with server-saved, account-scoped history. The latest 100 messages are restored after reload. Clearing requires confirmation and deletes chat only, not module progress. Retrying a request does not duplicate its saved message pair.
- `/student/classes`: owned enrolments with paid access links, module-completion checkboxes and private live-session links and instructions when configured by the teacher. Only HTTPS meeting links are rendered.
- `/student/analytics`: enrolled class and module totals, completion percentage, study days, recent seven-day completion activity and recorded spending. Progress is self-reported, not verified attendance or watched time.
- `/student/notifications`: an in-app inbox for class unlocks, current live schedules and teacher replies. Read status is saved per account. Visible tabs refresh learning data every 60 seconds and on returning to the tab. This is not email, push delivery or a calendar reminder service.
- `/student/payments`: account-linked payment history and Stellar Testnet receipts.
- `/student/settings`: profile details and sign-out.

The assistant uses the existing Gemini/Groq adapter and labels its keyword fallback when the provider is unavailable. It uses public catalogue data, not protected lesson content. Chatting does not spend money. Agent payments remain at `/agent` with the dedicated Testnet signing wallet and in-app approval. Agent owner links and agent-purchased enrolments are not automatically associated with student accounts, so those purchases remain in the agent library.

## Persistence and deployment

Production uses Cloudflare D1 through the authenticated API Worker. Apply `cloudflare/api-worker/migrations/0009_student_learning.sql` before deploying the updated Worker, and configure matching Worker `API_SECRET` and Nuxt cloud API secret. Existing classroom migrations must also be applied. Production does not silently fall back to local storage when the database is unavailable.

Development stores student chat, progress and read markers on disk under `.data/student-learning`, separated by account ID. This single-process development store survives app restarts. Existing account, course and payment services still require their configured backend.

## Checks

`npm test` covers account isolation, authorization, validation, atomic chat writes, retry idempotency, SQLite cascades, disk persistence and analytics. `node scripts/student-browser-check.mjs http://127.0.0.1:3001` exercises real Chromium with mocked service responses, including saved chat, completion, inbox reads, routing and responsive layout. It does not prove live Cloudflare connectivity or Testnet settlement.

`node scripts/student-learning-e2e.mjs` exercises the production Nuxt server against an isolated HTTP Worker and real local SQLite database. It requires a current `npm run build`, creates no production accounts and moves no funds.
