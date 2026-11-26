// Re-send creator shares that are pending in the payout ledger, and pay any settled student payment
// to the treasury that has no ledger entry (for example after a crash between settlement and payout).
// Admin only: requires NUXT_CLOUD_API_SECRET as a bearer token.
import { payoutCreator } from '#server/utils/platform-fee'
import { listCourses } from '#server/utils/courses'

export default defineEventHandler(async (event) => {
  const secret = String(useRuntimeConfig().cloudApiSecret || '')
  if (!secret || getRequestHeader(event, 'authorization') !== `Bearer ${secret}`) throw createError({ statusCode: 401, statusMessage: 'Admin only.' })
  const ledger = useStorage('payouts')
  const results: any[] = []
  for (const course of await listCourses()) {
    for (const enrolment of course.enrolments) {
      const entry: any = await ledger.getItem(enrolment.transaction)
      if (entry?.status === 'paid') continue
      if (!entry && new Date(enrolment.enrolledAt) < new Date(String(getQuery(event).since || '9999'))) continue
      try {
        const paid = await payoutCreator(course.payTo, course.draft.priceAmount, `LP ${course.id}`)
        await ledger.setItem(enrolment.transaction, { courseId: course.id, creator: course.payTo, studentTx: enrolment.transaction, ...paid, status: 'paid', at: new Date().toISOString() })
        results.push({ courseId: course.id, studentTx: enrolment.transaction, payout: paid.transaction })
      } catch (error) {
        results.push({ courseId: course.id, studentTx: enrolment.transaction, error: String((error as Error).message).slice(0, 200) })
      }
    }
  }
  return { results }
})
