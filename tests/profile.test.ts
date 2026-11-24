import test from 'node:test'
import assert from 'node:assert/strict'
import { isStellarPublicKey, validateProfile, decodeProfile, shortAddress } from '../shared/profile.ts'

const VALID = 'GAFTAVL2T7COSDRTLB62FR7MCE3FXAFFZLXRIOK6QOUM34QXHRQYMVIT'
const KNOWN = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7'
const profile = { name: 'Amara Okafor', email: 'amara@example.com', focus: 'Money & budgeting', walletAddress: VALID }

test('accepts real Stellar account public keys including checksum', () => {
  assert.equal(isStellarPublicKey(VALID), true)
  assert.equal(isStellarPublicKey(KNOWN), true)
})

test('rejects wrong prefix, length, alphabet, version and checksum', () => {
  assert.equal(isStellarPublicKey(VALID.slice(0, -1) + (VALID.endsWith('T') ? 'U' : 'T')), false, 'checksum flip')
  assert.equal(isStellarPublicKey('S' + VALID.slice(1)), false, 'secret-key prefix')
  assert.equal(isStellarPublicKey(VALID.slice(0, 55)), false)
  assert.equal(isStellarPublicKey(VALID.toLowerCase()), false)
  assert.equal(isStellarPublicKey(VALID.slice(0, 10) + '0' + VALID.slice(11)), false, 'non-base32 digit')
  for (const value of [undefined, null, 42, {}, '']) assert.equal(isStellarPublicKey(value), false)
})

test('profile validation requires name, email and focus, wallet optional', () => {
  assert.deepEqual(validateProfile(profile), {})
  assert.deepEqual(validateProfile({ ...profile, walletAddress: '' }), {})
  const errors = validateProfile({ name: ' ', email: 'nope', focus: 'Astrology', walletAddress: 'GBAD' })
  assert.deepEqual(Object.keys(errors).sort(), ['email', 'focus', 'name', 'walletAddress'])
  assert.ok(validateProfile({ ...profile, name: 'x'.repeat(61) }).name)
})

test('stored profiles decode only when fully valid', () => {
  assert.deepEqual(decodeProfile(JSON.stringify(profile)), profile)
  assert.equal(decodeProfile(JSON.stringify({ ...profile, walletAddress: 'GBAD' })), null)
  assert.equal(decodeProfile('{broken'), null)
  assert.equal(decodeProfile(null), null)
  assert.equal(decodeProfile('x'.repeat(5000)), null)
  const extra = decodeProfile(JSON.stringify({ ...profile, secret: 'SXXX' }))
  assert.equal(extra && 'secret' in extra, false, 'unknown fields are dropped')
})

test('short address keeps both ends', () => {
  assert.equal(shortAddress(VALID), 'GAFT…MVIT')
  assert.equal(shortAddress('short'), 'short')
})
