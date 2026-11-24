import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, statSync } from 'node:fs'
import { courseShowcases, landingQuestions } from '../shared/landing.ts'
import { validateCourseDraft } from '../shared/course.ts'

test('each illustrative course has a valid, distinct complete curriculum', () => {
  assert.equal(new Set(courseShowcases.map(course => course.id)).size, 3)
  for (const course of courseShowcases) {
    assert.equal(validateCourseDraft(course.draft).valid, true, course.id)
    assert.ok(course.alt.length > 20)
    assert.ok(course.category.length > 5)
  }
})

test('local responsive photographs are actual WebP assets with bounded transfer size', () => {
  const files = ['creator-workspace-640', 'creator-workspace-1200', 'creator-home-480', 'creator-home-960', 'pottery-480', 'pottery-960']
  for (const file of files) {
    const url = new URL(`../public/images/${file}.webp`, import.meta.url)
    const data = readFileSync(url)
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', file)
    assert.equal(data.toString('ascii', 8, 12), 'WEBP', file)
    assert.ok(statSync(url).size < 250_000, `${file} must remain below 250 KB`)
  }
})

test('questions disclose local-only identity, Testnet-only payments and key safety', () => {
  assert.equal(new Set(landingQuestions.map(item => item.question)).size, landingQuestions.length)
  const text = landingQuestions.map(item => item.answer).join(' ')
  assert.match(text, /creator account uses an email and password/)
  assert.match(text, /Stellar Testnet/)
  assert.match(text, /no real value/)
  assert.match(text, /Never enter a secret key/)
})
