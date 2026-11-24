import { decodeProfile, PROFILE_STORAGE_KEY, isStellarPublicKey, type CreatorProfile } from '#shared/profile'

export function loadProfile(): CreatorProfile | null {
  try { return decodeProfile(localStorage.getItem(PROFILE_STORAGE_KEY)) } catch { return null }
}

export function saveProfile(profile: CreatorProfile): boolean {
  try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile)); return true } catch { return false }
}

export async function registerAccount(profile: CreatorProfile, password: string, role: 'creator' | 'student' = 'creator'): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: profile.email, password, displayName: profile.name, role, focus: profile.focus, walletAddress: profile.walletAddress || undefined }),
    })
    const body = await response.json().catch(() => null)
    return response.ok ? { ok: true } : { ok: false, message: body?.statusMessage ?? 'We couldn’t create your account.' }
  } catch { return { ok: false, message: 'The account service is unavailable. You can continue with a device-only profile.' } }
}

export type WalletResult =
  | { ok: true; address: string; network: string }
  | { ok: false; reason: 'not-installed' | 'rejected' | 'error'; message: string }

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([promise, new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), ms))])
}

/** Ask the Freighter extension for the creator's public key. Never requests signatures or secrets. */
export async function connectFreighter(): Promise<WalletResult> {
  try {
    const module = await import('@stellar/freighter-api')
    const api = (typeof module.isConnected === 'function' ? module : module.default) as typeof import('@stellar/freighter-api')
    const connected = await withTimeout(api.isConnected(), 4000)
    if (connected === 'timeout' || connected.error || !connected.isConnected) {
      return { ok: false, reason: 'not-installed', message: 'Freighter isn’t installed in this browser yet.' }
    }
    const access = await api.requestAccess()
    if (access.error || !access.address) {
      return { ok: false, reason: 'rejected', message: 'The connection was cancelled in Freighter.' }
    }
    if (!isStellarPublicKey(access.address)) {
      return { ok: false, reason: 'error', message: 'Freighter returned an address we couldn’t verify.' }
    }
    const network = await withTimeout(api.getNetwork(), 4000)
    return { ok: true, address: access.address, network: network === 'timeout' || network.error ? '' : network.network }
  } catch {
    return { ok: false, reason: 'error', message: 'We couldn’t reach Freighter. Refresh the page and try again.' }
  }
}
