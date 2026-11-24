import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { creatorSession } from './lib/creator-session.mjs'
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { createEd25519Signer } from '@x402/stellar'
import { ExactStellarScheme } from '@x402/stellar/exact/client'
const BASE = process.argv[2] || 'http://localhost:3000'
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const usdc = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
const creator = Keypair.random(), parent = Keypair.random()
async function submit(pair, ops) {
  const account = await horizon.loadAccount(pair.publicKey())
  const builder = new TransactionBuilder(account, { fee: '1000', networkPassphrase: Networks.TESTNET }).setTimeout(60)
  ops.forEach(op => builder.addOperation(op)); const tx = builder.build(); tx.sign(pair); return horizon.submitTransaction(tx)
}
await Promise.all([creator, parent].map(async pair => { const r = await fetch(`https://friendbot.stellar.org?addr=${pair.publicKey()}`); assert.ok(r.ok) }))
await submit(creator, [Operation.changeTrust({ asset: usdc })])
await submit(parent, [Operation.changeTrust({ asset: usdc }), Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: '5000', destination: parent.publicKey(), destAsset: usdc, destAmount: '2', path: [] })])
const teacher = await creatorSession(BASE, { name: 'Classroom Teacher', walletAddress: creator.publicKey() })
const stranger = await creatorSession(BASE, { name: 'Other teacher', walletAddress: creator.publicKey() })
const draft = { title: 'Live Yoruba Classroom Check', description: 'A live Yoruba class with a teacher and private messages.', targetAudience: 'Children and their parents', duration: '1 week', priceAmount: '1', capacity: '5', modules: [{ title: 'Greetings', description: 'Learn e kaaro and practise with your teacher.' }] }
const schedule = { mode: 'live', startsAt: '2026-12-01T16:00:00+01:00', timezone: 'Africa/Lagos', meetingUrl: 'https://meet.google.com/test-classroom', instructions: 'Bring a notebook. Join five minutes early. Parent supervision is welcome.' }
const published = await teacher.call('/api/courses', { method: 'POST', body: JSON.stringify({ draft, classroom: schedule }) })
const listing = await published.json(); assert.equal(published.status, 201, JSON.stringify(listing))
const path = `/api/courses/${listing.id}`
const call = (suffix, options = {}) => fetch(`${BASE}${path}${suffix}`, options)
const publicSchedule = await (await call('/schedule')).json()
assert.equal(publicSchedule.startsAt, '2026-12-01T15:00:00.000Z'); assert.ok(!publicSchedule.meetingUrl)
assert.equal((await call('/classroom')).status, 403)
assert.equal((await stranger.call(`${path}/classroom`)).status, 403)
assert.equal((await call('/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'unauthorized' }) })).status, 403)
console.log('PASS unpublished meeting details and classroom protected before payment')
const http = new x402HTTPClient(new x402Client().register('stellar:*', new ExactStellarScheme(createEd25519Signer(parent.secret(), 'stellar:testnet'))))
const unpaid = await call('/access'); assert.equal(unpaid.status, 402)
const offer = http.getPaymentRequiredResponse(name => unpaid.headers.get(name), await unpaid.json())
const payload = await http.createPaymentPayload(offer)
const paid = await call('/access', { headers: http.encodePaymentSignatureHeader(payload) })
const receipt = await paid.json(); assert.equal(paid.status, 200, JSON.stringify(receipt))
const headers = { authorization: `Bearer ${receipt.accessToken}`, 'content-type': 'application/json' }
const room = await (await call('/classroom', { headers })).json()
assert.equal(room.schedule.meetingUrl, schedule.meetingUrl)
assert.equal(room.schedule.instructions, schedule.instructions)
assert.ok(!room.students)
const sent = await call('/messages', { method: 'POST', headers, body: JSON.stringify({ message: 'My daughter Ada will attend. What should she prepare?', student: creator.publicKey() }) })
assert.equal(sent.status, 201, await sent.text())
const inbox = await (await teacher.call(`${path}/classroom`)).json()
assert.equal(inbox.students[0], parent.publicKey())
assert.equal(inbox.messages[0].student, parent.publicKey(), 'student field cannot impersonate another enrollment')
const reply = await teacher.call(`${path}/messages`, { method: 'POST', body: JSON.stringify({ student: parent.publicKey(), message: 'Welcome Ada! Bring a notebook and practise the first greeting.' }) })
assert.equal(reply.status, 201, await reply.text())
const refreshed = await (await call('/classroom', { headers })).json()
assert.equal(refreshed.messages.length, 2); assert.equal(refreshed.messages[1].author, 'teacher')
assert.equal((await call('/classroom', { method: 'PATCH', headers, body: JSON.stringify(schedule) })).status, 403)
const update = await teacher.call(`${path}/classroom`, { method: 'PATCH', body: JSON.stringify({ ...schedule, instructions: 'Updated: please bring two pencils.' }) })
assert.equal(update.status, 200)
console.log('PASS real x402 payment auto-enrols, opens classroom, and teacher/parent exchange private messages')
console.log('transaction', receipt.enrolment.transaction)
if (process.env.JCODE_SCRATCH_DIR) await writeFile(`${process.env.JCODE_SCRATCH_DIR}/classroom-evidence.json`, JSON.stringify({ id: listing.id, token: receipt.accessToken, cookie: teacher.cookie, transaction: receipt.enrolment.transaction }))
