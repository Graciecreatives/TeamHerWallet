import { classroomAccess } from '#server/utils/classroom'
import { cloud } from '#server/utils/cloud'
import { cleanSchedule } from '#shared/classroom'
export default defineEventHandler(async event => {
  const { id } = await classroomAccess(event, true)
  let schedule
  try { schedule = cleanSchedule(await readBody(event)) } catch (error) { throw createError({ statusCode: 422, statusMessage: (error as Error).message }) }
  await cloud(`/classrooms/${id}`, { method: 'PATCH', body: schedule })
  return { schedule }
})
