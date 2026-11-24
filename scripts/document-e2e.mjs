// Real acceptance check. Creates throwaway creator/buyer accounts and transfers exactly
// 1 Testnet USDC through x402. Never uses mainnet or a supplied private key.
// Usage: node scripts/document-e2e.mjs [baseUrl]
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { creatorSession } from './lib/creator-session.mjs'
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { createEd25519Signer } from '@x402/stellar'
import { ExactStellarScheme } from '@x402/stellar/exact/client'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
const creator = Keypair.random()
const student = Keypair.random()
const marker = randomBytes(8).toString('hex')
const pdf = Buffer.from(`%PDF-1.4\n% Private LearnPurse acceptance fixture ${marker}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`)
const uploadForm = (bytes = pdf) => {
  const form = new FormData()
  form.append('document', new Blob([bytes], { type: 'application/pdf' }), 'Private guide.pdf')
  return form
}
const json = async response => {
  const body = await response.json().catch(() => ({}))
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(body)}`)
  return body
}
async function submit(keypair, operations) {
  const builder = new TransactionBuilder(await horizon.loadAccount(keypair.publicKey()), { fee: '1000', networkPassphrase: Networks.TESTNET }).setTimeout(60)
  for (const operation of operations) builder.addOperation(operation)
  const transaction = builder.build()
  transaction.sign(keypair)
  return horizon.submitTransaction(transaction)
}
const balance = async address => (await horizon.loadAccount(address)).balances.find(entry => entry.asset_code === 'USDC' && entry.asset_issuer === USDC.getIssuer())?.balance ?? '0'

assert.equal((await fetch(`${BASE}/api/uploads/document`, { method: 'POST', body: uploadForm() })).status, 401, 'upload requires creator authentication')
const session = await creatorSession(BASE, { name: 'Private PDF acceptance creator', walletAddress: creator.publicKey() })
const upload = bytes => fetch(`${BASE}/api/uploads/document`, { method: 'POST', headers: { cookie: session.cookie }, body: uploadForm(bytes) })
assert.equal((await upload(Buffer.from('Not a PDF'))).status, 415, 'PDF magic bytes are checked')
const document = await json(await upload(pdf))
assert.match(document.key, /^documents\/[a-f0-9]{40}\.pdf$/)
assert.equal(document.size, pdf.length)
assert.equal(document.url, undefined, 'upload never returns a public URL')
const draft = { title: `Private PDF acceptance ${marker}`, description: 'A private paid PDF download acceptance check.', targetAudience: 'Test learners', duration: 'Read at your own pace', priceAmount: '1', capacity: '', modules: [{ title: 'Your private guide', description: 'Download and read the purchased guide.' }] }
const publish = body => session.call('/api/courses', { method: 'POST', body: JSON.stringify({ draft, image: 'creator-home', productType: 'pdf', ...body }) })
assert.equal((await publish({})).status, 422, 'PDF products require an authenticated upload receipt')
assert.equal((await publish({ document: { ...document, size: document.size + 1 } })).status, 422, 'upload metadata cannot be changed')
const otherCreator = await creatorSession(BASE, { name: 'Other PDF creator', walletAddress: creator.publicKey() })
assert.equal((await otherCreator.call('/api/courses', { method: 'POST', body: JSON.stringify({ draft, productType: 'pdf', document }) })).status, 422, 'a different creator cannot attach this upload')
const published = await json(await publish({ document }))
const second = await json(await publish({ document, draft: { ...draft, title: `${draft.title} second` } }))
assert.equal(published.productType, 'pdf')
assert.deepEqual(published.document, { name: document.name, size: pdf.length })
const listing = await json(await fetch(`${BASE}/api/courses/${published.id}`))
assert.ok(!JSON.stringify(listing).includes(document.key), 'public listing must not reveal R2 key')
assert.ok(!JSON.stringify(listing).includes(document.receipt), 'public listing must not reveal upload receipt')
const downloadUrl = `${BASE}/api/courses/${published.id}/document`
assert.equal((await fetch(downloadUrl)).status, 401, 'anonymous download refused')
assert.equal((await fetch(`${downloadUrl}?access=untrusted-token-123456`)).status, 401, 'query tokens are not accepted')
assert.equal((await fetch(downloadUrl, { headers: { authorization: 'Bearer fake-access-token-1234567890' } })).status, 403, 'forged paid token refused')
const storageBase = process.env.NUXT_IMAGE_UPLOAD_URL
if (storageBase) {
  for (const method of ['GET', 'HEAD']) assert.equal((await fetch(`${storageBase.replace(/\/+$/, '')}/${document.key}`, { method })).status, 401, `Worker ${method} is private even with a known R2 key`)
} else console.log('NOTE: set NUXT_IMAGE_UPLOAD_URL to additionally assert direct Worker GET/HEAD denial')

await Promise.all([creator, student].map(async account => {
  const response = await fetch(`https://friendbot.stellar.org?addr=${account.publicKey()}`)
  assert.ok(response.ok, `Testnet friendbot failed: ${response.status}`)
}))
await submit(creator, [Operation.changeTrust({ asset: USDC })])
await submit(student, [Operation.changeTrust({ asset: USDC }), Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: '5000', destination: student.publicKey(), destAsset: USDC, destAmount: '2', path: [] })])
const http = new x402HTTPClient(new x402Client().register('stellar:testnet', new ExactStellarScheme(createEd25519Signer(student.secret(), 'stellar:testnet'))))
const accessUrl = `${BASE}/api/courses/${published.id}/access`
const first = await fetch(accessUrl)
assert.equal(first.status, 402, 'product must retain x402 payment protection')
const required = http.getPaymentRequiredResponse(name => first.headers.get(name), await first.json())
assert.ok(required.accepts.length)
for (const offer of required.accepts) {
  assert.equal(offer.network, 'stellar:testnet')
  assert.equal(offer.scheme, 'exact')
  assert.equal(offer.amount, '10000000', 'sign exactly 1 Testnet USDC')
  assert.equal(offer.payTo, creator.publicKey(), 'pay only the product creator')
}
const payload = await http.createPaymentPayload(required)
const paid = await fetch(accessUrl, { headers: http.encodePaymentSignatureHeader(payload) })
const classroom = await json(paid)
const settlement = http.getPaymentSettleResponse(name => paid.headers.get(name))
assert.match(settlement.transaction, /^[a-f0-9]{64}$/)
console.log(`Settled ${settlement.transaction}, product ${published.id}`)
assert.equal(classroom.enrolment.student, student.publicKey())
assert.equal(await balance(creator.publicKey()), '1.0000000', 'creator received exactly 1 Testnet USDC')
const paidHeaders = { authorization: `Bearer ${classroom.accessToken}` }
assert.equal((await fetch(`${BASE}/api/courses/${second.id}/document`, { headers: paidHeaders })).status, 403, 'paid access is bound to the purchased product')
const downloaded = await fetch(downloadUrl, { headers: paidHeaders })
assert.equal(downloaded.status, 200, downloaded.ok ? '' : await downloaded.text())
assert.equal(downloaded.headers.get('content-type'), 'application/pdf')
assert.match(downloaded.headers.get('content-disposition') ?? '', /^attachment;/)
assert.match(downloaded.headers.get('cache-control') ?? '', /no-store/)
assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf, 'downloaded bytes exactly match the private upload')
assert.equal((await fetch(accessUrl, { headers: paidHeaders })).status, 200, 'paid access reopens without another payment')
const again = await fetch(downloadUrl, { headers: paidHeaders })
assert.deepEqual(Buffer.from(await again.arrayBuffer()), pdf, 'buyer can download again with existing paid token')
assert.equal(await balance(creator.publicKey()), '1.0000000', 'reopening and downloading must not charge twice')
console.log(`PASS: private upload → receipt-bound publish → x402 1 Testnet USDC → exact PDF download. Product ${published.id}, settlement ${settlement.transaction}`)
