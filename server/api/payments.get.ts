import { currentUser } from '#server/utils/auth'
import { listCourses } from '#server/utils/courses'
import { learnerOwnership } from '#server/utils/student-ownership'

/** Payment history for the signed-in student account, newest first. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await currentUser(event)
  if (!user || user.role !== 'student') throw createError({ statusCode: 401, statusMessage: 'Sign in as a student to see your payments.' })
  const [courses, owns] = await Promise.all([listCourses(), learnerOwnership(user.id)])
  const history = courses.flatMap(course => course.enrolments.filter(owns).map(enrolment => ({
    courseId: course.id,
    title: course.draft.title,
    amount: Number(course.draft.priceAmount),
    transaction: enrolment.transaction,
    enrolledAt: enrolment.enrolledAt,
  }))).sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt))
  return { history }
})
