# Enrolled classrooms

A paid class is now more than a lesson outline. Successful x402 settlement records an enrolment, and that same paid access token opens a classroom. Agent-bought classes use the access link already stored in the agent's library.

## Creator flow

In the studio, choose **Class** or **Class + PDF**, then configure **How learners attend your class**. Self-paced classes start after payment. Live classes require a start date/time, an HTTPS meeting link and joining instructions. The date picker uses the creator's device-local time and stores an unambiguous UTC timestamp. The class timezone is shown alongside the converted time.

After publishing, open **Your live classes → Classroom & learner messages**. Edit the schedule or joining instructions and save them, select an enrolled payer and answer their private messages. Paid learners appear automatically without a teacher manually adding them. The learner's preferred name can be shared in the conversation instead of exposing children's personal data on the public listing.

## Learner/parent flow

Before paying, the public page shows self-paced vs live and the live start time. After paying, the same page opens **Your classroom**, containing joining instructions, a **Join live class** link for live classes, lessons and a private teacher conversation. A parent can use the paid link on behalf of their child. Save the paid link and do not share it publicly.

## Boundaries

- `GET /api/courses/:id/schedule` returns only format, start time and timezone. No joining link or private instructions.
- `GET /api/courses/:id/classroom` requires an enrolment bearer token or the session of the exact course creator. Learners see only their own payer-address thread. Creators see their enrolled learners and threads.
- `PATCH /api/courses/:id/classroom` requires the exact creator's session.
- `POST /api/courses/:id/messages` derives student identity and author role from the verified token/session, ignoring client attempts to impersonate another learner. Teachers must choose an enrolled payer.
- Messages are plain text, capped at 2000 characters and limited to ten per thread/author per minute. This is a basic throttle, not a complete abuse prevention system.
- Class settings and messages are persisted in Cloudflare D1, migration `0006_classrooms.sql`. New course + initial settings are created in one D1 batch.

## Honest limits

Live teaching happens through the teacher's external meeting provider, not built-in video calling. Classroom messages are asynchronous, with a **Refresh classroom** button. Account-linked learners also receive teacher replies, class unlocks and current live schedules in their student notification inbox, refreshed while the dashboard is visible. There is no email or push delivery. Enrollment is attached to the paying wallet, including an agent wallet, not a separate child identity. Bearer access links can be copied, so possession grants access. No classroom moderation, recording, verified attendance tracking or automatic recurring-session calendar is implemented. Student module completion is self-reported. Teachers may describe recurring dates in the instructions and update the schedule.

## Checks

`npm run test:classroom` creates Testnet accounts, pays over x402 and checks enrollment, public/private schedule separation, unauthorized access, parent messaging, teacher replies and schedule authorization. `node scripts/classroom-browser-check.mjs` reuses scratch evidence from that run to exercise learner and teacher screens in Chromium, including mobile geometry.
