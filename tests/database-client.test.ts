import assert from 'node:assert/strict'
import test from 'node:test'
import { createDatabase, closeDatabase } from '../server/database/client.ts'

test('database operations require an explicit PostgreSQL URL', () => {
  for (const value of [undefined, '', '   ']) assert.throws(() => createDatabase(value), /DATABASE_URL is required/)
  assert.throws(() => createDatabase('https://example.test/database'), /must use postgres/)
})

test('invalid database URLs do not appear in error messages', () => {
  const secret = 'not-a-url:private-password'
  assert.throws(() => createDatabase(secret), error => {
    assert.ok(error instanceof Error)
    assert.equal(error.message.includes('private-password'), false)
    return true
  })
})

test('client construction and shutdown are lazy without a running server', async () => {
  const sql = createDatabase('postgresql://test:test@127.0.0.1:1/learnpurse')
  await sql.end({ timeout: 1 })
  await closeDatabase()
})
