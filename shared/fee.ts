/** Exact USDC split in stroops (7 decimals). The platform fee rounds down, so creators never get less than (100 - fee)%. */
export function toUnits(amount: string | number): bigint {
  const [whole, frac = ''] = String(amount).trim().split('.')
  return BigInt(whole || '0') * 10_000_000n + BigInt((frac + '0000000').slice(0, 7))
}

export function fromUnits(units: bigint): string {
  const sign = units < 0n ? '-' : ''
  const abs = units < 0n ? -units : units
  const frac = (abs % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '')
  return `${sign}${abs / 10_000_000n}${frac ? '.' + frac : ''}`
}

export function splitAmount(amount: string | number, feeBps: number) {
  const total = toUnits(amount)
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(feeBps))))
  const platformUnits = total * bps / 10_000n
  const creatorUnits = total - platformUnits
  return { totalUnits: total, platformUnits, creatorUnits, platformUsdc: fromUnits(platformUnits), creatorUsdc: fromUnits(creatorUnits) }
}
