import { getCourse, publicCourse, seatsLeft } from '#server/utils/courses'
import { askModel, sanitizeHistory } from '#server/utils/ai'

type Published = ReturnType<typeof publicCourse>

function paymentPlan(published: Published): string {
  const policy = published.paymentPolicy
  if (policy.mode === 'installments') return `${policy.installments} installments of ${published.priceAmount} USDC each`
  if (policy.mode === 'repeat') return `${published.priceAmount} USDC per payment (repeat payments allowed)`
  return `one payment of ${published.priceAmount} USDC`
}

/** Rule-based answers. Used when no AI provider is configured or the model fails. */
function fallbackAnswer(message: string, published: Published): string {
  const question = message.toLowerCase()
  const lessonNames = published.modules.map(module => module.title).join(', ')
  const places = published.seatsLeft === null ? 'open enrolment' : `${published.seatsLeft} places left`

  if (/account|sign ?in|sign ?up|log ?in|register|password/.test(question)) return 'You do not need a LearnPurse account. You only need a Stellar wallet (Freighter) on Testnet with enough Testnet USDC. Approve the payment in your wallet and the class unlocks straight away.'
  if (/freighter|install|download|extension|no wallet|don.?t have a wallet|get a wallet/.test(question)) return 'Install the Freighter browser extension from freighter.app, create a wallet, switch it to Testnet, fund it with test XLM (Friendbot) and add a USDC trustline with some Testnet USDC. Then refresh this page and click Continue to payment.'
  if (/trustline|testnet usdc|faucet|fund|xlm/.test(question)) return 'On Testnet, fund your wallet with free test XLM using Friendbot, add a trustline to Testnet USDC in Freighter, then get Testnet USDC from the Circle faucet (faucet.circle.com, choose Stellar Testnet).'
  if (/price|cost|how much|pay|usdc|fee|install?ment/.test(question)) return `This class costs ${paymentPlan(published)} on Stellar Testnet. The payment goes directly to the creator’s wallet shown in the payment summary.`
  if (/learn|lesson|curriculum|module|cover|teach|syllabus/.test(question)) return `You will learn: ${lessonNames}. ${published.description}`
  if (/how long|duration|week|time|hours/.test(question)) return `The published duration is ${published.duration}. The class currently has ${places}.`
  if (/beginner|level|who|suitable|audience|for me|experience/.test(question)) return `This class is for ${published.targetAudience}. ${published.description}`
  if (/refund|money back|cancel/.test(question)) return 'Payments settle directly on Stellar to the creator’s wallet, so LearnPurse cannot reverse them. Contact the creator about refunds before you pay.'
  if (/wallet|network|stellar|safe|secure|x402/.test(question)) return `Payment uses ${paymentPlan(published)} on Stellar Testnet, sent straight to the creator’s public Stellar wallet. Freighter shows you the exact transaction before you approve it, and nothing moves without your signature.`
  if (/space|seat|place|available|full|spots?/.test(question)) return published.seatsLeft === 0 ? 'This class is currently full.' : `There is ${places}.`
  if (/access|after (i )?pay|reopen|lost/.test(question)) return 'Once your payment settles, all lessons unlock instantly. You also get a private access link so you can reopen the class later without paying again.'
  return `I can help with what you will learn, who it is for, the duration, places left, the price and how to pay with a Stellar wallet. This class is ${published.title}: ${published.description}`
}

function systemPrompt(published: Published): string {
  return `You are the LearnPurse assistant on a class's payment page, helping a prospective student decide and pay.
Answer ONLY using the class facts and payment facts below. If something is not covered, say you don't know and suggest contacting the creator. Never invent lesson content, schedules, certificates, refunds or results. Never promise income or profits.
Be warm and concise: 1-4 short sentences, plain text, no markdown. If the student seems ready, tell them to click "Continue to payment".

CLASS FACTS
Title: ${published.title}
Creator: ${published.creatorName}
Description: ${published.description}
For: ${published.targetAudience}
Duration: ${published.duration}
Lessons (titles only, details unlock after payment): ${published.modules.map((module, index) => `${index + 1}. ${module.title}`).join('; ')}
Price: ${paymentPlan(published)}
Places: ${published.seatsLeft === null ? 'unlimited (open enrolment)' : `${published.seatsLeft} of ${published.capacity} left`}
Creator wallet: ${published.payTo}

PAYMENT FACTS
- No LearnPurse account or sign-in is needed. Only the creator has an account.
- Payment uses x402 on Stellar Testnet in USDC, sent directly to the creator's wallet. LearnPurse never holds the money and cannot reverse payments.
- The student needs the Freighter browser extension (freighter.app) set to Testnet, funded with test XLM (Friendbot), with a USDC trustline and Testnet USDC (faucet.circle.com, Stellar Testnet).
- Flow: click "Continue to payment", then "Approve in Freighter", sign the single exact transfer, and the lessons unlock instantly with a private access link to reopen the class later.`
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const course = await getCourse(id)
  if (!course) throw createError({ statusCode: 404, statusMessage: 'Class not found' })
  const body = await readBody<{ message?: unknown; history?: unknown }>(event).catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (message.length < 2 || message.length > 500) throw createError({ statusCode: 422, statusMessage: 'Ask a short question about this class.' })

  const published = publicCourse(course)
  const history = sanitizeHistory(body?.history, 10)
  try {
    const answer = await askModel(systemPrompt(published), [...history, { role: 'user', content: message }], { temperature: 0.3, maxTokens: 300 })
    if (answer?.trim()) return { answer: answer.trim(), source: 'ai', seatsLeft: seatsLeft(course) }
  } catch { /* Fall back to rule-based answers below. */ }
  return { answer: fallbackAnswer(message, published), source: 'published-course', seatsLeft: seatsLeft(course) }
})
