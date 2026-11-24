import { getCourse } from '#server/utils/courses'
import { classSchedule } from '#server/utils/classroom'
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!await getCourse(id)) throw createError({ statusCode: 404, statusMessage: 'Class not found.' })
  const { mode, startsAt, timezone } = await classSchedule(id)
  return { mode, startsAt, timezone }
})
