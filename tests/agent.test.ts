import assert from 'node:assert/strict'
import test from 'node:test'
import { extractCapacity, extractDuration, extractPrice, extractTopic, missingCourseDetails, planCourseFromBrief, reconcileAgentDraft } from '../shared/agent.ts'
import { validateCourseDraft } from '../shared/course.ts'

test('the hackathon brief becomes a valid, correctly priced class', () => {
  const plan = planCourseFromBrief('I want to create a forex beginners’ class. It costs $15, and I want to teach 30 students.')
  assert.equal(plan.draft.title, 'Forex for Beginners')
  assert.equal(plan.draft.priceAmount, '15')
  assert.equal(plan.draft.capacity, '30')
  assert.ok(validateCourseDraft(plan.draft).valid)
  assert.deepEqual(plan.understood.find(item => item.label === 'Price'), { label: 'Price', value: '15 USDC' })
})

test('the programme brief keeps subject, length, price and size', () => {
  const plan = planCourseFromBrief('I teach forex trading. I want to launch a 2-week beginner programme for $15. I want to admit 30 students.')
  assert.equal(plan.draft.title, 'Forex Trading for Beginners')
  assert.equal(plan.draft.duration, '2 weeks')
  assert.equal(plan.draft.modules.length, 4)
  assert.equal(plan.assumptions.length, 0)
})

test('extractors handle words, currencies and decimals without guessing', () => {
  assert.equal(extractPrice('20 USDC'), '20')
  assert.equal(extractPrice('price is 12.50'), '12.5')
  assert.equal(extractPrice('for 30 students'), null, 'A seat count is not a price')
  assert.equal(extractCapacity('up to twelve learners'), '12')
  assert.equal(extractDuration('a 3-session workshop'), '3 sessions')
  assert.equal(extractTopic('A yoga workshop for 25 dollars'), 'yoga')
})

test('missing details fall back to safe, disclosed defaults', () => {
  const plan = planCourseFromBrief('pottery class')
  assert.equal(plan.draft.title, 'Pottery for Beginners')
  assert.equal(plan.draft.priceAmount, '10')
  assert.equal(plan.draft.capacity, '')
  assert.ok(plan.assumptions.some(note => /price/.test(note)))
  assert.ok(validateCourseDraft(plan.draft).valid)
})

test('agent reports missing details and understands unlimited enrolment', () => {
  assert.deepEqual(missingCourseDetails('I teach pottery'), [
    { key: 'price', label: 'Price', question: 'What should students pay in USDC?' },
    { key: 'duration', label: 'Length', question: 'How long is the class, for example 3 weeks?' },
    { key: 'capacity', label: 'Class size', question: 'How many students can join, or should enrolment be unlimited?' },
  ])
  assert.deepEqual(missingCourseDetails('A pottery class for 15 USDC, 2 weeks, with unlimited enrolment'), [])
})

test('model output is validated and the creator’s numbers always win', () => {
  const model = { ...planCourseFromBrief('baking class').draft, priceAmount: '99', capacity: '500' }
  const reconciled = reconcileAgentDraft(model, 'baking, $25, 12 students')
  assert.equal(reconciled?.priceAmount, '25')
  assert.equal(reconciled?.capacity, '12')
  assert.equal(reconcileAgentDraft({ title: 'x' }, 'anything'), null)
})
