import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { createHash } from 'node:crypto'
import { learningAnalytics } from '../shared/student-learning.ts'

const source = stripTypeScriptTypes((await readFile(new URL('../server/utils/student-learning.ts', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '')).replace(/^export /gm, '')

test('learning feed exposes meeting links and teacher replies only for account-owned classes', async () => {
  const calls: string[] = []
  const own = { id: 'mine', creatorName: 'Teacher', draft: { title: 'Yoruba', priceAmount: '2', modules: [{ title: 'Greetings' }] }, enrolments: [{ userId: 'ada', student: 'payer-ada', accessToken: 'ada-token', transaction: 'tx', enrolledAt: '2026-11-24T10:00:00Z' }] }
  const other = { ...own, id: 'other', enrolments: [{ ...own.enrolments[0], userId: 'bob' }] }
  const learning = new Function('createHash', 'listCourses', 'studentProgress', 'notificationReads', 'classSchedule', 'cloud', 'publicCourse', 'learningAnalytics', source + '\nreturn studentLearning')(
    createHash, async () => [own, other], async () => [{ courseId: 'mine', moduleIndex: 0, completedAt: '2026-11-24T11:00:00Z' }], async () => ['enrolled:tx'],
    async (id: string) => { calls.push(`schedule:${id}`); return { mode: 'live', startsAt: '2026-12-01T12:00:00Z', meetingUrl: 'https://meet.example.com/private', timezone: 'UTC', instructions: 'Bring notes' } },
    async (path: string, options: any) => { calls.push(`${path}:${options.query.student}`); return [{ id: 'message-1', author: 'teacher', message: 'Welcome Ada', created_at: '2026-11-24T12:00:00Z' }] },
    (course: any) => ({ id: course.id, title: course.draft.title, modules: course.draft.modules }), learningAnalytics,
  )
  const result = await learning('ada')
  assert.equal(result.courses.length, 1)
  assert.equal(result.courses[0].url, '/class/mine?access=ada-token')
  assert.equal(result.courses[0].schedule.meetingUrl, 'https://meet.example.com/private')
  assert.equal(result.analytics.completedModules, 1)
  assert.equal(result.analytics.completionPercent, 100)
  assert.equal(result.notifications.find((entry: any) => entry.id === 'enrolled:tx').read, true)
  assert.ok(result.notifications.some((entry: any) => entry.id === 'message:message-1'))
  assert.deepEqual(calls, ['schedule:mine', '/classrooms/mine/messages:payer-ada'])
})

const progressSource = stripTypeScriptTypes((await readFile(new URL('../server/api/student/progress.post.ts', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '')).replace('export default ', 'return ')
test('progress endpoint rejects forged ownership and invalid modules before persistence', async () => {
  let writes = 0
  const handler = new Function('defineEventHandler', 'requireStudent', 'readBody', 'getCourse', 'createError', 'withStudentLock', 'updateProgress', progressSource)(
    (fn: any) => fn, async () => ({ id: 'ada' }), async (event: any) => event,
    async (id: string) => ({ id, draft: { modules: [{}] }, enrolments: [{ userId: id === 'mine' ? 'ada' : 'bob' }] }),
    (details: any) => Object.assign(new Error(details.statusMessage), details), async (_id: string, fn: any) => fn(), async () => { writes++ },
  )
  await assert.rejects(handler({ courseId: 'other', moduleIndex: 0, completed: true }), (error: any) => error.statusCode === 403)
  for (const moduleIndex of [-1, 1, 0.5]) await assert.rejects(handler({ courseId: 'mine', moduleIndex, completed: true }), (error: any) => error.statusCode === 422)
  assert.equal(writes, 0)
  await handler({ courseId: 'mine', moduleIndex: 0, completed: true })
  assert.equal(writes, 1)
})
