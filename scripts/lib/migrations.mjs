import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export async function migrate(sql, directory = new URL('../../database/migrations/', import.meta.url)) {
  const path = directory instanceof URL ? fileURLToPath(directory) : directory
  const files = (await readdir(path)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort()
  if (!files.length) throw new Error('No migration files found.')
  const applied = []
  await sql.begin(async transaction => {
    // Serialize deploy jobs on the same database, pinned to this transaction.
    await transaction`SELECT pg_advisory_xact_lock(724307109215)`
    await transaction`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`
    const existing = await transaction`SELECT name, checksum FROM schema_migrations`
    const known = new Map(existing.map(row => [row.name, row.checksum]))
    for (const name of known.keys()) {
      if (!files.includes(name)) throw new Error(`Applied migration is missing from this checkout: ${name}`)
    }
    for (const name of files) {
      const source = await readFile(`${path}/${name}`, 'utf8')
      const checksum = createHash('sha256').update(source).digest('hex')
      if (known.has(name)) {
        if (known.get(name) !== checksum) throw new Error(`Applied migration was changed: ${name}`)
        continue
      }
      await transaction.unsafe(source)
      await transaction`INSERT INTO schema_migrations (name, checksum) VALUES (${name}, ${checksum})`
      applied.push(name)
    }
  })
  return applied
}
