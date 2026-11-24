/** Local profile of a signed-in account. Stored on this device only. */
export interface CreatorProfile {
  name: string
  email: string
  focus: string
  walletAddress: string
  role?: 'creator' | 'student'
}

export const PROFILE_STORAGE_KEY = 'learnpurse.profile.v1'
export const focusOptions = ['Money & budgeting', 'Business & freelancing', 'Creative skills', 'Wellbeing', 'Something else'] as const

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const ACCOUNT_VERSION_BYTE = 6 << 3

function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0
  for (const byte of bytes) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc
}

/** Full StrKey check for a Stellar account public key (G...), including the CRC16 checksum. */
export function isStellarPublicKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 56 || value[0] !== 'G') return false
  const bytes: number[] = []
  let buffer = 0, bits = 0
  for (const char of value) {
    const index = BASE32.indexOf(char)
    if (index < 0) return false
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff) }
  }
  if (bytes.length !== 35 || bytes[0] !== ACCOUNT_VERSION_BYTE) return false
  const data = Uint8Array.from(bytes.slice(0, 33))
  const checksum = bytes[33]! | (bytes[34]! << 8)
  return crc16Xmodem(data) === checksum
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address
}

export function validateProfile(input: Partial<CreatorProfile>): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim() : ''
  if (!name) errors.name = 'Tell us what to call you.'
  else if (name.length > 60) errors.name = 'Keep your name under 60 characters.'
  if (!email) errors.email = 'Add your email address.'
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'That email doesn’t look quite right.'
  if (!input.focus || !(focusOptions as readonly string[]).includes(input.focus)) errors.focus = 'Choose what you’d like to teach.'
  if (input.walletAddress && !isStellarPublicKey(input.walletAddress)) errors.walletAddress = 'That isn’t a valid Stellar address.'
  return errors
}

export function decodeProfile(raw: string | null): CreatorProfile | null {
  if (!raw || raw.length > 4000) return null
  try {
    const value = JSON.parse(raw) as Partial<CreatorProfile>
    const profile: CreatorProfile = {
      name: typeof value.name === 'string' ? value.name : '',
      email: typeof value.email === 'string' ? value.email : '',
      focus: typeof value.focus === 'string' ? value.focus : '',
      walletAddress: typeof value.walletAddress === 'string' ? value.walletAddress : '',
      ...(value.role === 'student' || value.role === 'creator' ? { role: value.role } : {}),
    }
    return Object.keys(validateProfile(profile)).length ? null : profile
  } catch { return null }
}
