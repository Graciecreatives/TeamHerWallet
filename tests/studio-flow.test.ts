import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCourseDraft } from '../shared/course.ts'
import { emptyCourseDraft } from '../shared/draft-storage.ts'
import { completedStepCount, errorsForStep, firstIncompleteStep, hasDraftContent, moveModule, starterExamples, studioSteps } from '../shared/studio-flow.ts'

function validDraft() {
  return structuredClone(starterExamples[0]!.draft)
}

test('studio steps have ordered unique ids and readable labels', () => {
  assert.deepEqual(studioSteps.map(step => step.id), ['details', 'curriculum', 'pricing', 'review'])
  for (const step of studioSteps) {
    assert.ok(step.label.trim())
    assert.ok(step.shortLabel.trim())
  }
})

test('step errors preserve exact validator messages and include only their fields', () => {
  const draft = { ...emptyCourseDraft(), capacity: '0' }
  const before = structuredClone(draft)
  assert.deepEqual(errorsForStep(draft, 'details'), {
    title: 'Title must contain 5-100 characters.',
    description: 'Description must contain 1-5000 characters.',
    targetAudience: 'Target audience must contain 1-500 characters.',
    duration: 'Duration must contain 1-100 characters.',
  })
  assert.deepEqual(errorsForStep(draft, 'curriculum'), {
    'modules.0.title': 'Module title must contain 1-100 characters.',
    'modules.0.description': 'Module description must contain 1-2000 characters.',
  })
  assert.deepEqual(errorsForStep(draft, 'pricing'), {
    priceAmount: 'Enter a positive USDC amount with at most 7 decimal places within the Stellar int64 limit.',
    capacity: 'Capacity must be empty for unlimited enrollment or a whole number from 1 to 4294967295.',
  })
  assert.deepEqual(errorsForStep(draft, 'review'), validateCourseDraft(draft).errors)
  assert.deepEqual(draft, before)
  for (const modules of [[], Array.from({ length: 31 }, () => ({ title: 'Module', description: 'Description' }))]) {
    assert.deepEqual(errorsForStep({ ...draft, modules }, 'curriculum'), { modules: 'Include between 1 and 30 modules.' })
  }
})

test('first incomplete step respects order and completed count includes nonconsecutive valid steps', () => {
  const draft = emptyCourseDraft()
  assert.equal(firstIncompleteStep(draft), 'details')
  assert.equal(completedStepCount(draft), 0)
  draft.priceAmount = '10'
  assert.equal(completedStepCount(draft), 1)
  Object.assign(draft, { title: 'Valid title', description: 'A course', targetAudience: 'Beginners', duration: '1 hour' })
  assert.equal(firstIncompleteStep(draft), 'curriculum')
  assert.equal(completedStepCount(draft), 2)
  draft.modules = [{ title: 'Start here', description: 'Learn the basics' }]
  draft.priceAmount = ''
  assert.equal(firstIncompleteStep(draft), 'pricing')
  assert.equal(completedStepCount(draft), 2)
  draft.priceAmount = '10'
  assert.equal(firstIncompleteStep(draft), 'review')
  assert.equal(completedStepCount(draft), 3)
})

test('three labelled starter examples are valid complete independent drafts', () => {
  assert.deepEqual(starterExamples.map(example => example.id), ['workshop', 'short-course', 'guided-program'])
  for (const example of starterExamples) {
    assert.ok(example.name.trim())
    assert.ok(example.description.trim())
    assert.deepEqual(validateCourseDraft(example.draft), { valid: true, errors: {} })
    assert.equal(firstIncompleteStep(example.draft), 'review')
    assert.equal(completedStepCount(example.draft), 3)
    assert.equal(hasDraftContent(example.draft), true)
    assert.notEqual(example.draft.modules, starterExamples.find(other => other !== example)!.draft.modules)
  }
})

test('content detection checks every scalar and every module field, not validity', () => {
  assert.equal(hasDraftContent(emptyCourseDraft()), false)
  for (const field of ['title', 'description', 'targetAudience', 'duration', 'priceAmount', 'capacity'] as const) {
    assert.equal(hasDraftContent({ ...emptyCourseDraft(), [field]: '  x  ' }), true, field)
    assert.equal(hasDraftContent({ ...emptyCourseDraft(), [field]: ' \n\t ' }), false, field)
  }
  for (const field of ['title', 'description'] as const) {
    const draft = emptyCourseDraft()
    draft.modules.push({ title: '', description: '', [field]: 'x' })
    assert.equal(hasDraftContent(draft), true, field)
    draft.modules[1]![field] = ' \t '
    assert.equal(hasDraftContent(draft), false, field)
  }
  assert.equal(hasDraftContent({ ...emptyCourseDraft(), modules: [] }), false)
})

test('module moves preserve array identity, object identity, contents and other draft fields', () => {
  const draft = validDraft()
  draft.modules.push({ title: 'Third module', description: 'Third description' })
  const array = draft.modules
  const [first, second, third] = array
  const before = structuredClone(draft)
  assert.equal(moveModule(draft, 0, 1), true)
  assert.equal(draft.modules, array)
  assert.deepEqual(array, [second, first, third])
  assert.equal(array[0], second)
  assert.equal(array[1], first)
  assert.equal(moveModule(draft, 1, -1), true)
  assert.deepEqual(draft, before)
  assert.equal(moveModule(draft, 2, -1), true)
  assert.deepEqual(array, [first, third, second])
})

test('out of bounds and malformed moves are no-ops', () => {
  for (const modules of [[], [{ title: 'Only', description: 'One module' }], validDraft().modules]) {
    const draft = { ...validDraft(), modules }
    const before = structuredClone(draft)
    for (const [index, direction] of [[-1, 1], [modules.length, -1], [0, -1], [modules.length - 1, 1], [0.5, 1], [NaN, 1], [Infinity, -1], [-Infinity, 1]] as const) {
      assert.equal(moveModule(draft, index, direction), false)
      assert.deepEqual(draft, before)
    }
    assert.equal(moveModule(draft, 0, 0 as 1), false)
    assert.deepEqual(draft, before)
  }
})
