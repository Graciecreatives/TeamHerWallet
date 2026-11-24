import { requireStudent } from '#server/utils/student-learning'
import { savedChat } from '#server/utils/student-store'
export default defineEventHandler(async event => {
  const user = await requireStudent(event)
  return { messages: await savedChat(user.id) }
})
