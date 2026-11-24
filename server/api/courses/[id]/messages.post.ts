import { classroomAccess } from '#server/utils/classroom'
import { cloud } from '#server/utils/cloud'
export default defineEventHandler(async event => {
  const access = await classroomAccess(event)
  const body = await readBody(event).catch(() => null)
  if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) throw createError({ statusCode: 422, statusMessage: 'Write a message of 1 to 2000 characters.' })
  const student = access.teacher ? String(body.student ?? '') : access.student
  if (!access.course.enrolments.some(item => item.student === student)) throw createError({ statusCode: 403, statusMessage: 'Choose an enrolled learner.' })
  const message = await cloud(`/classrooms/${access.id}/messages`, { method: 'POST', body: { student, author: access.teacher ? 'teacher' : 'student', name: access.name, message: body.message.trim() } })
  setResponseStatus(event, 201)
  return message
})
