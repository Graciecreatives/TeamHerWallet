import { currentUser } from '#server/utils/auth'
import { listCourses, publicCourse } from '#server/utils/courses'
import { learnerOwnership } from '#server/utils/student-ownership'

/** Student library: the classes this signed-in account has access to, including ones its AI agents bought. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await currentUser(event)
  if (!user || user.role !== 'student') throw createError({ statusCode: 401, statusMessage: 'Sign in as a student to see your courses.' })
  const owns = await learnerOwnership(user.id)
  const courses = (await listCourses()).filter(course => course.enrolments.some(owns))
    .map(course => {
      const enrolment = course.enrolments.find(owns)!
      return { ...publicCourse(course), url: `/class/${course.id}?access=${encodeURIComponent(enrolment.accessToken)}` }
    })
  return { courses }
})
