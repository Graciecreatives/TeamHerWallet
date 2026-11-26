/**
 * Learning agents: an AI that finds and buys classes for a learner, paying by itself over x402 on
 * Stellar Testnet, inside spending rules the owner (a parent, a learner, a sponsor) sets.
 *
 * Three layers decide every payment, and the model controls none of them:
 *   1. The owner's rules (per-class cap, total budget, approval threshold), checked in code here.
 *   2. The x402 client signs only an offer for the exact listed price, network and creator, and its
 *      spend control caps each payment at the per-class limit.
 *   3. The agent's own Testnet wallet balance.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { createEd25519Signer } from '@x402/stellar'
import { ExactStellarScheme } from '@x402/stellar/exact/client'
import { cloud, cloudMaybe } from './cloud'
import { askModelJson } from './ai'
import { listCourses, paymentPolicy, publicCourse, seatsLeft, type PublishedCourse } from './courses'
import { findFreeResources } from './free-resources'
import { deployPurse, fundPurse, purseError, purseState, releaseFromPurse, setPurseLimits } from './purse'
import { cleanPolicy, needsApproval, ownedCourses, pendingApprovals, policyBlock, spentFrom, type AgentPolicy } from '#shared/agent-policy'

export { cleanPolicy, pendingApprovals, spentFrom }
export type { AgentPolicy }

export interface StoredAgent {
  id: string
  ownerTokenHash: string
  name: string
  learner: string
  goal: string
  publicKey: string
  secretEnc: string
  /** Soroban learning purse holding the budget (Stellar Testnet contract id). */
  purseId?: string | null
  /** Owner key that co-signs releases above the ask-first limit. Encrypted; used only when the owner approves. */
  ownerSecretEnc?: string | null
  policy: AgentPolicy
  network: string
  createdAt: string
}

export interface AgentEvent {
  id?: number
  kind: 'created' | 'funded' | 'thinking' | 'pick' | 'skip' | 'blocked' | 'approval_needed' | 'paid' | 'failed' | 'approved' | 'declined' | 'note' | 'requested' | 'resources' | 'fulfilled' | 'purse' | 'released'
  message: string
  data?: Record<string, any>
  amount?: number | null
  courseId?: string | null
  createdAt?: string
}

const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
const horizon = () => new Horizon.Server(String(useRuntimeConfig().stellarHorizonUrl || 'https://horizon-testnet.stellar.org'))
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

