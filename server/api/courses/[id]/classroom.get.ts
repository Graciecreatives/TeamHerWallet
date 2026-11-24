import { classroomAccess, classSchedule } from '#server/utils/classroom'
import { cloud } from '#server/utils/cloud'
export default defineEventHandler(async event => {
  const access = await classroomAccess(event)
  const query = access.teacher ? undefined : { student: access.student }
  const messages = await cloud(`/classrooms/${access.id}/messages`, { query })
  const students = access.teacher ? [...new Set(access.course.enrolments.map(item => item.student))] : undefined
  return { schedule: await classSchedule(access.id), messages, students, teacher: access.teacher, teacherName: access.course.creatorName }
})
