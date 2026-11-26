import test from 'node:test'
import assert from 'node:assert/strict'
import { splitAmount, toUnits, fromUnits } from '../shared/fee.ts'

test('5% of 1 USDC', () => {
  const s = splitAmount('1', 500)
  assert.equal(s.platformUsdc, '0.05')
  assert.equal(s.creatorUsdc, '0.95')
})

test('split always sums to the price, fee rounds down', () => {
  for (const price of ['0.0000001', '0.0000019', '3.33', '19.99', '250', '7.1234567']) {
    const s = splitAmount(price, 500)
    assert.equal(s.platformUnits + s.creatorUnits, toUnits(price))
    assert.ok(s.platformUnits * 10_000n <= toUnits(price) * 500n)
  }
  assert.equal(splitAmount('0.0000019', 500).platformUnits, 0n)
})

test('0% fee and unit round trip', () => {
  assert.equal(splitAmount('12.5', 0).creatorUsdc, '12.5')
  assert.equal(fromUnits(toUnits('19.99')), '19.99')
  assert.equal(toUnits(5), 50_000_000n)
})
