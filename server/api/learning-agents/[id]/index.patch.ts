import { cleanPolicy, loadAgent, logEvent, publicAgent, syncPurseLimits } from '#server/utils/learning-agent'
import { purseError } from '#server/utils/purse'
import { cloud } from '#server/utils/cloud'

/** Owner edits the goal, learner or spending rules. New rules are written to the on-chain purse too. */
export default defineEventHandler(async (event) => {
  const agent = await loadAgent(getRouterParam(event, 'id') ?? '', getRequestHeader(event, 'x-agent-key'))
  const body = await readBody(event).catch(() => ({})) ?? {}
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : undefined)
  const policy = body.policy ? cleanPolicy(body.policy, agent.policy) : undefined
  if (policy && agent.purseId) {
    try {
      const transaction = await syncPurseLimits(agent, policy)
      await logEvent(agent.id, { kind: 'purse', message: `Updated the limits in the purse contract on-chain.`, data: { contractId: agent.purseId, transaction } })
    } catch (error) {
      throw createError({ statusCode: 422, statusMessage: purseError(error) })
    }
  }
  const updated = await cloud(`/agents/${agent.id}`, { method: 'PATCH', body: { name: text(body.name, 60), learner: text(body.learner, 200), goal: text(body.goal, 600), policy } })
  if (policy) await logEvent(agent.id, { kind: 'note', message: `Rules updated: up to ${policy.perClassMax} USDC per class, ${policy.totalBudget} USDC in total, ask first above ${policy.approvalAbove} USDC, at most ${policy.maxPerRun} per run.` })
  return { agent: publicAgent(updated) }
})
