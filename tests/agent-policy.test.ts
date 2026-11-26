import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanPolicy, needsApproval, ownedCourses, pendingApprovals, policyBlock, spentFrom } from '../shared/agent-policy.ts'

const policy = { perClassMax: 5, totalBudget: 6, approvalAbove: 3, maxPerRun: 2 }

test('per-class limit and total budget block payments', () => {
  assert.equal(policyBlock(policy, 2, 0), null)
  assert.match(policyBlock(policy, 5.5, 0)!, /per-class/)
  assert.match(policyBlock(policy, 5, 2)!, /over the 6 USDC budget/)
  assert.equal(policyBlock(policy, 4, 2), null, 'exactly reaching the budget is allowed')
  assert.match(policyBlock(policy, 0, 0)!, /no valid price/)
  assert.match(policyBlock(policy, Number.NaN, 0)!, /no valid price/)
})

test('approval threshold', () => {
  assert.equal(needsApproval(policy, 3), false)
  assert.equal(needsApproval(policy, 3.01), true)
  assert.equal(needsApproval({ ...policy, approvalAbove: 0 }, 0.5), true)
  assert.equal(needsApproval({ ...policy, autoApprove: true }, 5), false, 'standing approval skips asking')
})

test('cleanPolicy clamps bad input and keeps per-class within budget', () => {
  assert.deepEqual(cleanPolicy({ perClassMax: 50, totalBudget: 10, approvalAbove: -1, maxPerRun: 99 }), { perClassMax: 10, totalBudget: 10, approvalAbove: 3, maxPerRun: 5, autoApprove: false })
  assert.deepEqual(cleanPolicy({ perClassMax: 'x', totalBudget: '', maxPerRun: 0 }), { perClassMax: 5, totalBudget: 10, approvalAbove: 3, maxPerRun: 1, autoApprove: false })
  assert.equal(cleanPolicy({ autoApprove: true }).autoApprove, true)
  assert.equal(cleanPolicy({ perClassMax: 2 }, { ...policy, autoApprove: true }).autoApprove, true, 'patches keep standing approval')
  assert.equal(cleanPolicy({ totalBudget: 1e9 }).totalBudget, 1000)
  assert.equal(cleanPolicy({ perClassMax: 2 }, policy).totalBudget, 6, 'patches keep previous values')
})

test('spending, library and pending approvals come from the event log', () => {
  const events = [ // newest first
    { kind: 'paid', amount: 4, courseId: 'b' },
    { kind: 'approved', courseId: 'b' },
    { kind: 'approval_needed', amount: 4, courseId: 'c' },
    { kind: 'approval_needed', amount: 4, courseId: 'b' },
    { kind: 'paid', amount: 2, courseId: 'a' },
    { kind: 'failed', courseId: 'd' },
  ]
  assert.equal(spentFrom(events), 6)
  assert.deepEqual([...ownedCourses(events)].sort(), ['a', 'b'])
  assert.deepEqual(pendingApprovals(events).map(event => event.courseId), ['c'])
  assert.deepEqual(pendingApprovals([{ kind: 'declined', courseId: 'c' }, ...events]).length, 0)
})

test('free resources match common subjects and never invent links', async () => {
  const { matchFreeResources, FREE_RESOURCES } = await import('../shared/free-resources.ts')
  assert.ok(matchFreeResources('mathematics').some(resource => /khan/i.test(resource.title)))
  assert.ok(matchFreeResources('my son wants to learn coding').length > 0)
  assert.deepEqual(matchFreeResources('zzzz qqqq'), [])
  for (const resource of FREE_RESOURCES) assert.match(resource.url, /^https:\/\//)
})

test('a payment that fails after approval can be approved again', () => {
  const events = [ // newest first
    { kind: 'failed', courseId: 'x' },
    { kind: 'approved', courseId: 'x' },
    { kind: 'approval_needed', amount: 4, courseId: 'x' },
  ]
  assert.deepEqual(pendingApprovals(events).map(event => event.courseId), ['x'])
  assert.deepEqual(pendingApprovals([{ kind: 'paid', amount: 4, courseId: 'x' }, ...events]), [])
  assert.deepEqual(pendingApprovals([{ kind: 'failed', courseId: 'y' }]), [], 'failures without a request are not approvals')
})
