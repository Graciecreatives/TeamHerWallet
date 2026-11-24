import { requireStudent, studentLearning } from '#server/utils/student-learning'
import { markNotificationReads, withStudentLock } from '#server/utils/student-store'
export default defineEventHandler(async event => {
  const user = await requireStudent(event)
  const body = await readBody(event).catch(() => null)
  if (!Array.isArray(body?.ids) || body.ids.length > 200 || body.ids.some((id: unknown) => typeof id !== 'string' || id.length > 200)) throw createError({ statusCode: 422, statusMessage: 'Choose up to 200 notifications to mark as read.' })
  const state = await studentLearning(user.id)
  const allowed = new Set(state.notifications.map(entry => entry.id))
  if (body.ids.some((id: string) => !allowed.has(id))) throw createError({ statusCode: 403, statusMessage: 'That notification is not in your account.' })
  await withStudentLock(user.id, () => markNotificationReads(user.id, body.ids))
  return { ok: true }
})
