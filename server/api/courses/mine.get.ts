import { currentUser } from '#server/utils/auth'
import { listCourses, publicCourse } from '#server/utils/courses'

/** Student library: the classes this signed-in account has access to. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await currentUser(event)
  if (!user || user.role !== 'student') throw createError({ statusCode: 401, statusMessage: 'Sign in as a student to see your courses.' })
  const courses = (await listCourses()).filter(course => course.enrolments.some(enrolment => enrolment.userId === user.id))
    .map(course => {
      const enrolment = course.enrolments.find(entry => entry.userId === user.id)!
      return { ...publicCourse(course), url: `/class/${course.id}?access=${encodeURIComponent(enrolment.accessToken)}` }
    })
  return { courses }
})
