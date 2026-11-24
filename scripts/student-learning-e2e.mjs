#!/usr/bin/env node
/** Production Nuxt -> actual API Worker -> ephemeral SQLite. No remote database or funds. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import worker from '../cloudflare/api-worker/src/index.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const entry = fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url))
assert.ok(existsSync(entry), 'Run npm build before this script')
const db = new DatabaseSync(':memory:')
db.exec('PRAGMA foreign_keys = ON')
const migrationDir = new URL('../cloudflare/api-worker/migrations/', import.meta.url)
for (const file of readdirSync(migrationDir).filter(file => file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, migrationDir), 'utf8'))
const secret = `local-e2e-${randomUUID()}`
function prepare(sql) {
  let values = []
  const statement = {
    bind(...args) { values = args; return statement },
    async first() { return db.prepare(sql).get(...values) ?? null },
    async all() { return { results: db.prepare(sql).all(...values) } },
    async run() { return { meta: db.prepare(sql).run(...values) } },
  }
  return statement
}
const DB = { prepare, async batch(statements) {
  db.exec('BEGIN')
  try {
    const results = []
    for (const statement of statements) results.push(await statement.run())
    db.exec('COMMIT')
    return results
  } catch (error) { db.exec('ROLLBACK'); throw error }
} }
const workerServer = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []
    for await (const chunk of incoming) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    const request = new Request(`http://127.0.0.1${incoming.url}`, { method: incoming.method, headers: incoming.headers, ...(body.length ? { body } : {}) })
    const response = await worker.fetch(request, { DB, API_SECRET: secret })
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) { outgoing.writeHead(500); outgoing.end(String(error)) }
})
let child
let logs = ''
let base
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}
async function stopNuxt() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const stopping = child
  const exited = once(stopping, 'exit')
  stopping.kill('SIGTERM')
  const force = setTimeout(() => stopping.kill('SIGKILL'), 5000)
  try { await exited } finally { clearTimeout(force) }
  child = undefined
}
async function startNuxt(workerUrl) {
  const reservation = createServer()
  const port = await listen(reservation)
  await new Promise(resolve => reservation.close(resolve))
  base = `http://127.0.0.1:${port}`
  // Block accidental external fetches, including a provider key embedded in a prior build.
  const guard = `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('E2E forbids external fetch: '+url.origin);return original(input,init)}`
  const guardUrl = `data:text/javascript,${encodeURIComponent(guard)}`
  const env = {
    ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port),
    NUXT_CLOUD_API_URL: workerUrl, NUXT_CLOUD_API_SECRET: secret, NUXT_AI_API_KEY: '', NUXT_AI_PROVIDER: 'disabled',
    NUXT_PUBLIC_APP_URL: base, NUXT_AGENT_WALLET_KEY: '', NUXT_LEARNPURSE_REGISTRAR_SECRET: '',
    NUXT_STELLAR_RPC_URL: workerUrl, NUXT_STELLAR_HORIZON_URL: workerUrl, NUXT_X402_FACILITATOR_URL: workerUrl,
    NODE_OPTIONS: '',
  }
  child = spawn(process.execPath, ['--import', guardUrl, entry], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', chunk => { logs += chunk })
  child.stderr.on('data', chunk => { logs += chunk })
  child.on('error', error => { logs += String(error) })
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error(`Nuxt exited during startup: ${logs}`)
    try { const response = await fetch(`${base}/api/auth/me`); if (response.status < 500) return } catch {}
    await pause(200)
  }
  throw new Error(`Nuxt startup timed out: ${logs}`)
}
async function api(path, { cookie = '', method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await response.text()
  assert.equal(response.status, status, `${method} ${path}: ${text}`)
  return { data: text ? JSON.parse(text) : null, response }
}
async function register(name) {
  const result = await api('/auth/register', { method: 'POST', body: { email: `${name}-${randomUUID()}@example.test`, password: `Test-only-${randomUUID()}`, displayName: name, role: 'student' } })
  const cookie = result.response.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie?.startsWith('learnpurse_session='), 'Real registration must issue a session cookie')
  assert.ok(result.data.user.id)
  return { user: result.data.user, cookie }
}
try {
  const workerPort = await listen(workerServer)
  const workerUrl = `http://127.0.0.1:${workerPort}`
  await startNuxt(workerUrl)
  const alice = await register('Alice')
  const bob = await register('Bob')
  console.log('PASS real production registration and session cookies')
  const now = new Date().toISOString()
  const meetingUrl = 'https://meet.example.test/private-student-e2e'
  const courseId = 'student-e2e-course'
  const draft = { title: 'SQLite learning', description: 'Learn SQLite safely', targetAudience: 'Beginners', duration: '2 hours', priceAmount: '3', capacity: '', modules: [{ title: 'Tables', description: 'Private lesson one' }, { title: 'Queries', description: 'Private lesson two' }] }
  db.prepare('INSERT INTO courses(id,creator_name,pay_to,draft,created_at) VALUES (?, ?, ?, ?, ?)').run(courseId, 'E2E Teacher', 'test-only-wallet', JSON.stringify(draft), now)
  db.prepare('INSERT INTO enrolments(course_id,student,tx_hash,network,enrolled_at,access_token,user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(courseId, 'test-only-student', 'test-only-receipt', 'stellar:testnet', now, 'private-e2e-access', alice.user.id)
  db.prepare('INSERT INTO classroom_settings(course_id,settings,updated_at) VALUES (?, ?, ?)').run(courseId, JSON.stringify({ mode: 'live', startsAt: new Date(Date.now() + 86400000).toISOString(), timezone: 'UTC', meetingUrl, instructions: 'Bring your notes' }), now)
  db.prepare('INSERT INTO classroom_messages(id,course_id,student,author,name,message,created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('e2e-teacher-reply', courseId, 'test-only-student', 'teacher', 'E2E Teacher', 'Welcome to your private class', now)
  let state = (await api('/student/learning', { cookie: alice.cookie })).data
  assert.equal(state.courses.length, 1)
  assert.equal(state.courses[0].schedule.meetingUrl, meetingUrl)
  assert.equal(state.analytics.completedModules, 0)
  assert.equal(state.analytics.totalModules, 2)
  assert.equal(state.notifications.length, 3)
  assert.equal(state.unreadCount, 3)
  assert.deepEqual(state.warnings, [])
  console.log('PASS owned class, private HTTPS meeting, teacher/schedule/enrolment notifications, zero progress')
  const completion = { courseId, moduleIndex: 0, completed: true }
  await api('/student/progress', { method: 'POST', body: completion, status: 401 })
  await api('/student/progress', { cookie: bob.cookie, method: 'POST', body: completion, status: 403 })
  await api('/student/learning', { status: 401 })
  await api('/student/chat', { status: 401 })
  await api('/student/progress', { cookie: alice.cookie, method: 'POST', body: completion })
  state = (await api('/student/learning', { cookie: alice.cookie })).data
  assert.equal(state.analytics.completedModules, 1)
  assert.equal(state.analytics.completionPercent, 50)
  assert.deepEqual(state.courses[0].completedModules, [0])
  console.log('PASS progress updates real analytics, signed-out and wrong-owner access blocked')
  const turn = { requestId: randomUUID(), message: 'Help me learn SQLite' }
  const reply = (await api('/student/chat', { cookie: alice.cookie, method: 'POST', body: turn })).data
  assert.equal(reply.saved, true)
  assert.equal(reply.via, 'fallback')
  let messages = (await api('/student/chat', { cookie: alice.cookie })).data.messages
  assert.equal(messages.length, 2)
  assert.equal(messages[0].id, `${turn.requestId}:user`)
  assert.equal(messages[1].content, reply.reply)
  const retry = (await api('/student/chat', { cookie: alice.cookie, method: 'POST', body: turn })).data
  assert.equal(retry.via, 'saved')
  assert.equal((await api('/student/chat', { cookie: alice.cookie })).data.messages.length, 2)
  assert.deepEqual((await api('/student/chat', { cookie: bob.cookie })).data.messages, [])
  const bobState = (await api('/student/learning', { cookie: bob.cookie })).data
  assert.deepEqual(bobState.courses, [])
  assert.deepEqual(bobState.notifications, [])
  assert.equal(bobState.analytics.completedModules, 0)
  console.log('PASS saved chat pair, UUID retry idempotency, and second-account isolation')
  const notificationId = state.notifications[0].id
  await api('/student/notifications/read', { cookie: bob.cookie, method: 'POST', body: { ids: [notificationId] }, status: 403 })
  await api('/student/notifications/read', { cookie: alice.cookie, method: 'POST', body: { ids: [notificationId] } })
  state = (await api('/student/learning', { cookie: alice.cookie })).data
  assert.equal(state.notifications.find(item => item.id === notificationId).read, true)
  assert.equal(state.unreadCount, 2)
  await stopNuxt()
  await startNuxt(workerUrl)
  state = (await api('/student/learning', { cookie: alice.cookie })).data
  assert.equal(state.analytics.completedModules, 1)
  assert.equal(state.courses[0].schedule.meetingUrl, meetingUrl)
  assert.equal(state.notifications.find(item => item.id === notificationId).read, true)
  assert.equal((await api('/student/chat', { cookie: alice.cookie })).data.messages.length, 2)
  console.log('PASS Nuxt process restart retains session, progress, chat, and notification read state in live Worker SQLite')
  await api('/student/chat', { cookie: alice.cookie, method: 'DELETE' })
  assert.deepEqual((await api('/student/chat', { cookie: alice.cookie })).data.messages, [])
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM student_chat_messages').get().n, 0)
  console.log('PASS chat deletion persists through actual Worker')
  console.log('Student learning E2E passed. Ephemeral SQLite only, external fetches blocked, no payments or production writes.')
} catch (error) {
  console.error(logs)
  throw error
} finally {
  await stopNuxt()
  workerServer.closeAllConnections()
  if (workerServer.listening) await new Promise(resolve => workerServer.close(resolve))
  db.close()
}
