import assert from 'node:assert/strict'
import test from 'node:test'
import { transformUi } from '../app/utils/motion.ts'

async function environment(doc: unknown, reduced: boolean, run: () => Promise<void>) {
  const descriptors = ['document', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: reduced }) } })
  try { await run() } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

test('motion applies actions directly without a DOM or transition support', async () => {
  for (const doc of [undefined, {}]) await environment(doc, false, async () => {
    let applied = 0
    await transformUi(() => { applied++ })
    assert.equal(applied, 1)
  })
})

test('reduced motion bypasses snapshot APIs', async () => {
  await environment({ startViewTransition() { throw new Error('Must not call') } }, true, async () => {
    let applied = 0
    await transformUi(() => { applied++ })
    assert.equal(applied, 1)
  })
})

test('a synchronous snapshot failure still applies the action once', async () => {
  await environment({ startViewTransition() { throw new Error('Unavailable') } }, false, async () => {
    let applied = 0
    await transformUi(() => { applied++ })
    assert.equal(applied, 1)
  })
})

test('a skipped snapshot after its update cannot duplicate the action', async () => {
  await environment({ startViewTransition(update: () => Promise<void>) {
    return { finished: update().then(() => { throw new Error('Snapshot skipped') }) }
  } }, false, async () => {
    let applied = 0
    await transformUi(() => { applied++ })
    assert.equal(applied, 1)
  })
})

test('actions during an active transition stay usable and apply once', async () => {
  let complete!: () => void
  const finishing = new Promise<void>(resolve => { complete = resolve })
  await environment({ startViewTransition(update: () => Promise<void>) {
    return { finished: update().then(() => finishing) }
  } }, false, async () => {
    const actions: string[] = []
    const first = transformUi(() => { actions.push('first') })
    await transformUi(() => { actions.push('second') })
    complete()
    await first
    assert.deepEqual(actions, ['first', 'second'])
  })
})
