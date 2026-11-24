import { classroom, findEnrolment, getCourse, newAccessToken, paymentPolicy, recordEnrolment, seatsLeft, withCourseLock } from '#server/utils/courses'
import { currentUser } from '#server/utils/auth'
import { courseRequirements, encodePaymentResponseHeader, paymentRequired, readPaymentSignature, resourceServer } from '#server/utils/x402'

// x402-protected course resource.
// No payment: HTTP 402 + PAYMENT-REQUIRED (exact scheme, stellar:testnet, USDC, payTo = creator).
// PAYMENT-SIGNATURE: verify with the facilitator, settle on Stellar, enrol, return the lessons.
// Authorization: Bearer <token>: returning student reopens the class without paying again.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const course = await getCourse(id)
  if (!course) throw createError({ statusCode: 404, statusMessage: 'Class not found' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const policy = paymentPolicy(course)

  const token = getRequestHeader(event, 'authorization')?.match(/^Bearer\s+(\S{16,})$/)?.[1]
  if (token) {
    const enrolment = findEnrolment(course, { token })
    if (enrolment) return classroom(course, enrolment)
  }

  const payload = readPaymentSignature(event)
  let requirements
  try { requirements = await courseRequirements(course) }
  catch { throw createError({ statusCode: 503, statusMessage: 'The Stellar payment facilitator is unreachable. Try again shortly.' }) }

  if (!payload) {
    if (seatsLeft(course) === 0) throw createError({ statusCode: 409, statusMessage: 'This class is full.' })
    return paymentRequired(event, course, requirements)
  }

  const server = await resourceServer()
  const accepted = server.findMatchingRequirements(requirements, payload)
  if (!accepted) return paymentRequired(event, course, requirements, 'Payment does not match this class’s price, asset, network or recipient.')

  const verification = await server.verifyPayment(payload, accepted).catch(error => ({ isValid: false, invalidReason: String(error?.message ?? error), payer: undefined }))
  if (!verification.isValid || !verification.payer) return paymentRequired(event, course, requirements, verification.invalidReason ?? 'Payment could not be verified.')
  const student = verification.payer

  return withCourseLock(course.id, async () => {
    const fresh = (await getCourse(course.id))!
    // A valid signature proves control of the account. Single-payment classes never charge twice.
    const existing = findEnrolment(fresh, { student })
    const payments = fresh.enrolments.filter(enrolment => enrolment.student === student)
    if (existing && policy.mode === 'single') return classroom(fresh, existing)
    if (policy.mode === 'installments' && payments.length >= (policy.installments ?? 2)) return classroom(fresh, existing!)
    if (seatsLeft(fresh) === 0) throw createError({ statusCode: 409, statusMessage: 'This class filled up before your payment was taken. You have not been charged.' })

    const settlement = await server.settlePayment(payload, accepted).catch(error => ({ success: false, errorReason: String(error?.message ?? error), transaction: '', network: accepted.network }))
    if (!settlement.success) return paymentRequired(event, fresh, requirements, settlement.errorReason ?? 'Payment settlement failed.')

    const user = await currentUser(event)
    const enrolment = { student, transaction: settlement.transaction, network: settlement.network, enrolledAt: new Date().toISOString(), accessToken: existing?.accessToken ?? newAccessToken(), paymentNumber: payments.length + 1, userId: user?.role === 'student' ? user.id : null }
    const updated = await recordEnrolment(fresh.id, enrolment)
    setResponseHeader(event, 'PAYMENT-RESPONSE', encodePaymentResponseHeader(settlement as Parameters<typeof encodePaymentResponseHeader>[0]))
    return classroom(updated!, enrolment)
  })
})