// ---- Wallet secret at rest: AES-256-GCM with NUXT_AGENT_WALLET_KEY ----
function walletKey(): Buffer {
  const key = String(useRuntimeConfig().agentWalletKey || '')
  if (key.length < 32) throw createError({ statusCode: 503, statusMessage: 'Learning agents are not configured. Set NUXT_AGENT_WALLET_KEY.' })
  return createHash('sha256').update(key).digest()
}
function seal(secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', walletKey(), iv)
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map(part => part.toString('base64url')).join('.')
}
function unseal(sealed: string): string {
  const [iv, tag, body] = sealed.split('.').map(part => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', walletKey(), iv!)
  decipher.setAuthTag(tag!)
  return Buffer.concat([decipher.update(body!), decipher.final()]).toString('utf8')
}

// ---- Storage (Cloudflare D1 through the API Worker) ----
export async function loadAgent(id: string, ownerToken: string | undefined): Promise<StoredAgent> {
  if (!/^[a-z0-9-]{8,64}$/.test(id) || !ownerToken) throw createError({ statusCode: 404, statusMessage: 'Agent not found' })
  const agent = await cloudMaybe<StoredAgent>(`/agents/${id}`)
  if (!agent || agent.ownerTokenHash !== hashToken(ownerToken)) throw createError({ statusCode: 404, statusMessage: 'Agent not found' })
  return agent
}
export async function logEvent(agentId: string, event: AgentEvent): Promise<AgentEvent> {
  await cloud(`/agents/${agentId}/events`, { method: 'POST', body: event }).catch(() => {})
  return { ...event, createdAt: new Date().toISOString() }
}
export const listEvents = (agentId: string) => cloud<AgentEvent[]>(`/agents/${agentId}/events`)

export function publicAgent(agent: StoredAgent) {
  return { id: agent.id, name: agent.name, learner: agent.learner, goal: agent.goal, publicKey: agent.publicKey, purseId: agent.purseId ?? null, policy: agent.policy, network: agent.network, createdAt: agent.createdAt }
}

/** Owner changed the rules: write them to the purse contract too, so the chain matches. */
export async function syncPurseLimits(agent: StoredAgent, policy: AgentPolicy): Promise<string | null> {
  if (!agent.purseId || !agent.ownerSecretEnc) return null
  return setPurseLimits(Keypair.fromSecret(unseal(agent.ownerSecretEnc)), agent.purseId, policy)
}

// ---- Stellar Testnet wallet ----
/** USDC the agent can draw on: the purse balance plus anything already in the agent wallet. */
export async function spendable(agent: StoredAgent): Promise<{ usdc: string }> {
  const wallet = await usdcBalance(agent.publicKey)
  if (!agent.purseId) return { usdc: wallet.usdc }
  const purse = await purseState(agent.purseId, agent.publicKey)
  return { usdc: String((purse?.balance ?? 0) + Number(wallet.usdc)) }
}
export async function usdcBalance(publicKey: string): Promise<{ usdc: string; xlm: string; ready: boolean }> {
  try {
    const account = await horizon().loadAccount(publicKey)
    const usdc = account.balances.find((balance: any) => balance.asset_code === 'USDC' && balance.asset_issuer === USDC.getIssuer())
    const xlm = account.balances.find((balance: any) => balance.asset_type === 'native')
    return { usdc: usdc?.balance ?? '0', xlm: xlm?.balance ?? '0', ready: Boolean(usdc) }
  } catch { return { usdc: '0', xlm: '0', ready: false } }
}

async function submit(keypair: Keypair, operations: any[]) {
  const server = horizon()
  const account = await server.loadAccount(keypair.publicKey())
  const builder = new TransactionBuilder(account, { fee: '1000', networkPassphrase: Networks.TESTNET }).setTimeout(60)
  for (const operation of operations) builder.addOperation(operation)
  const transaction = builder.build()
  transaction.sign(keypair)
  return server.submitTransaction(transaction)
}

/** Testnet only: friendbot XLM, a USDC trustline, then swap XLM for Testnet USDC on the DEX. */
async function fundTestnetWallet(keypair: Keypair, usdcWanted: number): Promise<{ usdc: number; transaction?: string }> {
  const response = await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`)
  if (!response.ok) throw new Error(`Friendbot returned ${response.status}`)
  await submit(keypair, [Operation.changeTrust({ asset: USDC })])
  // Testnet DEX liquidity is thin, so step down until a swap fills.
  for (const amount of [usdcWanted, Math.min(usdcWanted, 10), 5, 2, 1].filter((value, index, all) => value > 0 && all.indexOf(value) === index)) {
    try {
      const result: any = await submit(keypair, [Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: '9000', destination: keypair.publicKey(), destAsset: USDC, destAmount: amount.toFixed(7), path: [] })])
      return { usdc: amount, transaction: result.hash }
    } catch { /* try a smaller amount */ }
  }
  return { usdc: 0 }
}

export async function createAgent(input: { name?: unknown; learner?: unknown; goal?: unknown; policy?: unknown; walletSecret?: unknown; walletAddress?: unknown }) {
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
  const policy = cleanPolicy(input.policy)
  // Never import a personal wallet secret or pretend an address grants signing authority.
  if (input.walletSecret || input.walletAddress) throw createError({ statusCode: 400, statusMessage: 'Create a dedicated Testnet agent wallet instead. Personal wallet keys are not accepted.' })
  const keypair = Keypair.random()
  const ownerKeypair = Keypair.random()
  const ownerKey = randomBytes(24).toString('base64url')
  const agent: StoredAgent = {
    id: `agent-${randomUUID().slice(0, 13)}`,
    ownerTokenHash: hashToken(ownerKey),
    name: text(input.name, 60) || 'Learning agent',
    learner: text(input.learner, 200),
    goal: text(input.goal, 600),
    publicKey: keypair.publicKey(),
    secretEnc: seal(keypair.secret()),
    ownerSecretEnc: seal(ownerKeypair.secret()),
    purseId: null,
    policy,
    network: 'stellar:testnet',
    createdAt: new Date().toISOString(),
  }
  const created = await cloud<{ agent?: StoredAgent }>('/agents', { method: 'POST', body: agent })
  if (created?.agent) Object.assign(agent, created.agent)
  await logEvent(agent.id, { kind: 'created', message: `Created a dedicated Stellar Testnet signing wallet ${agent.publicKey.slice(0, 6)}…${agent.publicKey.slice(-4)}. The server signs payments automatically within your rules. Approve in this app when asked, with no wallet popup.` })
  try {
    // Agent wallet: XLM for fees and a USDC trustline only.
    const agentReady = fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`).then(async response => {
      if (!response.ok) throw new Error(`Friendbot returned ${response.status}`)
      await submit(keypair, [Operation.changeTrust({ asset: USDC })])
    })
    // Owner wallet: buys Testnet USDC, deploys the purse with the rules, and moves the budget into it.
    const [funded] = await Promise.all([fundTestnetWallet(ownerKeypair, Math.min(Math.max(policy.totalBudget, 1), 20)), agentReady])
    if (!funded.usdc) throw new Error('the Testnet DEX could not fill a USDC swap')
    const purse = await deployPurse(ownerKeypair, keypair.publicKey(), policy)
    const fundTx = await fundPurse(ownerKeypair, purse.contractId, funded.usdc)
    await cloud(`/agents/${agent.id}`, { method: 'PATCH', body: { purseId: purse.contractId } })
    agent.purseId = purse.contractId
    await logEvent(agent.id, { kind: 'purse', message: `Deployed a Soroban learning purse and locked the rules on-chain: up to ${policy.perClassMax} USDC per class, ${policy.totalBudget} USDC in total, your signature above ${policy.approvalAbove} USDC, each class paid once.`, data: { contractId: purse.contractId, transaction: purse.transaction } })
    if (fundTx) await logEvent(agent.id, { kind: 'funded', message: `Moved ${funded.usdc} Testnet USDC into the purse. The AI cannot take more than the contract allows.`, amount: funded.usdc, data: { transaction: fundTx } })
  } catch (error: any) {
    await logEvent(agent.id, { kind: 'failed', message: `Could not set up the on-chain purse. Automatic payment is not ready. Create a new agent after resolving the setup problem. (${String(error?.message ?? error).slice(0, 140)})` })
  }
  return { agent, ownerKey }
}

