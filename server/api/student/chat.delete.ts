import { requireStudent } from '#server/utils/student-learning'
import { clearSavedChat, withStudentLock } from '#server/utils/student-store'
export default defineEventHandler(async event => {
  const user = await requireStudent(event)
  await withStudentLock(user.id, () => clearSavedChat(user.id))
  return { ok: true }
})
