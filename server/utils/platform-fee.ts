/**
 * Platform fee on Stellar Testnet.
 *
 * With a treasury configured, the student's single x402 payment settles to the platform treasury and the
 * server immediately forwards the creator's share (price minus the fee) as a USDC payment. Without a
 * treasury, payments go straight to the creator as before (0% fee).
 */
import { Asset, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { splitAmount } from '#shared/fee'

const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')

export interface FeeConfig { treasury: Keypair | null; bps: number }

export function feeConfig(): FeeConfig {
  const config = useRuntimeConfig()
  const secret = String(config.platformTreasurySecret || '').trim()
  let treasury: Keypair | null = null
  if (secret) {
    try { treasury = Keypair.fromSecret(secret) } catch { console.error('NUXT_PLATFORM_TREASURY_SECRET is not a valid Stellar secret. Platform fee disabled.') }
  }
  const percent = Number(config.platformFeePercent)
  const bps = treasury && Number.isFinite(percent) ? Math.round(Math.min(Math.max(percent, 0), 50) * 100) : 0
  return { treasury, bps }
}

/** Where the student's payment goes: the platform treasury when a fee applies, otherwise the creator. */
export function paymentRecipient(creator: string): string {
  const { treasury, bps } = feeConfig()
  return treasury && bps > 0 ? treasury.publicKey() : creator
}

export function feeSummary(priceAmount: string | number) {
  const { bps } = feeConfig()
  const split = splitAmount(priceAmount, bps)
  return { percent: bps / 100, platform: split.platformUsdc, creator: split.creatorUsdc }
}

/** Send the creator's share from the treasury. Retries a few times on transient Horizon errors. */
export async function payoutCreator(creator: string, priceAmount: string | number, memo: string): Promise<{ transaction: string; amount: string; fee: string }> {
  const { treasury, bps } = feeConfig()
  if (!treasury || bps <= 0) throw new Error('Platform fee is not configured.')
  const split = splitAmount(priceAmount, bps)
  if (split.creatorUnits <= 0n) return { transaction: '', amount: '0', fee: split.platformUsdc }
  const horizon = new Horizon.Server(String(useRuntimeConfig().stellarHorizonUrl || 'https://horizon-testnet.stellar.org'))
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const account = await horizon.loadAccount(treasury.publicKey())
      const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.payment({ destination: creator, asset: USDC, amount: split.creatorUsdc }))
        .addMemo(Memo.text(memo.slice(0, 28)))
        .setTimeout(60).build()
      tx.sign(treasury)
      const result = await horizon.submitTransaction(tx)
      return { transaction: result.hash, amount: split.creatorUsdc, fee: split.platformUsdc }
    } catch (error) {
      lastError = error
      const codes = (error as any)?.response?.data?.extras?.result_codes
      // Permanent failures (no trustline, bad destination) will not succeed on retry.
      if (codes && JSON.stringify(codes).match(/no_trust|no_destination|not_authorized|underfunded/)) break
      await new Promise(done => setTimeout(done, 1500 * (attempt + 1)))
    }
  }
  const codes = (lastError as any)?.response?.data?.extras?.result_codes
  throw new Error(`Creator payout failed: ${codes ? JSON.stringify(codes) : String((lastError as Error)?.message ?? lastError)}`)
}
