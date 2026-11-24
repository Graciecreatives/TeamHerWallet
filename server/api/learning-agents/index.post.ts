import { createAgent, publicAgent } from '#server/utils/learning-agent'

/** Create a dedicated signing wallet and funded Testnet purse. No personal wallet import. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const { agent, ownerKey } = await createAgent(body ?? {})
  setResponseStatus(event, 201)
  return { agent: publicAgent(agent), ownerKey, url: `/agent/${agent.id}#key=${ownerKey}` }
})
