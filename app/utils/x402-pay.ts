import type { PaymentRequired } from '@x402/core/types'
import { isStellarPublicKey } from '#shared/profile'

export type PayStage = 'idle' | 'requesting' | 'connecting' | 'signing' | 'settling' | 'done' | 'error'

export interface Classroom {
  course: Record<string, any>
  modules: { title: string; description: string }[]
  enrolment: { student: string; transaction: string; network: string; enrolledAt: string }
  accessToken: string
}

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'
const tokenKey = (id: string) => `learnpurse.class-access.${id}`

export function savedAccess(id: string): string | null {
  try { return localStorage.getItem(tokenKey(id)) } catch { return null }
}

/** Reopen a class the student already paid for. */
export async function reopenClass(id: string, token: string): Promise<Classroom | null> {
  const response = await fetch(`/api/courses/${id}/access`, { headers: { authorization: `Bearer ${token}` } })
  return response.ok ? response.json() : null
}

/** Freighter calls can hang forever when the extension is missing, locked or its popup is blocked. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
}

function friendlyError(message: string): string {
  if (/trustline|TrustlineMissing/i.test(message)) return 'Your wallet needs a Testnet USDC trustline before it can pay.'
  if (/balance|InsufficientBalance|underfunded/i.test(message)) return 'Your wallet doesn’t have enough Testnet USDC for this class.'
  if (/declin|reject|denied|cancel/i.test(message)) return 'The payment was cancelled in your wallet. You have not been charged.'
  return message || 'Something went wrong with the payment. You have not been charged.'
}

/**
 * Stellar x402 enrolment: request the protected resource, receive HTTP 402,
 * sign the exact USDC transfer authorization in Freighter, retry with PAYMENT-SIGNATURE.
 * The server verifies and settles through the facilitator, then enrols the student.
 */
export async function enrolWithX402(id: string, onStage: (stage: PayStage) => void): Promise<Classroom> {
  const url = `/api/courses/${id}/access`
  try {
    onStage('requesting')
    const first = await fetch(url)
    if (first.ok) return first.json()
    if (first.status !== 402) throw new Error((await first.json().catch(() => null))?.statusMessage ?? `Unexpected response ${first.status}`)

    const [{ x402Client, x402HTTPClient }, { ExactStellarScheme }, freighterModule] = await Promise.all([
      import('@x402/core/client'), import('@x402/stellar/exact/client'), import('@stellar/freighter-api'),
    ])
    const freighter = (typeof freighterModule.isConnected === 'function' ? freighterModule : (freighterModule as any).default) as typeof import('@stellar/freighter-api')
    const probe = new x402HTTPClient(new x402Client())
    const required: PaymentRequired = probe.getPaymentRequiredResponse(name => first.headers.get(name), await first.json())

    onStage('connecting')
    // Freighter injects itself shortly after page load. Retry before telling the student it is missing.
    const notFound = { isConnected: false, error: { message: 'not found' } } as Awaited<ReturnType<typeof freighter.isConnected>>
    const probeWallet = () => withTimeout(freighter.isConnected(), 2500, 'timeout').catch(() => notFound)
    let installed = await probeWallet()
    for (let attempt = 0; attempt < 3 && (installed.error || !installed.isConnected); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 400))
      installed = await probeWallet()
    }
    if (installed.error || !installed.isConnected) throw new Error('No Stellar wallet found in this browser. Install or unlock the Freighter extension (freighter.app), then refresh this page. No LearnPurse account is needed.')
    const access = await withTimeout(freighter.requestAccess(), 90_000, 'Freighter did not open or respond. Click the Freighter icon in your browser toolbar, unlock it, allow pop-ups for this site, then try again.')
    if (access.error || !isStellarPublicKey(access.address)) throw new Error(access.error?.message ? `Freighter: ${access.error.message}` : 'The wallet connection was cancelled.')
    const network = await withTimeout(freighter.getNetworkDetails(), 10_000, 'Freighter did not report its network. Unlock Freighter and try again.')
    if (network.networkPassphrase !== TESTNET_PASSPHRASE) throw new Error('Switch Freighter to Testnet, then try again.')

    const signer = {
      address: access.address,
      signAuthEntry: async (entry: string, opts?: { networkPassphrase?: string; address?: string }) => {
        onStage('signing')
        const signed = await withTimeout(freighter.signAuthEntry(entry, { networkPassphrase: opts?.networkPassphrase ?? TESTNET_PASSPHRASE, address: access.address }), 120_000, 'Freighter did not show the approval. Open Freighter from the toolbar to approve, then try again.')
        if (signed.error || !signed.signedAuthEntry) throw new Error(signed.error?.message ?? 'Signature declined')
        return { signedAuthEntry: signed.signedAuthEntry, signerAddress: signed.signerAddress }
      },
    }
    // The x402 client caps every payment at $1 by default, which silently blocks any class above $1 before
    // Freighter opens. Cap at exactly this class's advertised amount instead; Freighter still shows it for approval.
    const offerAmount = required.accepts.reduce((max: bigint, option: any) => { try { const value = BigInt(option.amount); return value > max ? value : max } catch { return max } }, 0n)
    const base = new x402Client()
    if (offerAmount > 0n) base.setSpendControls({ maxAmountPerPayment: `$${Number(offerAmount) / 1e7}` })
    const client = new x402HTTPClient(base.register('stellar:*', new ExactStellarScheme(signer)))
    const payload = await client.createPaymentPayload(required)

    onStage('settling')
    const paid = await fetch(url, { headers: client.encodePaymentSignatureHeader(payload) })
    const body = await paid.json().catch(() => null)
    if (!paid.ok) throw new Error(body?.error ?? body?.statusMessage ?? 'Payment was not accepted.')
    try { localStorage.setItem(tokenKey(id), body.accessToken) } catch { /* Access still works for this visit. */ }
    onStage('done')
    return body
  } catch (error) {
    onStage('error')
    console.error('[x402-pay]', error)
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}
