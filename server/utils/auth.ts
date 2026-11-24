import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import { cloud, cloudMaybe, CloudError } from './cloud'

const scrypt = promisify(scryptCallback)
const SESSION_COOKIE = 'learnpurse_session'
const SESSION_DAYS = 30
const PASSWORD_MIN = 12

type AuthUser = { id: string; email: string; displayName: string; role: 'creator' | 'student'; focus: string; walletAddress: string | null }

function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex') }
function cookieOptions() { return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_DAYS * 24 * 60 * 60 } }

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > 200) return `Password must be ${PASSWORD_MIN}-200 characters.`
  return null
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64) as Buffer
  return `${salt.toString('base64url')}.${derived.toString('base64url')}`
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [saltText, hashText] = encoded.split('.')
  if (!saltText || !hashText) return false
  const salt = Buffer.from(saltText, 'base64url')
  const expected = Buffer.from(hashText, 'base64url')
  const actual = await scrypt(password, salt, expected.length) as Buffer
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function registerUser(input: { email: string; password: string; displayName: string; role: 'creator' | 'student'; focus: string; walletAddress?: string | null }): Promise<AuthUser> {
  const passwordHash = await hashPassword(input.password)
  try {
    return await cloud<AuthUser>('/users', { method: 'POST', body: { email: input.email, passwordHash, displayName: input.displayName, role: input.role, focus: input.focus, walletAddress: input.walletAddress ?? null } })
  } catch (error) {
    // Keep the existing duplicate-email contract (PostgreSQL unique violation code).
    if (error instanceof CloudError && error.status === 409) throw Object.assign(new Error('duplicate'), { code: '23505' })
    throw error
  }
}

export async function loginUser(email: string, password: string): Promise<AuthUser | null> {
  const user = await cloudMaybe<AuthUser & { passwordHash: string }>('/users/by-email', { email })
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null
  const { passwordHash: _, ...safe } = user
  return safe
}

export async function createSession(event: H3Event, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await cloud('/sessions', { method: 'POST', body: { tokenHash: hashToken(token), userId, expiresAt: expires.toISOString() } })
  setCookie(event, SESSION_COOKIE, token, cookieOptions())
}

export async function currentUser(event: H3Event): Promise<AuthUser | null> {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null
  return cloudMaybe<AuthUser>(`/sessions/${hashToken(token)}`)
}

export async function destroySession(event: H3Event): Promise<void> {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) await cloud(`/sessions/${hashToken(token)}`, { method: 'DELETE' }).catch(() => {})
  deleteCookie(event, SESSION_COOKIE, cookieOptions())
}

export { PASSWORD_MIN }

/** The signed-in creator, or a 401. Publishing, the dashboard and wallet changes require this. */
export async function requireCreator(event: H3Event): Promise<AuthUser> {
  const user = await currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
  if (user.role !== 'creator') throw createError({ statusCode: 403, statusMessage: 'Only creator accounts can do this.' })
  return user
}

export async function updateUser(id: string, changes: { displayName?: string; focus?: string; walletAddress?: string | null }): Promise<AuthUser> {
  return cloud<AuthUser>(`/users/${id}`, { method: 'PATCH', body: changes })
}

export type { AuthUser }
