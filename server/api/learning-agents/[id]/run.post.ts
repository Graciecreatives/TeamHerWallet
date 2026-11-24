import { loadAgent, runAgent } from '#server/utils/learning-agent'
import { withAgentLock } from '#server/utils/agent-lock'

/** Let the agent find and pay for classes by itself, inside the owner's rules. */
export default defineEventHandler(async (event) => {
  const agent = await loadAgent(getRouterParam(event, 'id') ?? '', getRequestHeader(event, 'x-agent-key'))
  const body = await readBody(event).catch(() => ({})) ?? {}
  const goal = typeof body.goal === 'string' ? body.goal.trim().slice(0, 600) : undefined
  const events = await withAgentLock(agent.id, () => runAgent(agent, getRequestURL(event).origin, goal))
  return { events }
})