// ---- Choosing classes ----
type Candidate = ReturnType<typeof publicCourse> & { price: number }
interface Pick { id: string; reason: string }

// Words that say nothing about the subject, so they never count as a match on their own.
const STOP = new Set('the and for with wants want learn learning learns how play to who her his their she him them can could would like class classes course courses lesson lessons beginner beginners kid kids child children old year years age aged also from into about this that what more some just get got start basic basics first new online years'.split(' '))
const words = (text: string) => new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(word => !STOP.has(word)))
function keywordPicks(goal: string, candidates: Candidate[]): Pick[] {
  const wanted = words(goal)
  return candidates
    .map(course => {
      // Only the title and description describe the subject. Audience text matches too much by accident.
      const subject = words(`${course.title} ${course.description}`)
      const matched = [...wanted].filter(word => subject.has(word))
      return { course, score: matched.length, matched }
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.course.price - b.course.price)
    .map(entry => ({ id: entry.course.id, reason: `Matches your goal on “${entry.matched.join('”, “')}” and costs ${entry.course.price} USDC.` }))
}

async function choose(agent: StoredAgent, goal: string, candidates: Candidate[]): Promise<{ picks: Pick[]; thought: string; via: 'ai' | 'keywords' }> {
  if (!candidates.length) return { picks: [], thought: 'There are no open classes to consider right now.', via: 'keywords' }
  const catalog = candidates.map(course => ({ id: course.id, title: course.title, description: course.description, forWho: course.targetAudience, duration: course.duration, priceUSDC: course.price, lessons: course.modules.map(module => module.title), seatsLeft: course.seatsLeft, teacher: course.creatorName }))
  const system = `You are a learning agent buying online classes for a learner. You choose; separate code enforces the spending rules, so never invent prices or classes.
Learner: ${agent.learner || 'not specified'}.
Spending rules (for your awareness): at most ${agent.policy.perClassMax} USDC per class, ${agent.policy.totalBudget} USDC in total, buy at most ${agent.policy.maxPerRun} classes now.
Pick only classes from the catalog that genuinely fit the goal and learner. Prefer fewer, better picks. Never pick classes for different age groups or levels of the same subject; if the learner's age or level is unknown, pick the single most suitable one and say what you assumed. If nothing fits, pick none and say so.
Reply as JSON: {"thought": "one or two plain sentences on how you decided", "picks": [{"id": "catalog id", "reason": "one sentence, why it fits this learner"}]}, best first.`
  const result = await askModelJson<{ thought?: string; picks?: Pick[] }>(system, [{ role: 'user', content: `Goal: ${goal}\n\nCatalog:\n${JSON.stringify(catalog)}` }], { temperature: 0.2, maxTokens: 700 }).catch(() => null)
  const ids = new Set(candidates.map(course => course.id))
  if (result && Array.isArray(result.picks)) {
    const picks = result.picks.filter(pick => pick && ids.has(pick.id)).map(pick => ({ id: pick.id, reason: String(pick.reason ?? '').slice(0, 300) }))
    return { picks: picks.filter((pick, index) => picks.findIndex(other => other.id === pick.id) === index), thought: String(result.thought ?? '').slice(0, 500), via: 'ai' }
  }
  const picks = keywordPicks(goal, candidates)
  return { picks, thought: picks.length ? 'The AI was unavailable, so I matched classes to your goal by key words.' : 'The AI was unavailable and no class matched your goal by key words.', via: 'keywords' }
}

// ---- Paying over x402 ----
/** True when the agent runs on the wallet the owner opened without giving the agent a signing key. */
function usingUserWallet(agent: StoredAgent): boolean {
  return !agent.secretEnc
}

async function payForCourse(agent: StoredAgent, origin: string, course: PublishedCourse): Promise<{ transaction: string; accessToken: string }> {
  const secret = unseal(agent.secretEnc ?? '')
  const http = new x402HTTPClient(new x402Client()
    .register('stellar:testnet', new ExactStellarScheme(createEd25519Signer(secret, 'stellar:testnet')))
    // The x402 library's own cap, set from the owner's per-class limit.
    .setSpendControls({ maxAmountPerPayment: `$${agent.policy.perClassMax}` }))
  const url = `${origin}/api/courses/${course.id}/access`
  const first = await fetch(url)
  if (first.status !== 402) throw new Error(first.status === 409 ? 'The class is full.' : `Expected HTTP 402, got ${first.status}.`)
  const required = http.getPaymentRequiredResponse(name => first.headers.get(name), await first.json())
  // Layer 2: sign only an offer that matches the listing exactly (price, Testnet, and the published recipient:
  // the creator, or the platform treasury that forwards the creator's share when a platform fee applies).
  const listing: any = await fetch(`${origin}/api/courses/${course.id}`).then(response => response.ok ? response.json() : null).catch(() => null)
  const recipients = new Set([course.payTo, listing?.paymentRecipient].filter(Boolean))
  const offer = required.accepts.find((option: any) => option.network === 'stellar:testnet' && recipients.has(option.payTo))
  if (!offer) throw new Error('The payment offer does not match this class (network or creator).')
  const expected = BigInt(Math.round(Number(course.draft.priceAmount) * 1e7))
  if (BigInt(offer.amount) !== expected) throw new Error(`The payment offer (${Number(offer.amount) / 1e7} USDC) does not match the listed price.`)
  const payload = await http.createPaymentPayload({ ...required, accepts: [offer] })
  const paid = await fetch(url, { headers: http.encodePaymentSignatureHeader(payload) })
  const body: any = await paid.json().catch(() => ({}))
  if (paid.status !== 200) throw new Error(body?.statusMessage || body?.message || (typeof body?.error === 'string' ? body.error : '') || `Payment was not accepted (HTTP ${paid.status}).`)
  const settlement = http.getPaymentSettleResponse(name => paid.headers.get(name))
  return { transaction: settlement?.transaction || body?.enrolment?.transaction, accessToken: body.accessToken }
}

/**
 * Buy one class. With a purse: ask the Soroban purse to release exactly this price to the agent wallet
 * (the contract checks the limits and, above the ask-first limit, the owner's signature), then pay the
 * creator over x402. Without a purse (older agents), pay from the wallet directly.
 */
async function buy(agent: StoredAgent, origin: string, course: PublishedCourse, reason: string, ownerApproved = false): Promise<AgentEvent> {
  const price = Number(course.draft.priceAmount)
  if (usingUserWallet(agent)) {
    return logEvent(agent.id, { kind: 'blocked', message: 'This older agent has no signing wallet. Create a new agent for automatic payments with in-app approval only. No payment was made.', courseId: course.id, amount: price })
  }
  if (!agent.purseId) return logEvent(agent.id, { kind: 'blocked', message: 'Automatic payment is unavailable until the on-chain purse is set up. No payment was made.', courseId: course.id, amount: price })
  if (agent.purseId) {
    try {
      const agentKey = Keypair.fromSecret(unseal(agent.secretEnc ?? ''))
      // A class already released earlier (payment failed after release) is paid from the wallet without a new release.
      const alreadyReleased = (await listEvents(agent.id)).some(event => event.kind === 'released' && event.courseId === course.id)
      if (!alreadyReleased) {
        const ownerKey = ownerApproved && agent.ownerSecretEnc ? Keypair.fromSecret(unseal(agent.ownerSecretEnc)) : undefined
        const releaseTx = await releaseFromPurse(agentKey, agent.purseId, course.id, price, ownerKey)
        await logEvent(agent.id, { kind: 'released', message: `The purse contract checked the rules and released ${price} USDC for “${course.draft.title}”${ownerKey ? ' with your signature' : ''}.`, amount: price, courseId: course.id, data: { transaction: releaseTx, title: course.draft.title } })
      }
    } catch (error) {
      return logEvent(agent.id, { kind: 'blocked', message: `${purseError(error)} Nothing was paid for “${course.draft.title}”.`, courseId: course.id, amount: price, data: { title: course.draft.title, onChain: true } })
    }
  }
  try {
    const { transaction, accessToken } = await payForCourse(agent, origin, course)
    return logEvent(agent.id, { kind: 'paid', message: `Paid ${price} USDC for “${course.draft.title}” over x402 on Stellar Testnet and enrolled ${agent.learner || 'the learner'}.`, amount: price, courseId: course.id, data: { transaction, accessToken, title: course.draft.title, reason } })
  } catch (error: any) {
    return logEvent(agent.id, { kind: 'failed', message: `Could not pay for “${course.draft.title}”: ${String(error?.message ?? error).slice(0, 200)}${agent.purseId ? ' The released USDC stays in the agent wallet for the next class.' : ''}`, courseId: course.id, data: { title: course.draft.title } })
  }
}

/** One autonomous run: read the goal, shortlist, check rules, pay or ask. Returns the new events (oldest first). */
export async function runAgent(agent: StoredAgent, origin: string, goalOverride?: string): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  const log = async (event: AgentEvent) => { out.push(await logEvent(agent.id, event)); return event }
  const goal = (goalOverride || agent.goal).trim()
  if (!goal) { await log({ kind: 'note', message: 'Tell me what the learner wants to learn first.' }); return out }

  const history = await listEvents(agent.id)
  let spent = spentFrom(history)
  const owned = ownedCourses(history)
  const waiting = new Set(pendingApprovals(history).map(event => event.courseId))
  const courses = await listCourses()
  const candidates: Candidate[] = courses
    .filter(course => !owned.has(course.id) && !waiting.has(course.id) && seatsLeft(course) !== 0)
    .map(course => ({ ...publicCourse(course), price: Number(course.draft.priceAmount) }))
  const balance = await spendable(agent)
  if (agent.policy.totalBudget - spent < 0.01) {
    await log({ kind: 'skip', message: `The whole ${agent.policy.totalBudget} USDC budget is used (${owned.size} class${owned.size === 1 ? '' : 'es'} in the library). Raise the budget if you want me to keep looking.` })
    return out
  }

  await log({ kind: 'thinking', message: `Looking for classes that fit “${goal.slice(0, 160)}”. ${candidates.length} open class${candidates.length === 1 ? '' : 'es'} to compare. Spent so far ${spent.toFixed(2)} of ${agent.policy.totalBudget} USDC. Wallet holds ${Number(balance.usdc).toFixed(2)} USDC${agent.purseId ? ' (in the on-chain purse)' : ''}.` })
  const { picks, thought, via } = await choose(agent, goal, candidates)
  if (thought) await log({ kind: 'note', message: thought, data: { via } })
  if (!picks.length) {
    await log({ kind: 'skip', message: owned.size ? 'Nothing new fits beyond the classes already in the library, so I won’t spend anything.' : 'No class on LearnPurse fits yet, so I won’t spend anything.' })
    if (!owned.size) await requestMissingClass(agent, goal, log)
    const resources = await findFreeResources(goal)
    if (resources.length) await log({ kind: 'resources', message: `While you wait, here ${resources.length === 1 ? 'is a free resource' : `are ${resources.length} free resources`} (links only, nothing bought).`, data: { resources } })
    return out
  }

  let bought = 0
  for (const pick of picks) {
    if (bought >= agent.policy.maxPerRun) { await log({ kind: 'skip', message: `Stopping at ${agent.policy.maxPerRun} class${agent.policy.maxPerRun === 1 ? '' : 'es'} for this run, as the rules say.` }); break }
    const course = courses.find(entry => entry.id === pick.id)!
    const price = Number(course.draft.priceAmount)
    const label = `“${course.draft.title}” (${price} USDC${paymentPolicy(course).mode === 'installments' ? ' per installment' : ''})`
    await log({ kind: 'pick', message: `Shortlisted ${label}. ${pick.reason}`, courseId: course.id, amount: price, data: { title: course.draft.title, reason: pick.reason, via } })
    const blocked = policyBlock(agent.policy, price, spent)
    if (blocked) { await log({ kind: 'blocked', message: `Rule stopped ${label}: ${blocked}`, courseId: course.id, amount: price, data: { title: course.draft.title } }); continue }
    if (Number(balance.usdc) + 1e-9 < price) {
      await log({ kind: 'blocked', message: `The wallet has ${Number(balance.usdc).toFixed(2)} USDC, not enough for ${label}. Top it up with Testnet USDC.`, courseId: course.id, amount: price, data: { title: course.draft.title } })
      continue
    }
    if (needsApproval(agent.policy, price)) {
      await log({ kind: 'approval_needed', message: `${label} is above the ${agent.policy.approvalAbove} USDC ask-first limit. Waiting for your OK.`, courseId: course.id, amount: price, data: { title: course.draft.title, reason: pick.reason } })
      continue
    }
    const event = await buy(agent, origin, course, pick.reason)
    out.push(event)
    if (event.kind === 'paid') { spent += price; bought++; balance.usdc = String(Number(balance.usdc) - price) }
  }
  return out
}

