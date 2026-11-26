import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { currentUser } from './auth'
import { listCourses, publicCourse } from './courses'
import { classSchedule } from './classroom'
import { cloud } from './cloud'
import { studentProgress, notificationReads } from './student-store'
import { learningAnalytics } from '#shared/student-learning'
import { learnerOwnership } from './student-ownership'

export async function requireStudent(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign in to open your learning account.' })
  if (user.role !== 'student') throw createError({ statusCode: 403, statusMessage: 'This feature is for learner accounts.' })
  return user
}
type Notification = { id: string; title: string; message: string; url: string; createdAt: string; read: boolean }
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20)

export async function studentLearning(userId: string) {
  const [all, progress, reads, owns] = await Promise.all([listCourses(), studentProgress(userId), notificationReads(userId), learnerOwnership(userId)])
  const owned = all.filter(course => course.enrolments.some(owns))
  const notifications: Notification[] = []
  const warnings: string[] = []
  const courses = await Promise.all(owned.map(async course => {
    const enrolments = course.enrolments.filter(owns)
    const enrolment = enrolments[0]!
    const url = `/class/${course.id}?access=${encodeURIComponent(enrolment.accessToken)}`
    const add = (id: string, title: string, message: string, createdAt: string) => notifications.push({ id, title, message, url, createdAt, read: reads.includes(id) })
    for (const payment of enrolments) add(`enrolled:${payment.transaction}`, 'Class unlocked', `You are enrolled in ${course.draft.title}. Your payment receipt is ready.`, payment.enrolledAt)
    let schedule = null
    try {
      schedule = await classSchedule(course.id)
      if (schedule.mode === 'live') add(`session:${course.id}:${fingerprint(schedule)}`, 'Live class schedule', `${course.draft.title} starts ${schedule.startsAt}. Check your joining link and instructions.`, enrolment.enrolledAt)
    } catch { warnings.push(`The schedule for ${course.draft.title} could not be loaded.`) }
    try {
      const threads = await Promise.all([...new Set(enrolments.map(entry => entry.student))].map(student => cloud<{ id: string; author: string; message: string; created_at: string }[]>(`/classrooms/${course.id}/messages`, { query: { student } })))
      for (const message of threads.flat().filter(entry => entry.author === 'teacher')) add(`message:${message.id}`, `Message from ${course.creatorName}`, message.message.slice(0, 240), message.created_at)
    } catch { warnings.push(`Teacher message notifications for ${course.draft.title} could not be loaded.`) }
    return { ...publicCourse(course), url, completedModules: progress.filter(entry => entry.courseId === course.id && entry.moduleIndex >= 0 && entry.moduleIndex < course.draft.modules.length).map(entry => entry.moduleIndex), schedule }
  }))
  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const visibleNotifications = [...new Map(notifications.map(entry => [entry.id, entry])).values()].slice(0, 200)
  const amounts = owned.flatMap(course => course.enrolments.filter(owns).map(() => Number(course.draft.priceAmount)))
  return { courses, analytics: learningAnalytics(courses, progress, amounts), notifications: visibleNotifications, unreadCount: visibleNotifications.filter(entry => !entry.read).length, warnings }
}
