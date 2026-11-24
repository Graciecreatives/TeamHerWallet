import { createDatabase } from '../server/database/client.ts'
import { migrate } from './lib/migrations.mjs'

let sql
try {
  sql = createDatabase(process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL, 1)
  const applied = await migrate(sql)
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.')
} catch (error) {
  // Do not log the driver error object, which can contain connection details.
  console.error(error?.message?.startsWith('Applied migration') ? error.message : 'Migration failed. Check database configuration, connectivity and migration SQL. Credentials are not logged.')
  process.exitCode = 1
} finally {
  await sql?.end({ timeout: 5 })
}
