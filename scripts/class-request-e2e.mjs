// End-to-end: an agent finds no class, posts a request and suggests free resources. A creator publishes
// a class for that request, and the agent buys it by itself over x402 on Stellar Testnet.
// Usage: node scripts/class-request-e2e.mjs [baseUrl]
import assert from 'node:assert/strict'
import { creatorSession } from './lib/creator-session.mjs'
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
const BASE = process.argv[2] ?? 'http://localhost:3000'
const call = async (path, { method = 'GET', body, key } = {}) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-agent-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, json: await response.json().catch(() => ({})) }
}
const print = events => events.forEach(event => console.log(`  [${event.kind}] ${event.message}${event.data?.resources ? ' ' + event.data.resources.map(r => r.title).join(' | ') : ''}`))

const created = await call('/api/learning-agents', { method: 'POST', body: { name: 'Tolu’s agent', learner: 'Tolu, 10, in Lagos', goal: 'Tolu wants to learn to play the kora, the West African harp', policy: { perClassMax: 5, totalBudget: 5, approvalAbove: 5, maxPerRun: 1 } } })
assert.equal(created.status, 201)
const { agent, ownerKey } = created.json
const setup = await call(`/api/learning-agents/${agent.id}`, { key: ownerKey }); print((setup.json.events ?? []).slice().reverse())
const run = await call(`/api/learning-agents/${agent.id}/run`, { method: 'POST', key: ownerKey })
print(run.json.events)
const requested = run.json.events.find(event => event.kind === 'requested')
assert.ok(requested, 'agent posted a request')
assert.ok(run.json.events.some(event => event.kind === 'resources'), 'agent suggested free resources')
const open = (await call('/api/requests')).json
const request = open.find(entry => entry.id === requested.data.requestId)
assert.ok(request, 'request is listed for creators')
assert.ok(!JSON.stringify(request).includes('Tolu') && !JSON.stringify(request).includes('Lagos'), 'no learner name or city leaks')
console.log('request', request)

// A creator answers it.
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
const creator = Keypair.random()
await fetch(`https://friendbot.stellar.org?addr=${creator.publicKey()}`)
const account = await horizon.loadAccount(creator.publicKey())
const trust = new TransactionBuilder(account, { fee: '1000', networkPassphrase: Networks.TESTNET }).addOperation(Operation.changeTrust({ asset: USDC })).setTimeout(60).build()
trust.sign(creator); await horizon.submitTransaction(trust)
const lesson = (title, description) => ({ title, description })
const session = await creatorSession(BASE, { name: 'Auntie Bisi', walletAddress: creator.publicKey() })
const publishedResponse = await session.call('/api/courses', { method: 'POST', body: JSON.stringify({ requestId: request.id, image: 'creator-home', draft: { title: 'Kora for Beginners (Kids)', description: 'First steps on the kora, the 21-string West African harp, for children.', targetAudience: 'Children aged 8 to 12', duration: '4 weeks', priceAmount: String(Math.min(request.maxPrice, 2)), capacity: '1', modules: [lesson('Meet the kora', 'The strings, the bridge and how to hold it.'), lesson('First patterns', 'Thumb and finger patterns.'), lesson('A first song', 'A simple traditional melody.')] } }) })
const published = { status: publishedResponse.status, json: await publishedResponse.json() }
assert.equal(published.status, 201, JSON.stringify(published.json))
let state
for (let attempt = 0; attempt < 20; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 3000))
  state = (await call(`/api/learning-agents/${agent.id}`, { key: ownerKey })).json
  if (state.library.length || state.events.some(event => event.kind === 'failed')) break
}
print(state.events.slice(0, 3).reverse())
assert.equal(state.library[0]?.courseId, published.json.id, 'agent bought the class made for its request')
assert.ok(!(await call('/api/requests')).json.some(entry => entry.id === request.id), 'request closed')
console.log(`PASS: request → creator published → agent paid ${state.library[0].amount} USDC, tx ${state.library[0].transaction}`)
