/**
 * Creator wallet dashboard data. Everything that matters is read from Stellar Testnet (Horizon), so it works on
 * serverless hosts without local state: balances, and which sales already have a creator payout on-chain.
 *
 * Matching rule: every creator payout is a USDC payment from the platform treasury to the class's payout wallet with
 * memo `LP <courseId>` (cut to 28 bytes). For each class, sales and payouts are paired oldest first. Sales without a
 * matching payout are "pending" and can be retried safely (retry only pays the unmatched count).
 */
import { Asset, Horizon, Networks, Operation, TransactionBuilder, Memo } from '@stellar/stellar-sdk'
import { splitAmount } from '#shared/fee'
import { feeConfig, payoutCreator } from './platform-fee'
import type { PublishedCourse } from './courses'

export const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
export const horizon = () => new Horizon.Server(String(useRuntimeConfig().stellarHorizonUrl || 'https://horizon-testnet.stellar.org'))
export const payoutMemo = (courseId: string) => `LP ${courseId}`.slice(0, 28)

export interface WalletBalance { funded: boolean; xlm: string; usdc: string | null; trustline: boolean }

export async function walletBalance(address: string): Promise<WalletBalance> {
  try {
    const account = await horizon().loadAccount(address)
    const usdc = account.balances.find((entry: any) => entry.asset_code === 'USDC' && entry.asset_issuer === USDC.getIssuer()) as any
    const xlm = account.balances.find((entry: any) => entry.asset_type === 'native') as any
    return { funded: true, xlm: xlm?.balance ?? '0', usdc: usdc ? usdc.balance : null, trustline: !!usdc }
  } catch (error: any) {
    if (error?.response?.status === 404) return { funded: false, xlm: '0', usdc: null, trustline: false }
    throw error
  }
}

export interface ChainPayment { id: string; hash: string; from: string; to: string; amount: string; memo: string; at: string }

/** Recent USDC movements in and out of a wallet (newest first), with memos. Includes x402 (Soroban) transfers. */
export async function walletPayments(address: string, limit = 200): Promise<ChainPayment[]> {
  try {
    const page = await horizon().operations().forAccount(address).join('transactions').order('desc').limit(limit).call()
    const out: ChainPayment[] = []
    for (const record of page.records as any[]) {
      const memo = record.transaction_attr?.memo ?? record.transaction?.memo ?? ''
      if (record.type === 'payment' && record.asset_code === 'USDC' && record.asset_issuer === USDC.getIssuer()) {
        out.push({ id: record.id, hash: record.transaction_hash, from: record.from, to: record.to, amount: record.amount, memo, at: record.created_at })
      } else if (record.type === 'invoke_host_function') {
        for (const change of record.asset_balance_changes ?? []) {
          if (change.asset_code === 'USDC' && change.asset_issuer === USDC.getIssuer() && change.type === 'transfer' && (change.to === address || change.from === address)) {
            out.push({ id: record.id, hash: record.transaction_hash, from: change.from, to: change.to, amount: change.amount, memo, at: record.created_at })
          }
        }
      }
    }
    return out
  } catch (error: any) {
    if (error?.response?.status === 404) return []
    throw error
  }
}

export interface Sale {
  courseId: string; title: string; payTo: string; studentTx: string; student: string; at: string
  gross: string; fee: string; net: string
  status: 'paid' | 'pending' | 'direct'
  payoutTx?: string
}

/** All sales of these classes with the creator's share and whether that share has arrived on-chain. */
export async function creatorSales(courses: PublishedCourse[]): Promise<{ sales: Sale[]; payouts: Map<string, ChainPayment[]> }> {
  const { treasury, bps } = feeConfig()
  const wallets = [...new Set(courses.map(course => course.payTo))]
  const payouts = new Map<string, ChainPayment[]>()
  await Promise.all(wallets.map(async wallet => payouts.set(wallet, await walletPayments(wallet).catch(() => []))))
  const sales: Sale[] = []
  for (const course of courses) {
    const memo = payoutMemo(course.id)
    const history = payouts.get(course.payTo) ?? []
    const directHashes = new Set(history.filter(payment => payment.to === course.payTo).map(payment => payment.hash))
    // Oldest first, so the n-th fee-paying sale pairs with the n-th payout.
    const received = history.filter(payment => payment.to === course.payTo && payment.memo === memo && (!treasury || payment.from === treasury.publicKey())).reverse()
    const enrolments = [...course.enrolments].sort((a, b) => a.enrolledAt.localeCompare(b.enrolledAt))
    let feeIndex = 0
    for (const enrolment of enrolments) {
      // Sales before the fee existed (or with no treasury) paid the creator inside the student's own transaction.
      const direct = !treasury || bps <= 0 || directHashes.has(enrolment.transaction)
      const split = splitAmount(course.draft.priceAmount, direct ? 0 : bps)
      const payout = direct ? undefined : received[feeIndex++]
      sales.push({
        courseId: course.id, title: course.draft.title, payTo: course.payTo, studentTx: enrolment.transaction,
        student: `${enrolment.student.slice(0, 4)}…${enrolment.student.slice(-4)}`, at: enrolment.enrolledAt,
        gross: String(course.draft.priceAmount), fee: split.platformUsdc, net: split.creatorUsdc,
        status: direct ? 'direct' : payout ? 'paid' : 'pending', payoutTx: direct ? enrolment.transaction : payout?.hash,
      })
    }
  }
  sales.sort((a, b) => b.at.localeCompare(a.at))
  return { sales, payouts }
}

