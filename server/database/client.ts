import postgres from 'postgres'

export function createDatabase(connectionUrl: string | undefined, max = 5) {
  if (!connectionUrl?.trim()) throw new Error('DATABASE_URL is required for database operations.')
  let url: URL
  try { url = new URL(connectionUrl) } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use postgres:// or postgresql://.')
  return postgres(connectionUrl, {
    max,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    // Keep bigint values as strings. Never convert token base units to Number.
    onnotice: () => {},
  })
}

let database: ReturnType<typeof createDatabase> | undefined

// Lazy: building or running the local editor never requires a database.
export function getDatabase() {
  database ??= createDatabase(process.env.DATABASE_URL)
  return database
}

export async function closeDatabase() {
  await database?.end({ timeout: 5 })
  database = undefined
}
