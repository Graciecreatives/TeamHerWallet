import { requireStudent } from '#server/utils/student-learning'
import { getCourse } from '#server/utils/courses'
import { updateProgress, withStudentLock } from '#server/utils/student-store'
export default defineEventHandler(async event => {
  const user = await requireStudent(event)
  const body = await readBody(event).catch(() => null)
  if (typeof body?.courseId !== 'string' || !Number.isInteger(body?.moduleIndex) || typeof body?.completed !== 'boolean') throw createError({ statusCode: 422, statusMessage: 'Choose a class module and its completion state.' })
  const course = await getCourse(body.courseId)
  if (!course || !course.enrolments.some(entry => entry.userId === user.id)) throw createError({ statusCode: 403, statusMessage: 'You must be enrolled in this class to update progress.' })
  if (body.moduleIndex < 0 || body.moduleIndex >= course.draft.modules.length) throw createError({ statusCode: 422, statusMessage: 'That module does not exist.' })
  await withStudentLock(user.id, () => updateProgress(user.id, course.id, body.moduleIndex, body.completed))
  return { ok: true }
})
