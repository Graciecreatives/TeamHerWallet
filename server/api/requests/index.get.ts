import { listRequests } from '#server/utils/learning-agent'

/** Open class requests from learning agents, for creators. No learner wallet or agent details are exposed. */
export default defineEventHandler(async () => {
  const requests = await listRequests({ status: 'open' }).catch(() => [])
  return requests.map(request => ({ id: request.id, topic: request.topic, brief: request.brief, maxPrice: request.maxPrice, createdAt: request.createdAt }))
})
