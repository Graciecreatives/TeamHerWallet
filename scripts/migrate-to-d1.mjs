// One-off: copy local .data/courses/*.json into the Cloudflare D1 API. Safe to re-run (skips existing ids).
import { readFile, readdir } from 'node:fs/promises'

const url = process.env.NUXT_CLOUD_API_URL?.replace(/\/+$/, '')
const secret = process.env.NUXT_CLOUD_API_SECRET
if (!url || !secret) { console.error('Set NUXT_CLOUD_API_URL and NUXT_CLOUD_API_SECRET in .env'); process.exit(1) }
const headers = { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }

const dir = new URL('../.data/courses/', import.meta.url)
for (const file of await readdir(dir)) {
  const course = JSON.parse(await readFile(new URL(file, dir), 'utf8'))
  const exists = await fetch(`${url}/courses/${course.id}`, { headers })
  if (exists.ok) { console.log(`skip  ${course.id} (already in D1)`); continue }
  const created = await fetch(`${url}/courses`, { method: 'POST', headers, body: JSON.stringify({ ...course, enrolments: undefined }) })
  if (!created.ok) { console.error(`fail  ${course.id}: ${await created.text()}`); continue }
  for (const enrolment of course.enrolments ?? []) {
    const response = await fetch(`${url}/courses/${course.id}/enrolments`, { method: 'POST', headers, body: JSON.stringify(enrolment) })
    if (!response.ok) console.error(`  enrolment ${enrolment.transaction}: ${await response.text()}`)
  }
  console.log(`moved ${course.id} (${course.enrolments?.length ?? 0} enrolments)`)
}
