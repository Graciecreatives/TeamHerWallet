import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server'
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http'
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types'
import { ExactStellarScheme } from '@x402/stellar/exact/server'
import type { H3Event } from 'h3'
import type { PublishedCourse } from './courses'
import { paymentRecipient } from './platform-fee'

export const STELLAR_NETWORK = 'stellar:testnet' as const
/** Public x402 facilitator with stellar:testnet "exact" support and sponsored fees. */
const DEFAULT_FACILITATOR = 'https://www.x402.org/facilitator'

let server: x402ResourceServer | null = null
let ready: Promise<void> | null = null

export function facilitatorUrl(): string {
  return String(useRuntimeConfig().x402FacilitatorUrl || DEFAULT_FACILITATOR)
}

/** One resource server per process. initialize() fetches /supported from the facilitator. */
export async function resourceServer(): Promise<x402ResourceServer> {
  if (!server) {
    const { x402FacilitatorApiKey } = useRuntimeConfig()
    const headers: Record<string, string> = x402FacilitatorApiKey ? { Authorization: `Bearer ${x402FacilitatorApiKey}` } : {}
    const facilitator = new HTTPFacilitatorClient({
      url: facilitatorUrl(),
      timeoutMs: 60_000,
      ...(x402FacilitatorApiKey ? { createAuthHeaders: async () => ({ verify: headers, settle: headers, supported: headers }) } : {}),
    })
    server = new x402ResourceServer(facilitator).register(STELLAR_NETWORK, new ExactStellarScheme())
  }
  if (!ready) ready = server.initialize().catch(error => { ready = null; throw error })
  await ready
  return server
}

export async function courseRequirements(course: PublishedCourse): Promise<PaymentRequirements[]> {
  return (await resourceServer()).buildPaymentRequirements({
    scheme: 'exact',
    network: STELLAR_NETWORK,
    payTo: paymentRecipient(course.payTo),
    price: `$${course.draft.priceAmount}`,
    maxTimeoutSeconds: 300,
  })
}

export function resourceInfo(event: H3Event, course: PublishedCourse) {
  const url = getRequestURL(event)
  return {
    url: `${url.origin}/api/courses/${course.id}/access`,
    description: `Enrolment in “${course.draft.title}” by ${course.creatorName}`,
    mimeType: 'application/json',
    serviceName: 'LearnPurse',
  }
}

/** Respond with HTTP 402 and the requirements in both the PAYMENT-REQUIRED header and body. */
export async function paymentRequired(event: H3Event, course: PublishedCourse, requirements: PaymentRequirements[], error?: string) {
  const required = await (await resourceServer()).createPaymentRequiredResponse(requirements, resourceInfo(event, course), error)
  setResponseStatus(event, 402)
  setResponseHeader(event, 'PAYMENT-REQUIRED', encodePaymentRequiredHeader(required))
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return required
}

export function readPaymentSignature(event: H3Event): PaymentPayload | null {
  const header = getRequestHeader(event, 'payment-signature') ?? getRequestHeader(event, 'x-payment')
  if (!header) return null
  try { return decodePaymentSignatureHeader(header) } catch { return null }
}

export { encodePaymentResponseHeader }
