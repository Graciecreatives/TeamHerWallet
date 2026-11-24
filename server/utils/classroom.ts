import type { H3Event } from 'h3'
import { currentUser } from './auth'
import { getCourse, findEnrolment } from './courses'
import { cloud } from './cloud'
import { emptySchedule, type ClassSchedule } from '#shared/classroom'

export async function classroomAccess(event: H3Event, teacherOnly = false) {
  const id = getRouterParam(event, 'id') ?? ''
  const course = await getCourse(id)
  if (!course) throw createError({ statusCode: 404, statusMessage: 'Class not found.' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const user = await currentUser(event)
  const teacher = Boolean(user && (course as any).creatorId === user.id)
  if (teacher) return { id, course, teacher: true, student: '', name: user!.displayName }
  if (teacherOnly) throw createError({ statusCode: 403, statusMessage: 'Only the creator of this class can manage it.' })
  const token = getRequestHeader(event, 'authorization')?.match(/^Bearer\s+(\S+)$/)?.[1]
  const enrolment = token ? findEnrolment(course, { token }) : null
  if (!enrolment) throw createError({ statusCode: 403, statusMessage: 'Open your paid access link to enter this classroom.' })
  return { id, course, teacher: false, student: enrolment.student, name: 'Learner / parent' }
}
export async function classSchedule(id: string): Promise<ClassSchedule> {
  return (await cloud<ClassSchedule | null>(`/classrooms/${id}`)) ?? emptySchedule()
}