/** Owner decision on a class waiting for approval. Rules (except the ask-first threshold) still apply. */
export async function decide(agent: StoredAgent, origin: string, courseId: string, approve: boolean): Promise<AgentEvent[]> {
  const history = await listEvents(agent.id)
  const request = pendingApprovals(history).find(event => event.courseId === courseId)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'Nothing is waiting for approval for that class.' })
  const title = request.data?.title ?? 'the class'
  if (!approve) return [await logEvent(agent.id, { kind: 'declined', message: `You declined “${title}”. I will not buy it.`, courseId })]
  const course = (await listCourses()).find(entry => entry.id === courseId)
  if (!course) throw createError({ statusCode: 404, statusMessage: 'That class no longer exists.' })
  const price = Number(course.draft.priceAmount)
  const blocked = policyBlock(agent.policy, price, spentFrom(history))
  if (blocked) return [await logEvent(agent.id, { kind: 'blocked', message: `Even with your OK, a rule stops it: ${blocked}`, courseId, amount: price, data: { title } })]
  const approved = await logEvent(agent.id, { kind: 'approved', message: `You approved “${title}”. Paying now.`, courseId, amount: price })
  return [approved, await buy(agent, origin, course, request.data?.reason ?? '', true)]
}

// ---- Class requests: demand for classes that don't exist yet ----
export interface ClassRequest { id: string; agentId: string; topic: string; learner: string; brief: string; maxPrice: number; status: 'open' | 'fulfilled' | 'closed'; courseId?: string | null; createdAt: string }

