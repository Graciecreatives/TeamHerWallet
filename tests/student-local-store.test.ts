import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stripTypeScriptTypes } from 'node:module'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

const source = stripTypeScriptTypes((await readFile(new URL('../server/utils/student-store.ts', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '')).replace(/^export /gm, '')
function loadStore(storage: any) {
  return new Function('createHash', 'cloud', 'useStorage', source + '\nreturn { savedChat, saveChatTurn, clearSavedChat, studentProgress, updateProgress, notificationReads, markNotificationReads, withStudentLock }')(
    createHash, () => { throw new Error('Development must not call production storage') }, () => storage,
  )
}

test('development student history and progress survive storage recreation and stay account-private', async () => {
  const path = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'student-store-'))
  let storage = createStorage({ driver: fsDriver({ base: path }) })
  try {
    let store = loadStore(storage)
    const turn = { id: randomUUID(), message: 'Teach Yoruba', reply: 'Start with greetings.', courses: [] }
    await store.withStudentLock('ada', () => store.saveChatTurn('ada', turn))
    await store.withStudentLock('ada', () => store.saveChatTurn('ada', turn))
    await store.withStudentLock('ada', () => store.updateProgress('ada', 'yoruba-class', 0, true))
    await store.withStudentLock('ada', () => store.markNotificationReads('ada', ['enrolled:tx']))
    await storage.dispose()
    storage = createStorage({ driver: fsDriver({ base: path }) })
    store = loadStore(storage)
    assert.equal((await store.savedChat('ada')).length, 2)
    assert.equal((await store.studentProgress('ada'))[0].moduleIndex, 0)
    assert.deepEqual(await store.notificationReads('ada'), ['enrolled:tx'])
    assert.deepEqual(await store.savedChat('other-account'), [])
    await store.withStudentLock('ada', () => store.clearSavedChat('ada'))
    assert.deepEqual(await store.savedChat('ada'), [])
    assert.equal((await store.studentProgress('ada')).length, 1, 'clearing chat preserves progress')
  } finally { await storage.dispose(); await rm(path, { recursive: true, force: true }) }
})
