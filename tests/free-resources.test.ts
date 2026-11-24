import assert from 'node:assert/strict'
import test from 'node:test'
import { matchFreeResources } from '../shared/free-resources.ts'

test('instrument goals find the music resource', () => {
  assert.ok(matchFreeResources('Tolu wants to learn to play the kora, the West African harp').some(resource => resource.provider === 'musictheory.net'))
})

test('maths aliases match and unrelated goals find nothing', () => {
  assert.ok(matchFreeResources('help my son with math').length > 0)
  assert.deepEqual(matchFreeResources('zzz qqq'), [])
})