export const listRequests = (query: Record<string, string> = {}) => cloud<ClassRequest[]>('/requests', { query })

/** Ask creators for a class that fits the goal. One open request per agent. */
async function requestMissingClass(agent: StoredAgent, goal: string, log: (event: AgentEvent) => Promise<AgentEvent>) {
  const open = await listRequests({ agentId: agent.id, status: 'open' }).catch(() => [])
  if (open.length) { await log({ kind: 'note', message: `Your request for “${open[0]!.topic}” is still open. I’ll buy the class as soon as a creator publishes it.` }); return }
  const maxPrice = Math.min(agent.policy.perClassMax, agent.policy.totalBudget)
  const written = await askModelJson<{ topic?: string; brief?: string }>(
    'You write short class requests that a learner\u2019s agent sends to teachers. Never include names or where the learner lives; describe them generally (for example "a 10-year-old beginner"). Reply as JSON: {"topic": "3 to 6 word class title", "brief": "one message a teacher could paste into an AI course builder: subject, level, who it is for (age if known), length (suggest 3 to 6 weeks), and price in USD"}. Plain, specific, no hype.',
    [{ role: 'user', content: `Learner: ${agent.learner || 'not given'}\nGoal: ${goal}\nMost they can pay: ${maxPrice} USD` }],
    { temperature: 0.3, maxTokens: 300 },
  ).catch(() => null)
  const topic = (written?.topic || goal).replace(/\s+/g, ' ').trim().slice(0, 80)
  const brief = (written?.brief || `A beginner class on ${goal} for a new learner. 4 weeks, ${maxPrice} USD.`).trim().slice(0, 600)
  const request = { id: `req-${randomUUID().slice(0, 13)}`, agentId: agent.id, topic, learner: '', brief, maxPrice }
  try {
    await cloud('/requests', { method: 'POST', body: request })
    await log({ kind: 'requested', message: `Posted a class request for creators: “${topic}”, up to ${maxPrice} USDC. When someone publishes it, I’ll buy it automatically within your rules.`, data: { requestId: request.id, topic, brief } })
  } catch { /* requests are best effort */ }
}

