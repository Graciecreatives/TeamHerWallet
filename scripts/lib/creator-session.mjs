// Registers a throwaway creator account and returns a fetch helper that sends its session cookie.
// Publishing and the creator dashboard require a signed-in creator.
import { randomBytes } from 'node:crypto'

export async function creatorSession(base, { name = 'Demo creator', walletAddress } = {}) {
  const email = `creator-${randomBytes(5).toString('hex')}@example.com`
  const password = randomBytes(12).toString('base64url')
  const response = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, displayName: name, role: 'creator', focus: 'Something else', walletAddress }) })
  if (!response.ok) throw new Error(`register failed ${response.status} ${await response.text()}`)
  const cookie = (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).map(value => value.split(';')[0]).join('; ')
  const call = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) } })
  return { email, password, cookie, call }
}
