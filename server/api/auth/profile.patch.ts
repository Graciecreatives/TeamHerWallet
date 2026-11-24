import { isStellarPublicKey } from '#shared/profile'
import { requireCreator, updateUser } from '../../utils/auth'

/** Signed-in creator updates their name, focus or payout wallet. */
export default defineEventHandler(async (event) => {
  const user = await requireCreator(event)
  const body = await readBody<{ displayName?: unknown; focus?: unknown; walletAddress?: unknown }>(event).catch(() => null) ?? {}
  const changes: { displayName?: string; focus?: string; walletAddress?: string | null } = {}
  if (typeof body.displayName === 'string') {
    const name = body.displayName.trim()
    if (!name || name.length > 100) throw createError({ statusCode: 422, statusMessage: 'Enter a display name.' })
    changes.displayName = name
  }
  if (typeof body.focus === 'string') changes.focus = body.focus.trim().slice(0, 60)
  if (body.walletAddress !== undefined) {
    if (body.walletAddress !== '' && body.walletAddress !== null && !isStellarPublicKey(body.walletAddress)) throw createError({ statusCode: 422, statusMessage: 'Wallet address is not a valid Stellar public address.' })
    changes.walletAddress = body.walletAddress ? String(body.walletAddress) : null
  }
  return { user: await updateUser(user.id, changes) }
})
