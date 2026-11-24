import { createCourse, publicCourse } from '#server/utils/courses'
import { requireCreator } from '#server/utils/auth'
import { verifyDocument, type ProductType } from '#server/utils/documents'
import { fulfilRequest } from '#server/utils/learning-agent'
import { cleanSchedule } from '#shared/classroom'

/**
 * Publish a class. Requires a signed-in creator account. Payment always goes to the wallet saved on
 * that account, so nobody can publish a class that pays someone else, and the creator name is the
 * account's display name.
 */
export default defineEventHandler(async (event) => {
  const creator = await requireCreator(event)
  const body = await readBody(event).catch(() => null)
  if (!body || typeof body !== 'object') throw createError({ statusCode: 400, statusMessage: 'Send the course as JSON.' })
  if (!creator.walletAddress) throw createError({ statusCode: 422, statusMessage: 'Add a Stellar Testnet wallet to your account before publishing.' })
  const productType = body.productType ?? 'class'
  if (!['class', 'pdf', 'bundle'].includes(productType)) throw createError({ statusCode: 422, statusMessage: 'Choose class, PDF or bundle.' })
  const document = productType === 'class' ? undefined : verifyDocument(body.document, creator.id, String(useRuntimeConfig().imageUploadSecret || ''))
  if (productType !== 'class' && !document) throw createError({ statusCode: 422, statusMessage: 'Upload your PDF before publishing this product.' })
  try { body.classroom = cleanSchedule(body.classroom) }
  catch (error) { throw createError({ statusCode: 422, statusMessage: (error as Error).message }) }
  const { course, error } = await createCourse({ ...(body as Record<string, unknown>), productType: productType as ProductType, document: document || undefined, payTo: creator.walletAddress, creatorName: creator.displayName, creatorId: creator.id })
  if (!course) throw createError({ statusCode: 422, statusMessage: error })
  // Built for a learner's class request: the requesting agent buys it in the background, inside its rules.
  const requestId = (body as Record<string, unknown>).requestId
  if (typeof requestId === 'string' && /^req-[a-z0-9-]{6,40}$/.test(requestId)) {
    const origin = getRequestURL(event).origin
    const task = fulfilRequest(requestId, course, origin).catch(error => console.error('fulfil request', error))
    event.waitUntil?.(task)
  }
  setResponseStatus(event, 201)
  return { ...publicCourse(course), url: `/class/${course.id}` }
})
