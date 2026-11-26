import { isStellarPublicKey } from '#shared/profile'
import { createSession, loginUser, PASSWORD_MIN, registerUser, validatePassword } from '../../utils/auth'

export default defineEventHandler(async event => {
  const body = await readBody<{ email?: unknown; password?: unknown; displayName?: unknown; role?: unknown; focus?: unknown; walletAddress?: unknown }>(event).catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  const password = body?.password
  const role = body?.role === 'student' ? 'student' : body?.role === 'creator' ? 'creator' : null
  const focus = typeof body?.focus === 'string' ? body.focus.trim() : ''
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) throw createError({ statusCode: 422, statusMessage: 'Enter a valid email address.' })
  const passwordError = validatePassword(password)
  if (passwordError) throw createError({ statusCode: 422, statusMessage: passwordError })
  if (!displayName || displayName.length > 100) throw createError({ statusCode: 422, statusMessage: 'Enter a display name.' })
  if (!role) throw createError({ statusCode: 422, statusMessage: 'Choose a creator or student account.' })
  const walletAddress = body?.walletAddress === undefined || body.walletAddress === '' ? null : body.walletAddress
  if (walletAddress !== null && !isStellarPublicKey(walletAddress)) throw createError({ statusCode: 422, statusMessage: 'Wallet address is not a valid Stellar public address.' })
  try {
    const user = await registerUser({ email, password: password as string, displayName, role, focus, walletAddress })
    await createSession(event, user.id)
    return { user, passwordMinimum: PASSWORD_MIN }
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') {
      // A previous attempt may have created the account before a network blip. Same email + password: just sign in.
      const existing = await loginUser(email, password as string).catch(() => null)
      if (existing) { await createSession(event, existing.id); return { user: existing, passwordMinimum: PASSWORD_MIN } }
      throw createError({ statusCode: 409, statusMessage: 'An account with that email already exists. Try logging in instead.' })
    }
    throw error
  }
})