/** Pay the creator's share for sales with no payout on-chain yet. Re-checks the chain first, so it never pays twice. */
export async function retryPendingPayouts(courses: PublishedCourse[]): Promise<{ paid: { courseId: string; transaction: string; amount: string }[]; failed: { courseId: string; error: string }[] }> {
  const { sales } = await creatorSales(courses)
  const paid: { courseId: string; transaction: string; amount: string }[] = []
  const failed: { courseId: string; error: string }[] = []
  for (const sale of sales.filter(entry => entry.status === 'pending').reverse()) {
    const course = courses.find(entry => entry.id === sale.courseId)!
    try {
      const result = await payoutCreator(course.payTo, course.draft.priceAmount, payoutMemo(course.id))
      paid.push({ courseId: course.id, transaction: result.transaction, amount: result.amount })
    } catch (error) {
      failed.push({ courseId: course.id, error: String((error as Error)?.message ?? error).slice(0, 200) })
      // No trustline or an unfunded wallet fails every payout the same way. Stop and tell the creator.
      if (/no_trust|no_destination/.test(String((error as Error)?.message))) break
    }
  }
  return { paid, failed }
}

/** Unsigned transaction for the creator to sign in Freighter: add the USDC trustline, or send USDC out. */
export async function prepareWalletTx(source: string, action: { kind: 'trustline' } | { kind: 'send'; to: string; amount: string; memo?: string }): Promise<string> {
  const account = await horizon().loadAccount(source)
  const builder = new TransactionBuilder(account, { fee: '10000', networkPassphrase: Networks.TESTNET }).setTimeout(300)
  if (action.kind === 'trustline') builder.addOperation(Operation.changeTrust({ asset: USDC }))
  else {
    builder.addOperation(Operation.payment({ destination: action.to, asset: USDC, amount: action.amount }))
    if (action.memo) builder.addMemo(Memo.text(action.memo.slice(0, 28)))
  }
  return builder.build().toXDR()
}

/** Submit a Freighter-signed transaction, only if it comes from the creator's own wallet. */
export async function submitWalletTx(xdr: string, expectedSource: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET)
  if (!('source' in tx) || tx.source !== expectedSource) throw createError({ statusCode: 403, statusMessage: 'That transaction is not from your payout wallet.' })
  if (!tx.signatures.length) throw createError({ statusCode: 422, statusMessage: 'The transaction is not signed.' })
  try { return (await horizon().submitTransaction(tx)).hash } catch (error: any) {
    const codes = error?.response?.data?.extras?.result_codes
    const text = JSON.stringify(codes ?? error?.message ?? error)
    if (/underfunded/.test(text)) throw createError({ statusCode: 422, statusMessage: 'Not enough USDC (or XLM for fees) in your wallet.' })
    if (/no_trust/.test(text)) throw createError({ statusCode: 422, statusMessage: 'The receiving wallet cannot hold USDC yet (no trustline).' })
    if (/no_destination/.test(text)) throw createError({ statusCode: 422, statusMessage: 'The receiving wallet does not exist on Testnet.' })
    throw createError({ statusCode: 502, statusMessage: `Stellar rejected the transaction: ${text.slice(0, 160)}` })
  }
}

/** Classes published by this creator account. */
export async function creatorCourses(userId: string): Promise<PublishedCourse[]> {
  const { cloud, cloudConfigured } = await import('./cloud')
  const { listCourses } = await import('./courses')
  return cloudConfigured()
    ? cloud<PublishedCourse[]>('/courses', { query: { creatorId: userId } })
    : (await listCourses()).filter(course => (course as any).creatorId === userId)
}
