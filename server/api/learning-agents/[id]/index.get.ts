import { listEvents, loadAgent, pendingApprovals, publicAgent, spentFrom, usdcBalance } from '#server/utils/learning-agent'
import { purseState } from '#server/utils/purse'

/** Agent console data. Requires the owner key (x-agent-key header). Purse state is read from the chain. */
export default defineEventHandler(async (event) => {
  const agent = await loadAgent(getRouterParam(event, 'id') ?? '', getRequestHeader(event, 'x-agent-key'))
  const [events, wallet, purse] = await Promise.all([
    listEvents(agent.id),
    usdcBalance(agent.publicKey),
    agent.purseId ? purseState(agent.purseId, agent.publicKey) : Promise.resolve(null),
  ])
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const library = events.filter(item => item.kind === 'paid').map(item => ({ courseId: item.courseId, title: item.data?.title, amount: item.amount, transaction: item.data?.transaction, url: `/class/${item.courseId}?access=${encodeURIComponent(item.data?.accessToken ?? '')}`, at: item.createdAt }))
  const balance = purse ? { ...wallet, usdc: String(purse.balance + Number(wallet.usdc)), purse: purse.balance, wallet: Number(wallet.usdc) } : wallet
  return { agent: publicAgent(agent), balance, purse, spent: spentFrom(events), pending: pendingApprovals(events), library, events: events.map(({ data, ...rest }) => ({ ...rest, data: data ? { ...data, accessToken: undefined } : data })) }
})
