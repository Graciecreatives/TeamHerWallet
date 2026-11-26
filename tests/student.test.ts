import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { randomUUID } from 'node:crypto'
import { learningAnalytics } from '../shared/student-learning.ts'
import { accountHome, studentSection } from '../shared/account-navigation.ts'
import { decodeProfile } from '../shared/profile.ts'

test('account destinations separate learners and creators and reject missing roles', () => {
  assert.equal(accountHome('student'), 'library')
  assert.equal(accountHome('creator'), 'studio')
  for (const role of [undefined, null, '', 'admin']) assert.equal(accountHome(role), 'login')
  assert.equal(studentSection('/student/chat'), 'chat')
  assert.equal(studentSection('/student/payments'), 'payments')
  assert.equal(studentSection('/student'), 'dashboard')
  assert.equal(studentSection('/library'), 'classes')
})

test('saved learner profile preserves role through decoding', () => {
  assert.equal(decodeProfile(JSON.stringify({ name: 'Ada', email: 'ada@example.com', focus: 'Creative skills', walletAddress: '', role: 'student' }))?.role, 'student')
})

test('student library returns only owned enrolments and private paid links', async () => {
  const source = stripTypeScriptTypes((await readFile(new URL('../server/api/courses/mine.get.ts', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '')).replace('export default ', 'return ')
  const headers: Record<string, string> = {}
  const handler = new Function('defineEventHandler', 'setResponseHeader', 'currentUser', 'createError', 'listCourses', 'publicCourse', 'learnerOwnership', source)(
    (fn: any) => fn, (_event: any, name: string, value: string) => { headers[name] = value }, async () => ({ id: 'ada', role: 'student' }),
    (details: any) => Object.assign(new Error(details.statusMessage), details),
    async () => [{ id: 'mine', enrolments: [{ userId: 'other', accessToken: 'others-token' }, { userId: 'ada', accessToken: 'my-token' }] }, { id: 'agent-bought', enrolments: [{ userId: null, student: 'ADA-AGENT-WALLET', accessToken: 'agent-token' }] }, { id: 'not-mine', enrolments: [{ userId: 'other', student: 'SOMEONE', accessToken: 'private' }] }],
    (course: any) => ({ id: course.id, title: 'Public title' }),
    async (userId: string) => (entry: any) => entry.userId === userId || entry.student === 'ADA-AGENT-WALLET',
  )
  const result = await handler({})
  assert.deepEqual(result.courses, [{ id: 'mine', title: 'Public title', url: '/class/mine?access=my-token' }, { id: 'agent-bought', title: 'Public title', url: '/class/agent-bought?access=agent-token' }])
  assert.equal(headers['Cache-Control'], 'private, no-store')
  assert.ok(!JSON.stringify(result).includes('others-token'))
})
const chatSource = stripTypeScriptTypes((await readFile(new URL('../server/api/student/chat.post.ts', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '')).replace('export default ', 'return ')
function chatHarness(role: string | null, aiFails = false) {
  let modelCalls = 0
  const saved: any[] = []
  const publicListing = { id: 'yoruba-class', title: 'Yoruba for beginners', description: 'Speak Yoruba with family.', targetAudience: 'Beginners', duration: '2 weeks', priceAmount: '2', seatsLeft: 4 }
  const handler = new Function('defineEventHandler', 'setResponseHeader', 'currentUser', 'readBody', 'createError', 'listCourses', 'publicCourse', 'askModel', 'sanitizeHistory', 'randomUUID', 'savedChat', 'saveChatTurn', 'withStudentLock', chatSource)(
    (fn: any) => fn, () => {}, async () => role ? { role } : null, async (event: any) => event,
    (details: any) => Object.assign(new Error(details.statusMessage), details), async () => [publicListing], (value: any) => value,
    async () => { modelCalls++; if (aiFails) throw new Error('offline'); return 'Let’s practise a greeting.' }, () => [],
    randomUUID, async () => saved, async (_id: string, turn: any) => { saved.push({ id: `${turn.id}:user`, role: 'user', content: turn.message }, { id: `${turn.id}:assistant`, role: 'assistant', content: turn.reply, courses: turn.courses }) }, async (_id: string, fn: any) => fn(),
  )
  return { handler, calls: () => modelCalls, saved }
}

test('learner chat requires a student session and validates messages before AI calls', async () => {
  for (const [role, status] of [[null, 401], ['creator', 403]] as const) {
    const h = chatHarness(role)
    await assert.rejects(h.handler({ message: 'Yoruba' }), (error: any) => error.statusCode === status)
    assert.equal(h.calls(), 0)
  }
  const h = chatHarness('student')
  for (const message of ['', ' '.repeat(4), 'a'.repeat(2001)]) await assert.rejects(h.handler({ message }), (error: any) => error.statusCode === 422)
  assert.equal(h.calls(), 0)
})

test('chat recommends real public classes and exposes honest offline fallback', async () => {
  for (const aiFails of [false, true]) {
    const h = chatHarness('student', aiFails)
    const response = await h.handler({ message: 'I want to learn Yoruba' })
    assert.deepEqual(response.courses, [{ id: 'yoruba-class', title: 'Yoruba for beginners', price: '2', url: '/class/yoruba-class' }])
    assert.equal(response.via, aiFails ? 'fallback' : 'ai')
    assert.ok(response.reply.length > 10)
    if (aiFails) assert.match(response.reply, /unavailable/)
  }
})

test('chat persists both sides and replaying a request does not call the model again', async () => {
  const h = chatHarness('student')
  const input = { requestId: randomUUID(), message: 'Learn Yoruba' }
  const first = await h.handler(input)
  assert.equal(first.saved, true)
  assert.equal(h.saved.length, 2)
  assert.equal(h.saved[0].content, input.message)
  const retry = await h.handler(input)
  assert.equal(retry.reply, first.reply)
  assert.equal(h.saved.length, 2)
  assert.equal(h.calls(), 1)
})

test('analytics count only enrolled valid modules and real completion dates', () => {
  const courses = [{ id: 'mine', modules: [{}, {}] }]
  const progress = [{ courseId: 'mine', moduleIndex: 0, completedAt: '2026-11-24T10:00:00Z' }, { courseId: 'other', moduleIndex: 0, completedAt: '2026-11-23T10:00:00Z' }, { courseId: 'mine', moduleIndex: 2, completedAt: '2026-11-22T10:00:00Z' }]
  const analytics = learningAnalytics(courses, progress, [2], new Date('2026-11-24T15:00:00Z'))
  assert.equal(analytics.completedModules, 1)
  assert.equal(analytics.completionPercent, 50)
  assert.equal(analytics.studyDays, 1)
  assert.deepEqual(analytics.weeklyActivity.at(-1), { date: '2026-11-24', count: 1 })
  assert.equal(learningAnalytics([], [], []).completionPercent, 0)
})
