import { getCourse, publicCourse } from '#server/utils/courses'

export default defineEventHandler(async (event) => {
  const course = await getCourse(getRouterParam(event, 'id') ?? '')
  if (!course) throw createError({ statusCode: 404, statusMessage: 'Class not found' })
  return publicCourse(course)
})
