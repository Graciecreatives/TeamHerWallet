import { decide, loadAgent } from '#server/utils/learning-agent'
import { withAgentLock } from '#server/utils/agent-lock'

/** Owner approves or declines a class the agent asked about. */
export default defineEventHandler(async (event) => {
  const agent = await loadAgent(getRouterParam(event, 'id') ?? '', getRequestHeader(event, 'x-agent-key'))
  const body = await readBody(event).catch(() => ({})) ?? {}
  if (typeof body.courseId !== 'string') throw createError({ statusCode: 400, statusMessage: 'courseId is required' })
  const events = await withAgentLock(agent.id, () => decide(agent, getRequestURL(event).origin, body.courseId, body.approve === true))
  return { events }
})
