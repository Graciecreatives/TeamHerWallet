import assert from 'node:assert/strict'
import test from 'node:test'
import { parseUsdcUnits, validateCourseDraft, type CourseDraft } from '../shared/course.ts'

const validDraft = (): CourseDraft => ({
  title: 'Money basics', description: 'Learn practical money skills.',
  targetAudience: 'New learners', duration: '4 weeks', priceAmount: '12.50',
  capacity: '', modules: [{ title: 'Budgeting', description: 'Create your first budget.' }],
})

test('USDC conversion is exact at seven decimals and int64 boundaries', () => {
  for (const [amount, units] of [
    ['1', '10000000'], ['0.0000001', '1'], ['0.1', '1000000'],
    ['12.3456789', '123456789'], ['0001.20', '12000000'],
    ['922337203685.4775807', '9223372036854775807'],
  ]) assert.equal(parseUsdcUnits(amount!), units)
})

test('USDC rejects invalid, nonpositive, imprecise, or overflowing amounts', () => {
  for (const amount of [
    '', '0', '0.0000000', '-1', '+1', '.1', '1.', '1e3', 'Infinity', 'NaN',
    ' 1', '1 ', '1\n', '1,000', '1_000', '0x10', '１', '1.00000000',
    '0.00000001', '922337203685.4775808', '922337203686', '9'.repeat(10_000),
  ]) assert.equal(parseUsdcUnits(amount), null, amount)
  for (const amount of [null, undefined, 1, 1n, {}, [], Symbol('amount')]) {
    assert.equal(parseUsdcUnits(amount as string), null)
  }
})

test('valid draft accepts unlimited and positive integer capacities without mutation', () => {
  for (const capacity of ['', '1', '200', '001']) {
    const draft = validDraft()
    draft.capacity = capacity
    const before = structuredClone(draft)
    assert.deepEqual(validateCourseDraft(draft), { valid: true, errors: {} })
    assert.deepEqual(draft, before)
  }
})

test('capacity rejects zero, negative, fractional, formatted, and non-string values', () => {
  for (const capacity of ['0', '000', '-1', '+1', '1.5', '1e2', ' ', ' 1', '1\n', 1, null, undefined, {}]) {
    const result = validateCourseDraft({ ...validDraft(), capacity })
    assert.equal(result.valid, false)
    assert.ok(result.errors.capacity, String(capacity))
  }
})

test('course text accepts inclusive boundaries and rejects wrong types and lengths', () => {
  for (const [field, min, max] of [
    ['title', 5, 100], ['description', 1, 5000], ['targetAudience', 1, 500], ['duration', 1, 100],
  ] as const) {
    for (const length of [min, max]) {
      assert.equal(validateCourseDraft({ ...validDraft(), [field]: 'x'.repeat(length) }).valid, true)
    }
    for (const value of ['x'.repeat(min - 1), 'x'.repeat(max + 1), '   ', null, 4, {}, []]) {
      assert.ok(validateCourseDraft({ ...validDraft(), [field]: value }).errors[field], field)
    }
  }
  assert.equal(validateCourseDraft({ ...validDraft(), title: '  abcde  ' }).valid, true)
})

test('unknown and partial runtime inputs return errors instead of throwing', () => {
  for (const input of [undefined, null, false, 1, 'draft', [], {}, Symbol('draft'), Object.create(null)]) {
    const result = validateCourseDraft(input)
    assert.equal(result.valid, false)
    for (const key of ['title', 'description', 'targetAudience', 'duration', 'priceAmount', 'capacity', 'modules']) {
      assert.ok(result.errors[key], key)
    }
  }
  assert.ok(validateCourseDraft({ ...validDraft(), priceAmount: 10 }).errors.priceAmount)
})

test('modules enforce counts, object shape, nonempty text, and inclusive text caps', () => {
  const draft = validDraft()
  for (const count of [1, 30]) {
    assert.equal(validateCourseDraft({ ...draft, modules: Array.from({ length: count }, () => draft.modules[0]) }).valid, true)
  }
  for (const modules of [undefined, null, {}, [], Array(31).fill(draft.modules[0])]) {
    assert.ok(validateCourseDraft({ ...draft, modules }).errors.modules)
  }
  for (const module of [null, 1, 'module', [], {}, { title: ' ', description: ' ' }]) {
    const result = validateCourseDraft({ ...draft, modules: [module] })
    assert.ok(result.errors['modules.0.title'])
    assert.ok(result.errors['modules.0.description'])
  }
  assert.ok(validateCourseDraft({ ...draft, modules: Array(1) }).errors['modules.0.title'])
  assert.equal(validateCourseDraft({ ...draft, modules: [{ title: 'x'.repeat(100), description: 'x'.repeat(2000) }] }).valid, true)
  const result = validateCourseDraft({ ...draft, modules: [{ title: 'x'.repeat(101), description: 'x'.repeat(2001) }] })
  assert.ok(result.errors['modules.0.title'])
  assert.ok(result.errors['modules.0.description'])
})
