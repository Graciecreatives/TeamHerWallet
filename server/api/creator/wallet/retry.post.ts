import { requireCreator } from '#server/utils/auth'
import { creatorCourses, retryPendingPayouts } from '#server/utils/creator-wallet'
import { feeConfig } from '#server/utils/platform-fee'

const running = new Set<string>()

/** Creator asks the platform to send any of their payouts that have not arrived yet. Checks the chain first, so it never pays twice. */
export default defineEventHandler(async (event) => {
  const user = await requireCreator(event)
  if (feeConfig().bps <= 0) return { paid: [], failed: [] }
  if (running.has(user.id)) throw createError({ statusCode: 409, statusMessage: 'Already sending your payouts. Give it a few seconds.' })
  running.add(user.id)
  try { return await retryPendingPayouts(await creatorCourses(user.id)) } finally { running.delete(user.id) }
})
