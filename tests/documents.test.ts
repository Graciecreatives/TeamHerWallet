import test from 'node:test'
import assert from 'node:assert/strict'
import { documentReceipt, verifyDocument, isPdf, MAX_PDF_BYTES } from '../server/utils/documents.ts'
import { stripTypeScriptTypes } from 'node:module'
import { readFile } from 'node:fs/promises'
import worker from '../cloudflare/image-worker/src/index.ts'

test('download route enforces same-course paid bearer before touching storage', async () => {
  const source = stripTypeScriptTypes((await readFile(new URL('../server/api/courses/[id]/document.get.ts', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '')).replace('export default ', 'return ')
  let storageCalls = 0
  let storageFailures = 0
  const paidToken = 'paid-access-token-123456789'
  const course = { document, enrolments: [{ accessToken: paidToken }] }
  const headers: Record<string, string> = {}
  const handler = new Function('defineEventHandler', 'setResponseHeader', 'getRequestHeader', 'getRouterParam', 'getCourse', 'findEnrolment', 'DOCUMENT_KEY', 'useRuntimeConfig', 'fetch', 'createError', 'sendStream', source)(
    (handler: any) => handler,
    (_event: any, key: string, value: string) => { headers[key] = value },
    (event: any) => event.authorization,
    (event: any) => event.id,
    async (id: string) => id === 'paid-course' ? course : null,
    (value: typeof course, by: { token: string }) => value.enrolments.find(e => e.accessToken === by.token),
    /^documents\/[a-f0-9]{40}\.pdf$/,
    () => ({ imageUploadUrl: 'https://storage.test', imageUploadSecret: 'secret' }),
    async (_url: string, options: any) => { storageCalls++; if (storageFailures-- > 0) throw new Error('storage transport timeout'); assert.equal(options.headers.authorization, 'Bearer secret'); return new Response('%PDF-1.7') },
    (details: any) => Object.assign(new Error(details.statusMessage), details),
    (_event: any, stream: any) => stream,
  )
  for (const [event, status] of [[{ id: 'paid-course' }, 401], [{ id: 'paid-course', authorization: 'Bearer invalid-token-123456' }, 403], [{ id: 'other-course', authorization: `Bearer ${paidToken}` }, 403]] as const) {
    await assert.rejects(handler(event), (error: any) => error.statusCode === status)
  }
  assert.equal(storageCalls, 0)
  assert.ok(await handler({ id: 'paid-course', authorization: `Bearer ${paidToken}` }))
  assert.equal(storageCalls, 1)
  assert.equal(headers['Cache-Control'], 'private, no-store')
  assert.equal(headers['Content-Type'], 'application/pdf')
  storageFailures = 2
  assert.ok(await handler({ id: 'paid-course', authorization: `Bearer ${paidToken}` }))
  assert.equal(storageCalls, 4, 'safe storage reads retry transient errors')
  storageFailures = 3
  await assert.rejects(handler({ id: 'paid-course', authorization: `Bearer ${paidToken}` }), (error: any) => error.statusCode === 502)
  assert.equal(storageCalls, 7, 'retries are bounded and transport failures become friendly 502 responses')
})
const document = { key: `documents/${'a'.repeat(40)}.pdf`, name: 'Guide.pdf', size: 42 }
test('PDF sniffing rejects images, empty and oversized uploads', () => {
  assert.equal(isPdf(Buffer.from('%PDF-1.7\n')), true)
  assert.equal(isPdf(Buffer.from('not a PDF')), false)
  assert.equal(isPdf(new Uint8Array(MAX_PDF_BYTES + 1)), false)
})
test('upload receipts bind immutable document metadata to creator', () => {
  const uploaded = { ...document, receipt: documentReceipt(document, 'creator-a', 'secret') }
  assert.deepEqual(verifyDocument(uploaded, 'creator-a', 'secret'), document)
  for (const changed of [{ ...uploaded, key: `documents/${'b'.repeat(40)}.pdf` }, { ...uploaded, name: 'changed.pdf' }, { ...uploaded, size: 43 }, { ...uploaded, receipt: '0'.repeat(64) }]) assert.equal(verifyDocument(changed, 'creator-a', 'secret'), null)
  assert.equal(verifyDocument(uploaded, 'creator-b', 'secret'), null)
  assert.equal(verifyDocument(uploaded, 'creator-a', ''), null)
})
test('R2 Worker never serves a PDF publicly and uses only private bucket', async () => {
  let reads = 0
  let writes = 0
  const env = { UPLOAD_SECRET: 'secret', IMAGES: { get() { throw new Error('Public bucket must not be used') }, put() { throw new Error('Public bucket must not be used') } }, DOCUMENTS: { async get() { reads++; return { body: new Blob(['%PDF-1.7']).stream() } }, async put() { writes++ } } } as any
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
    const response = await worker.fetch(new Request(`https://storage.test/${document.key}`, { method }), env)
    assert.equal(response.status, 401)
  }
  assert.equal(reads, 0)
  const response = await worker.fetch(new Request(`https://storage.test/${document.key}`, { headers: { authorization: 'Bearer secret' } }), env)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  const upload = await worker.fetch(new Request(`https://storage.test/upload/${document.key}`, { method: 'PUT', headers: { authorization: 'Bearer secret', 'content-type': 'application/pdf' }, body: '%PDF-1.7' }), env)
  assert.equal(upload.status, 200)
  assert.equal(writes, 1)
})
