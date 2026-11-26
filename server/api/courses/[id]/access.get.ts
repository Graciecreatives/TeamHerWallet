import { classroom, findEnrolment, getCourse, newAccessToken, paymentPolicy, recordEnrolment, seatsLeft, withCourseLock } from '#server/utils/courses'
import { currentUser } from '#server/utils/auth'
import { courseRequirements, encodePaymentResponseHeader, paymentRequired, readPaymentSignature, resourceServer } from '#server/utils/x402'
import { feeConfig, payoutCreator } from '#server/utils/platform-fee'

const payouts = () => useStorage('payouts')

/** Forward the creator's share. A failure never blocks the student: it is kept in the ledger for a retry. */
async function settleCreatorShare(course: { id: string; payTo: string; draft: { priceAmount: string | number } }, studentTx: string) {
  if (feeConfig().bps <= 0) return
  const key = studentTx
  try {
    const result = await payoutCreator(course.payTo, course.draft.priceAmount, `LP ${course.id}`)
    await payouts().setItem(key, { courseId: course.id, creator: course.payTo, studentTx, ...result, status: 'paid', at: new Date().toISOString() }).catch(() => {})
  } catch (error) {
    console.error(`[platform-fee] payout pending for ${course.id} (${studentTx}):`, error)
    await payouts().setItem(key, { courseId: course.id, creator: course.payTo, studentTx, priceAmount: String(course.draft.priceAmount), status: 'pending', error: String((error as Error)?.message ?? error).slice(0, 300), at: new Date().toISOString() }).catch(() => {})
  }
}

/** The student has already paid when this runs, so a brief database hiccup must not lose the enrolment. */
async function recordWithRetry(id: string, enrolment: Parameters<typeof recordEnrolment>[1]) {
  let lastError: any
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await recordEnrolment(id, enrolment) } catch (error: any) {
      lastError = error
      if (error?.status === 409) break
      await new Promise(done => setTimeout(done, 800 * (attempt + 1)))
    }
  }
  console.error(`[enrolment] paid but not recorded: course ${id} tx ${enrolment.transaction}`, lastError)
  await useStorage('payouts').setItem(`unrecorded-${enrolment.transaction}`, { courseId: id, ...enrolment, error: String(lastError?.message ?? lastError) }).catch(() => {})
  throw createError({ statusCode: 503, statusMessage: `Your payment went through (transaction ${enrolment.transaction.slice(0, 12)}…) but we could not save your enrolment yet. Do not pay again. Refresh in a minute or contact support with this transaction.` })
}

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
    // Money has moved. Pay the creator's share before anything else can fail.
    const creatorShare = settleCreatorShare(fresh, settlement.transaction)

    const user = await currentUser(event)
    const enrolment = { student, transaction: settlement.transaction, network: settlement.network, enrolledAt: new Date().toISOString(), accessToken: existing?.accessToken ?? newAccessToken(), paymentNumber: payments.length + 1, userId: user?.role === 'student' ? user.id : null }
    const updated = await recordWithRetry(fresh.id, enrolment)
    await creatorShare
    setResponseHeader(event, 'PAYMENT-RESPONSE', encodePaymentResponseHeader(settlement as Parameters<typeof encodePaymentResponseHeader>[0]))
    return classroom(updated!, enrolment)
  })
})
