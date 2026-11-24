// Checks that publishing and the creator dashboard are protected, and that a creator cannot publish a
// class that pays someone else's wallet. Usage: node scripts/auth-gate-check.mjs [baseUrl]
import assert from 'node:assert/strict'
import { Keypair } from '@stellar/stellar-sdk'
import { creatorSession } from './lib/creator-session.mjs'
const BASE = process.argv[2] ?? 'http://localhost:3000'
const draft = { title: 'Auth gate test', description: 'Checks the publish gate.', targetAudience: 'Testers', duration: '1 week', priceAmount: '1', capacity: '5', modules: [{ title: 'One', description: 'First.' }] }

const anonymous = await fetch(`${BASE}/api/courses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft, payTo: Keypair.random().publicKey(), creatorName: 'Anyone' }) })
assert.equal(anonymous.status, 401, 'publishing without a session is refused'); console.log('  ✓ publish without sign in → 401')
assert.equal((await fetch(`${BASE}/api/courses?mine=1`)).status, 401); console.log('  ✓ dashboard without sign in → 401')
const catalogue = await (await fetch(`${BASE}/api/courses`)).json()
assert.ok(Array.isArray(catalogue) && catalogue.every(course => course.revenue === undefined && course.recent === undefined)); console.log('  ✓ public catalogue has no revenue or payer data')

const wallet = Keypair.random().publicKey()
const noWallet = await creatorSession(BASE, { name: 'No wallet yet' })
assert.equal((await noWallet.call('/api/courses', { method: 'POST', body: JSON.stringify({ draft }) })).status, 422); console.log('  ✓ creator without a wallet cannot publish')
assert.equal((await noWallet.call('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ walletAddress: wallet }) })).status, 200); console.log('  ✓ creator adds a wallet to the account')

const attacker = Keypair.random().publicKey()
const response = await noWallet.call('/api/courses', { method: 'POST', body: JSON.stringify({ draft, payTo: attacker, creatorName: 'Someone else' }) })
const course = await response.json()
assert.equal(response.status, 201)
assert.equal(course.payTo, wallet, 'payTo always comes from the account'); assert.equal(course.creatorName, 'No wallet yet')
console.log('  ✓ payTo and creator name come from the account, not the request')
const mine = await (await noWallet.call('/api/courses?mine=1')).json()
assert.deepEqual(mine.map(entry => entry.id), [course.id]); console.log('  ✓ dashboard shows only this creator’s classes')
const other = await creatorSession(BASE, { name: 'Other creator', walletAddress: Keypair.random().publicKey() })
assert.equal((await (await other.call('/api/courses?mine=1')).json()).length, 0); console.log('  ✓ another creator sees none of them')
const logout = await noWallet.call('/api/auth/logout', { method: 'POST' }); assert.ok(logout.ok)
assert.equal((await noWallet.call('/api/courses?mine=1')).status, 401); console.log('  ✓ after logout the session no longer works')
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: noWallet.email, password: 'wrong password 123' }) })
assert.equal(login.status, 401); console.log('  ✓ wrong password → 401')
console.log('PASS: auth gate', course.id)
