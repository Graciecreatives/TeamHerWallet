// End-to-end Stellar x402 check against a running LearnPurse server.
// Creates throwaway Testnet accounts, buys a little Testnet USDC on the DEX,
// publishes a class via the agent and pays for it through the real 402 flow.
// Usage: node scripts/x402-testnet-e2e.mjs [baseUrl]
import assert from 'node:assert/strict'
import { creatorSession } from './lib/creator-session.mjs'
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { createEd25519Signer } from '@x402/stellar'
import { ExactStellarScheme } from '@x402/stellar/exact/client'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')

async function fund(keypair) {
  const response = await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`)
  assert.ok(response.ok, `friendbot ${response.status}`)
}
async function submit(keypair, operations) {
  const account = await horizon.loadAccount(keypair.publicKey())
  const builder = new TransactionBuilder(account, { fee: '1000', networkPassphrase: Networks.TESTNET }).setTimeout(60)
  for (const operation of operations) builder.addOperation(operation)
  const tx = builder.build()
  tx.sign(keypair)
  return horizon.submitTransaction(tx)
}
const usdcBalance = async publicKey => (await horizon.loadAccount(publicKey)).balances.find(b => b.asset_code === 'USDC' && b.asset_issuer === USDC.getIssuer())?.balance ?? '0'

const creator = Keypair.random()
const student = Keypair.random()
console.log('creator', creator.publicKey())
console.log('student', student.publicKey())
await Promise.all([fund(creator), fund(student)])
await submit(creator, [Operation.changeTrust({ asset: USDC })])
await submit(student, [
  Operation.changeTrust({ asset: USDC }),
  Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: '5000', destination: student.publicKey(), destAsset: USDC, destAmount: '2', path: [] }),
])
console.log('student USDC', await usdcBalance(student.publicKey()))

const plan = await (await fetch(`${BASE}/api/agent/course`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief: 'I want to create a forex beginners class. It costs $1, and I want to teach 30 students.' }) })).json()
const session = await creatorSession(BASE, { name: 'E2E creator', walletAddress: creator.publicKey() })
const published = await (await session.call('/api/courses', { method: 'POST', body: JSON.stringify({ draft: plan.draft, image: 'creator-home' }) })).json()
console.log('class', published.url)

const accessUrl = `${BASE}/api/courses/${published.id}/access`
const http = new x402HTTPClient(new x402Client().register('stellar:*', new ExactStellarScheme(createEd25519Signer(student.secret(), 'stellar:testnet'))))
const first = await fetch(accessUrl)
assert.equal(first.status, 402)
const required = http.getPaymentRequiredResponse(name => first.headers.get(name), await first.json())
const payload = await http.createPaymentPayload(required)
const paid = await fetch(accessUrl, { headers: http.encodePaymentSignatureHeader(payload) })
const body = await paid.json()
assert.equal(paid.status, 200, JSON.stringify(body))
const settlement = http.getPaymentSettleResponse(name => paid.headers.get(name))
console.log('settled tx', settlement.transaction)
assert.equal(body.enrolment.student, student.publicKey())
assert.ok(body.modules.length >= 3 && body.modules[0].description)
assert.equal(await usdcBalance(creator.publicKey()), '1.0000000')

const again = await fetch(accessUrl, { headers: { authorization: `Bearer ${body.accessToken}` } })
assert.equal(again.status, 200)
const listing = await (await fetch(`${BASE}/api/courses/${published.id}`)).json()
assert.equal(listing.enrolled, 1)
assert.equal(listing.seatsLeft, 29)
console.log(`PASS: agent → listing → 402 → Stellar settlement ${settlement.transaction} → enrolled, creator received 1 USDC`)
