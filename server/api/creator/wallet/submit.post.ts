import { requireCreator } from '#server/utils/auth'
import { submitWalletTx } from '#server/utils/creator-wallet'

/** Submit a transaction the creator signed in Freighter. Only transactions from their own payout wallet are accepted. */
export default defineEventHandler(async (event) => {
  const user = await requireCreator(event)
  if (!user.walletAddress) throw createError({ statusCode: 422, statusMessage: 'Add a payout wallet first.' })
  const body = await readBody<{ xdr?: string }>(event).catch(() => null)
  if (typeof body?.xdr !== 'string' || body.xdr.length > 20000) throw createError({ statusCode: 400, statusMessage: 'Missing signed transaction.' })
  return { transaction: await submitWalletTx(body.xdr, user.walletAddress) }
})
