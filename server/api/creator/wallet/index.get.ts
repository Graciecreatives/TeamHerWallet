import { requireCreator } from '#server/utils/auth'
import { feeConfig } from '#server/utils/platform-fee'
import { creatorCourses, creatorSales, walletBalance } from '#server/utils/creator-wallet'
import { fromUnits, toUnits } from '#shared/fee'

/** Creator wallet dashboard: balance, earnings, every sale with its payout status, and recent wallet activity. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireCreator(event)
  const courses = await creatorCourses(user.id)
  const address = user.walletAddress
  const [balance, { sales, payouts }] = await Promise.all([
    address ? walletBalance(address).catch(() => null) : Promise.resolve(null),
    creatorSales(courses, address),
  ])
  const sum = (list: typeof sales, key: 'net' | 'fee' | 'gross') => fromUnits(list.reduce((total, sale) => total + toUnits(sale[key]), 0n))
  const received = sales.filter(sale => sale.status !== 'pending')
  const pending = sales.filter(sale => sale.status === 'pending')
  const activity = address ? (payouts.get(address) ?? []).slice(0, 25).map(payment => ({ ...payment, direction: payment.to === address ? 'in' : 'out' })) : []
  const { treasury, bps } = feeConfig()
  return {
    address,
    network: 'stellar:testnet',
    balance,
    feePercent: bps / 100,
    treasury: treasury?.publicKey() ?? null,
    totals: { sales: sales.length, gross: sum(sales, 'gross'), fees: sum(sales, 'fee'), earned: sum(sales, 'net'), received: sum(received, 'net'), pending: sum(pending, 'net'), pendingCount: pending.length },
    otherWallets: [...new Set(courses.map(course => course.payTo))].filter(wallet => wallet !== address),
    sales: sales.slice(0, 100),
    activity,
  }
})