/**
 * A creator published a class for a request. Mark it fulfilled and let the requesting agent buy it,
 * still inside the owner's rules (it may ask for approval or be stopped by the budget).
 */
export async function fulfilRequest(requestId: string, course: PublishedCourse, origin: string): Promise<void> {
  const request = (await listRequests({ status: 'open' })).find(entry => entry.id === requestId)
  if (!request) return
  await cloud(`/requests/${requestId}`, { method: 'PATCH', body: { status: 'fulfilled', courseId: course.id } })
  const agent = await cloudMaybe<StoredAgent>(`/agents/${request.agentId}`)
  if (!agent) return
  const price = Number(course.draft.priceAmount)
  await logEvent(agent.id, { kind: 'fulfilled', message: `${course.creatorName} published “${course.draft.title}” (${price} USDC) for your request.`, courseId: course.id, amount: price, data: { title: course.draft.title } })
  const history = await listEvents(agent.id)
  const blocked = policyBlock(agent.policy, price, spentFrom(history))
  if (blocked) { await logEvent(agent.id, { kind: 'blocked', message: `Rule stopped “${course.draft.title}”: ${blocked}`, courseId: course.id, amount: price, data: { title: course.draft.title } }); return }
  if (needsApproval(agent.policy, price)) { await logEvent(agent.id, { kind: 'approval_needed', message: `“${course.draft.title}” (${price} USDC) is above the ${agent.policy.approvalAbove} USDC ask-first limit. Waiting for your OK.`, courseId: course.id, amount: price, data: { title: course.draft.title, reason: `Made for your request “${request.topic}”.` } }); return }
  await buy(agent, origin, course, `Made for your request “${request.topic}”.`)
}
