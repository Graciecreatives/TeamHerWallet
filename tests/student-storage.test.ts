import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import worker from '../cloudflare/api-worker/src/index.ts'

function setup() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const migrations = new URL('../cloudflare/api-worker/migrations/', import.meta.url)
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, migrations), 'utf8'))
  db.exec(`INSERT INTO users(id,email,password_hash,display_name,role) VALUES ('alice','a@example.test','hash','Alice','student'), ('bob','b@example.test','hash','Bob','student'), ('teacher','t@example.test','hash','Teacher','creator');
    INSERT INTO courses(id,creator_name,pay_to,draft,created_at) VALUES ('course','Teacher','wallet','{"modules":[{},{}]}','2026-11-24');
    INSERT INTO enrolments(course_id,student,tx_hash,network,enrolled_at,access_token,user_id) VALUES ('course','same-wallet','tx','TESTNET','2026-11-24','access','alice');`)
  function prepare(sql: string) {
    let values: (string | number | null)[] = []
    const statement = {
      bind(...args: (string | number | null)[]) { values = args; return statement },
      async first() { return db.prepare(sql).get(...values) ?? null },
      async all() { return { results: db.prepare(sql).all(...values) } },
      async run() { return { meta: db.prepare(sql).run(...values) } },
    }
    return statement
  }
  const binding = { prepare, async batch(statements: { run(): Promise<unknown> }[]) {
    db.exec('BEGIN')
    try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results }
    catch (error) { db.exec('ROLLBACK'); throw error }
  } }
  async function call(path: string, method = 'GET', body?: unknown, secret = 'secret') {
    return worker.fetch(new Request(`https://worker.test/students/${path}`, { method, headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { DB: binding as never, API_SECRET: 'secret' })
  }
  return { db, call }
}
const exchange = (id = crypto.randomUUID()) => ({ id, message: 'Help me learn', reply: 'Try this class', courses: [{ id: 'course', title: 'Class' }] })

test('student storage requires server secret and a real student account', async () => {
  const { db, call } = setup()
  try {
    for (const route of ['chat', 'progress', 'notification-reads']) {
      assert.equal((await call(`alice/${route}`, 'GET', undefined, 'wrong')).status, 401)
      assert.equal((await call(`teacher/${route}`)).status, 404)
      assert.equal((await call(`missing/${route}`)).status, 404)
    }
  } finally { db.close() }
})

test('chat pairs are idempotent, chronological, bounded, and account-scoped', async () => {
  const { db, call } = setup()
  try {
    const pair = exchange()
    assert.equal((await call('alice/chat', 'POST', pair)).status, 200)
    assert.equal((await call('alice/chat', 'POST', { ...pair, reply: 'changed' })).status, 200)
    let result = await (await call('alice/chat')).json()
    assert.deepEqual(result.messages.map((item: { id: string }) => item.id), [`${pair.id}:user`, `${pair.id}:assistant`])
    assert.equal(result.messages[1].content, pair.reply)
    assert.deepEqual(result.messages[1].courses, pair.courses)
    assert.equal(result.messages[0].courses, undefined)
    for (let index = 0; index < 51; index++) await call('alice/chat', 'POST', exchange())
    result = await (await call('alice/chat')).json()
    assert.equal(result.messages.length, 100)
    assert.equal(result.messages[0].role, 'user')
    assert.equal(result.messages[99].role, 'assistant')
    for (const invalid of [{ ...pair, id: 'bad' }, { ...pair, message: 'x'.repeat(2001) }, { ...pair, reply: 'x'.repeat(12001) }, { ...pair, courses: [1, 2, 3, 4, 5] }, null]) assert.equal((await call('alice/chat', 'POST', invalid)).status, 400)
    await call('bob/chat', 'POST', pair)
    await call('alice/chat', 'DELETE')
    assert.deepEqual(await (await call('alice/chat')).json(), { messages: [] })
    assert.equal((await (await call('bob/chat')).json()).messages.length, 2)
  } finally { db.close() }
})

test('chat statement rolls back the user message if assistant insert fails', async () => {
  const { db, call } = setup()
  try {
    db.exec("CREATE TRIGGER reject_assistant BEFORE INSERT ON student_chat_messages WHEN NEW.role = 'assistant' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END")
    assert.equal((await call('alice/chat', 'POST', exchange())).status, 500)
    assert.deepEqual(await (await call('alice/chat')).json(), { messages: [] })
  } finally { db.close() }
})

test('progress validates account enrolment and zero-based module indices', async () => {
  const { db, call } = setup()
  try {
    const completion = { courseId: 'course', moduleIndex: 0, completed: true }
    assert.equal((await call('bob/progress', 'POST', completion)).status, 403)
    for (const moduleIndex of [-1, 0.5, 2, '0']) assert.equal((await call('alice/progress', 'POST', { ...completion, moduleIndex })).status, 400)
    assert.equal((await call('alice/progress', 'POST', completion)).status, 200)
    await call('alice/progress', 'POST', completion)
    const { progress } = await (await call('alice/progress')).json()
    assert.equal(progress.length, 1)
    assert.equal(progress[0].moduleIndex, 0)
    assert.equal(progress[0].courseId, 'course')
    assert.ok(progress[0].completedAt)
    await call('alice/progress', 'POST', { ...completion, completed: false })
    assert.deepEqual(await (await call('alice/progress')).json(), { progress: [] })
  } finally { db.close() }
})

test('notification reads deduplicate 200 IDs, reject oversized input, and cascade', async () => {
  const { db, call } = setup()
  try {
    const ids = Array.from({ length: 200 }, (_, index) => `notice-${index}`)
    assert.equal((await call('alice/notification-reads', 'POST', { ids })).status, 200)
    await call('alice/notification-reads', 'POST', { ids: ['notice-1', 'notice-1'] })
    assert.equal((await (await call('alice/notification-reads')).json()).readIds.length, 200)
    assert.deepEqual(await (await call('bob/notification-reads')).json(), { readIds: [] })
    for (const invalid of [Array(201).fill('a'), ['x'.repeat(201)], [42], ['']]) assert.equal((await call('alice/notification-reads', 'POST', { ids: invalid })).status, 400)
    await call('alice/chat', 'POST', exchange())
    await call('alice/progress', 'POST', { courseId: 'course', moduleIndex: 1, completed: true })
    db.exec("DELETE FROM courses WHERE id = 'course'")
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM student_module_progress').get()?.n, 0)
    db.exec("DELETE FROM users WHERE id = 'alice'")
    for (const table of ['student_notification_reads', 'student_chat_messages']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0)
  } finally { db.close() }
})
