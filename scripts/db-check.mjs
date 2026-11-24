import { createDatabase } from '../server/database/client.ts'

let sql
try {
  sql = createDatabase(process.env.DATABASE_URL, 1)
  await sql`SELECT 1 AS healthy`
  console.log('PostgreSQL connection successful.')
} catch {
  console.error('PostgreSQL connection failed. Check DATABASE_URL, TLS and database availability. Credentials are not logged.')
  process.exitCode = 1
} finally {
  await sql?.end({ timeout: 5 })
}
