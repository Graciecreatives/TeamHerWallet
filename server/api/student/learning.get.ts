import { requireStudent, studentLearning } from '#server/utils/student-learning'
export default defineEventHandler(async event => {
  const user = await requireStudent(event)
  return studentLearning(user.id)
})
