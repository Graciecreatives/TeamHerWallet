import { requireCreator } from '#server/utils/auth'
import { isStellarPublicKey } from '#shared/profile'
import { prepareWalletTx } from '#server/utils/creator-wallet'

/** Build an unsigned transaction from the creator's wallet. The creator signs it in Freighter; the server never holds their key. */
export default defineEventHandler(async (event) => {
  const user = await requireCreator(event)
  if (!user.walletAddress) throw createError({ statusCode: 422, statusMessage: 'Add a payout wallet first.' })
  const body = await readBody<{ kind?: string; to?: string; amount?: string; memo?: string }>(event).catch(() => null) ?? {}
  try {
    if (body.kind === 'trustline') return { xdr: await prepareWalletTx(user.walletAddress, { kind: 'trustline' }) }
    if (body.kind === 'send') {
      if (!isStellarPublicKey(body.to)) throw createError({ statusCode: 422, statusMessage: 'Enter a valid Stellar address (starts with G).' })
      if (body.to === user.walletAddress) throw createError({ statusCode: 422, statusMessage: 'That is your own wallet.' })
      const amount = String(body.amount ?? '').trim()
      if (!/^\d{1,9}(\.\d{1,7})?$/.test(amount) || Number(amount) <= 0) throw createError({ statusCode: 422, statusMessage: 'Enter an amount like 5 or 2.50.' })
      return { xdr: await prepareWalletTx(user.walletAddress, { kind: 'send', to: body.to, amount, memo: typeof body.memo === 'string' ? body.memo : undefined }) }
    }
  } catch (error: any) {
    if (error?.statusCode) throw error
    if (error?.response?.status === 404) throw createError({ statusCode: 422, statusMessage: 'Your wallet is not active on Testnet yet. Fund it with test XLM first.' })
    throw createError({ statusCode: 502, statusMessage: 'Could not reach Stellar Testnet. Try again.' })
  }
  throw createError({ statusCode: 400, statusMessage: 'Unknown action.' })
})
