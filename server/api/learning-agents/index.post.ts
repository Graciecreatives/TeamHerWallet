import { createAgent, publicAgent } from '#server/utils/learning-agent'
import { currentUser } from '#server/utils/auth'

/** Create a dedicated signing wallet and funded Testnet purse. A signed-in learner owns the agent, so its classes show in their dashboard. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const user = await currentUser(event).catch(() => null)
  const { agent, ownerKey } = await createAgent(body ?? {}, user?.role === 'student' ? user.id : null)
  setResponseStatus(event, 201)
  return { agent: publicAgent(agent), ownerKey, url: `/agent/${agent.id}#key=${ownerKey}` }
})
