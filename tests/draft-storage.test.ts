import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeStoredDraft, encodeStoredDraft, emptyCourseDraft } from '../shared/draft-storage.ts'
import { validateCourseDraft } from '../shared/course.ts'

test('incomplete draft round trips without becoming publishable', () => {
  const draft = emptyCourseDraft()
  assert.deepEqual(decodeStoredDraft(encodeStoredDraft(draft)), draft)
  assert.equal(validateCourseDraft(draft).valid, false)
})

test('edited draft survives save/reload serialization and copies only known fields', () => {
  const draft = { ...emptyCourseDraft(), title: 'My saved workshop', priceAmount: '0.1234567' }
  const encoded = encodeStoredDraft(draft)
  assert.deepEqual(decodeStoredDraft(encoded), draft)
  const restored = decodeStoredDraft(JSON.stringify({ version: 1, draft: { ...draft, recipient: 'untrusted' } }))!
  assert.equal('recipient' in restored, false)
})

test('malformed, oversized and unsupported storage is rejected', () => {
  for (const raw of ['{', 'null', '[]', '{}', 'x'.repeat(500_001), JSON.stringify({ version: 2, draft: emptyCourseDraft() })]) {
    assert.equal(decodeStoredDraft(raw), null)
  }
  for (const patch of [
    { title: 42 }, { description: 'x'.repeat(5001) }, { modules: [] },
    { modules: Array(31).fill({ title: '', description: '' }) },
    { modules: [null] }, { modules: [{ title: 'x'.repeat(101), description: '' }] },
    { modules: [{ title: '', description: 'x'.repeat(2001) }] },
  ]) assert.equal(decodeStoredDraft(JSON.stringify({ version: 1, draft: { ...emptyCourseDraft(), ...patch } })), null)
})

test('capacity accepts u32 maximum and rejects overflow before contract submission', () => {
  const draft = { ...emptyCourseDraft(), capacity: '4294967295' }
  assert.equal(validateCourseDraft(draft).errors.capacity, undefined)
  for (const capacity of ['4294967296', '9'.repeat(10000)]) {
    assert.ok(validateCourseDraft({ ...draft, capacity }).errors.capacity)
  }
})
