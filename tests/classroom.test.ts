import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanSchedule } from '../shared/classroom.ts'
test('self-paced defaults are explicit', () => { assert.equal(cleanSchedule({}).mode, 'self-paced') })
test('live schedule requires a start, safe join link and instructions', () => {
  assert.throws(() => cleanSchedule({ mode: 'live' }))
  assert.throws(() => cleanSchedule({ meetingUrl: 'javascript:alert(1)' }))
  assert.throws(() => cleanSchedule({ timezone: 'invalid/zone' }))
  assert.throws(() => cleanSchedule({ startsAt: 'nonsense' }))
  assert.throws(() => cleanSchedule({ meetingUrl: 'https://user:password@example.com' }))
  const value = cleanSchedule({ mode: 'live', startsAt: '2026-12-01T16:00:00+01:00', timezone: 'Africa/Lagos', meetingUrl: 'https://meet.google.com/abc-defg-hij', instructions: 'Bring a notebook.' })
  assert.equal(value.startsAt, '2026-12-01T15:00:00.000Z')
  assert.equal(value.instructions, 'Bring a notebook.')
})
