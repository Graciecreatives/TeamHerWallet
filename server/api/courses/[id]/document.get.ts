import { findEnrolment, getCourse } from '#server/utils/courses'
import { DOCUMENT_KEY } from '#server/utils/documents'

export default defineEventHandler(async event => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'Vary', 'Authorization')
  const token = getRequestHeader(event, 'authorization')?.match(/^Bearer\s+(\S{16,})$/)?.[1]
  if (!token) throw createError({ statusCode: 401, statusMessage: 'A paid access token is required.' })
  const course = await getCourse(getRouterParam(event, 'id') ?? '')
  if (!course || !findEnrolment(course, { token })) throw createError({ statusCode: 403, statusMessage: 'This token does not grant access to this product.' })
  if (!course.document || !DOCUMENT_KEY.test(course.document.key)) throw createError({ statusCode: 404, statusMessage: 'No PDF is attached to this product.' })
  const config = useRuntimeConfig()
  if (!config.imageUploadUrl || !config.imageUploadSecret) throw createError({ statusCode: 503, statusMessage: 'Private document storage is not configured.' })
  let response: Response | undefined
  // Downloads are idempotent. Retry transient storage transport failures without charging again.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(`${String(config.imageUploadUrl).replace(/\/+$/, '')}/${course.document.key}`, { headers: { authorization: `Bearer ${config.imageUploadSecret}` }, redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (response.ok || response.status < 500) break
      await response.body?.cancel()
    } catch { /* Retry transport failures, but never expose upstream details or secrets. */ }
  }
  if (!response?.ok || !response.body) throw createError({ statusCode: 502, statusMessage: 'The PDF is temporarily unavailable.' })
  setResponseHeader(event, 'Content-Type', 'application/pdf')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="download.pdf"; filename*=UTF-8''${encodeURIComponent(course.document.name)}`)
  return sendStream(event, response.body)
})
