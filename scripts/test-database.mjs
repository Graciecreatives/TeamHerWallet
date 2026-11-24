import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDatabase } from '../server/database/client.ts'
import { migrate } from './lib/migrations.mjs'

const exec = promisify(execFile)
let directory, sql, bin, started = false
try {
  bin = process.env.PG_BIN
  if (!bin) {
    for (const candidate of ['/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin']) {
      try { await access(join(candidate, 'initdb')); bin = candidate; break } catch {}
    }
  }
  const binary = name => bin ? join(bin, name) : name
  const root = process.env.JCODE_SCRATCH_DIR || tmpdir()
  directory = await mkdtemp(join(root, 'learnpurse-pg-test-'))
  const data = join(directory, 'data')
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  // This isolated test cluster is bound to loopback, never a supplied/user database.
  await exec(binary('initdb'), ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust'])
  await exec(binary('pg_ctl'), ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory} -F`, '-w', 'start'])
  started = true
  const connectionUrl = `postgresql://${encodeURIComponent(process.env.USER || 'dev')}@127.0.0.1:${port}/postgres`
  sql = createDatabase(connectionUrl, 2)
  const initial = await Promise.all([migrate(sql), migrate(sql)])
  assert.deepEqual(initial.flat(), ['0001_initial.sql', '0002_payment_policies.sql', '0003_auth_credentials.sql', '0004_profile_focus.sql'])
  assert.deepEqual(await migrate(sql), [])
  assert.deepEqual(await Promise.all([migrate(sql), migrate(sql)]), [[], []])
  const cliEnvironment = { ...process.env, DATABASE_URL: connectionUrl, DATABASE_MIGRATION_URL: '' }
  const checked = await exec(process.execPath, ['scripts/db-check.mjs'], { env: cliEnvironment })
  assert.match(checked.stdout, /connection successful/)
  const migrated = await exec(process.execPath, ['scripts/db-migrate.mjs'], { env: cliEnvironment })
  assert.match(migrated.stdout, /up to date/)

  const [creator] = await sql`INSERT INTO users(email) VALUES ('creator@example.test') RETURNING id`
  const [student] = await sql`INSERT INTO users(email) VALUES ('student@example.test') RETURNING id`
  const [course] = await sql`INSERT INTO courses(creator_id, title, price_units) VALUES (${creator.id}, 'Exact amounts', '9223372036854775807') RETURNING id, price_units`
  assert.equal(course.price_units, '9223372036854775807')
  await assert.rejects(sql`UPDATE courses SET price_units = -1 WHERE id = ${course.id}`, { code: '23514' })
  await assert.rejects(sql`UPDATE courses SET capacity = 4294967296 WHERE id = ${course.id}`, { code: '23514' })
  await assert.rejects(sql`UPDATE courses SET status = 'published' WHERE id = ${course.id}`, { code: '23514' })
  await assert.rejects(sql`INSERT INTO courses(creator_id) VALUES ('00000000-0000-0000-0000-000000000000')`, { code: '23503' })
  const [intent] = await sql`INSERT INTO purchase_intents(course_id, student_id, student_address, expected_amount, asset_address, recipient_address, network, idempotency_key, expires_at) VALUES (${course.id}, ${student.id}, 'test-student', 100, 'test-asset', 'test-recipient', 'TESTNET', 'unique-intent', now() + interval '1 hour') RETURNING id`
  await sql`INSERT INTO payments(purchase_intent_id, tx_hash, payment_reference, amount_units, asset_address, network, facilitator_status) VALUES (${intent.id}, 'test-tx', 'test-reference', 100, 'test-asset', 'TESTNET', 'settled')`
  await assert.rejects(sql`INSERT INTO payments(purchase_intent_id, tx_hash, payment_reference, amount_units, asset_address, network, facilitator_status) VALUES (${intent.id}, 'test-tx2', 'test-reference2', 100, 'test-asset', 'TESTNET', 'settled')`, { code: '23505' })

  const migrationDirectory = join(directory, 'migrations')
  await mkdir(migrationDirectory)
  const source = await readFile(new URL('../database/migrations/0001_initial.sql', import.meta.url), 'utf8')
  await writeFile(join(migrationDirectory, '0001_initial.sql'), `${source}\n-- tampered`)
  await assert.rejects(migrate(sql, migrationDirectory), /Applied migration was changed/)
  await writeFile(join(migrationDirectory, '0001_initial.sql'), source)
  await writeFile(join(migrationDirectory, '0002_invalid.sql'), 'CREATE TABLE must_rollback(id integer); SELECT * FROM table_that_does_not_exist;')
  await assert.rejects(migrate(sql, migrationDirectory), { code: '42P01' })
  const [rollback] = await sql`SELECT to_regclass('must_rollback') AS table_name`
  assert.equal(rollback.table_name, null)
  const [ledger] = await sql`SELECT count(*)::integer AS count FROM schema_migrations`
  assert.equal(ledger.count, 1)
  console.log('PASS: real PostgreSQL migrations, repeat/concurrent runs, bigint round-trip, constraints, checksum guard and atomic rollback.')
} catch (error) {
  console.error(`Database integration test failed (${error?.code || error?.name || 'unknown'}). Ensure PostgreSQL binaries are installed, PG_BIN is set if needed, and disk space is available.`)
  process.exitCode = 1
} finally {
  await sql?.end({ timeout: 5 })
  if (started) {
    await exec(join(bin || '', 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'])
  }
  if (directory) await rm(directory, { recursive: true, force: true })
}
