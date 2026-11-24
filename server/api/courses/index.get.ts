import { listCourses, publicCourse } from '#server/utils/courses'
import { currentUser } from '#server/utils/auth'
import { cloud, cloudConfigured } from '#server/utils/cloud'
import type { PublishedCourse } from '#server/utils/courses'

/**
 * Public catalogue by default (no revenue or payer details).
 * `?mine=1` is the creator dashboard: signed-in creator only, with revenue and recent payments.
 */
export default defineEventHandler(async (event) => {
  const mine = getQuery(event).mine
  if (!mine) {
    const courses = await listCourses()
    return courses.map(course => ({ ...publicCourse(course), url: `/class/${course.id}` }))
  }
  const user = await currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign in to see your classes.' })
  if (user.role !== 'creator') throw createError({ statusCode: 403, statusMessage: 'The creator dashboard is only available to creator accounts.' })
  const courses = cloudConfigured()
    ? await cloud<PublishedCourse[]>('/courses', { query: { creatorId: user.id } })
    : (await listCourses()).filter(course => (course as any).creatorId === user.id)
  return courses.map(course => ({
    ...publicCourse(course),
    url: `/class/${course.id}`,
    revenue: (Number(course.draft.priceAmount) * course.enrolments.length).toFixed(2),
    recent: course.enrolments.slice(-5).reverse().map(enrolment => ({ student: `${enrolment.student.slice(0, 4)}…${enrolment.student.slice(-4)}`, transaction: enrolment.transaction, enrolledAt: enrolment.enrolledAt })),
  }))
})
