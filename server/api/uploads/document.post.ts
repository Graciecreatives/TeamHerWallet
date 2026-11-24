import { randomBytes } from 'node:crypto'
import { requireCreator } from '#server/utils/auth'
import { documentReceipt, isPdf, MAX_PDF_BYTES } from '#server/utils/documents'

export default defineEventHandler(async event => {
  const creator = await requireCreator(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const config = useRuntimeConfig()
  if (!config.imageUploadUrl || !config.imageUploadSecret) throw createError({ statusCode: 503, statusMessage: 'Private document storage is not configured.' })
  if (Number(getRequestHeader(event, 'content-length')) > MAX_PDF_BYTES + 65536) throw createError({ statusCode: 413, statusMessage: 'PDFs must be 20 MB or smaller.' })
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'document' && part.data?.length)
  if (!file || !isPdf(file.data)) throw createError({ statusCode: 415, statusMessage: 'Choose a valid PDF, 20 MB or smaller.' })
  const document = { key: `documents/${randomBytes(20).toString('hex')}.pdf`, name: (file.filename || 'document.pdf').replace(/[^a-zA-Z0-9 ._()-]/g, '_').slice(0, 120), size: file.data.length }
  await $fetch(`${String(config.imageUploadUrl).replace(/\/+$/, '')}/upload/${document.key}`, { method: 'PUT', headers: { authorization: `Bearer ${config.imageUploadSecret}`, 'content-type': 'application/pdf' }, body: file.data, timeout: 30000, retry: 0 }).catch(() => { throw createError({ statusCode: 502, statusMessage: 'PDF upload failed. Try again.' }) })
  return { ...document, receipt: documentReceipt(document, creator.id, String(config.imageUploadSecret)) }
})
