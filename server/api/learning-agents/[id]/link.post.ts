import { loadAgent } from '#server/utils/learning-agent'
import { currentUser } from '#server/utils/auth'
import { cloud } from '#server/utils/cloud'

/** Opening an agent (owner key) while signed in as a learner links it to that account, once. Its classes then sync to the dashboard. */
export default defineEventHandler(async (event) => {
  const agent = await loadAgent(getRouterParam(event, 'id') ?? '', getRequestHeader(event, 'x-agent-key'))
  const user = await currentUser(event).catch(() => null)
  if (!user || user.role !== 'student') return { linked: false }
  if (agent.userId && agent.userId !== user.id) return { linked: false, reason: 'This agent already belongs to another learner account.' }
  if (!agent.userId) await cloud(`/agents/${agent.id}`, { method: 'PATCH', body: { userId: user.id } })
  return { linked: true }
})
