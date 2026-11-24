import { planCourseFromBrief, reconcileAgentDraft, type AgentPlan } from '#shared/agent'
import { askModel, askModelJson } from '#server/utils/ai'

const SYSTEM = `You are LearnPurse's course-building assistant for creators. LearnPurse lets creators sell online classes paid in USDC on Stellar (x402). Students pay with their own Stellar wallet. They never need a LearnPurse account.
From the creator's messages, design a sellable online class and return JSON with exactly these keys:
- title: 5-100 chars, specific and appealing, no clickbait
- description: 2-3 warm, concrete sentences about the outcome a student gets
- targetAudience: who it is for, one phrase
- duration: e.g. "4 weeks", "6 sessions", or "Self-paced"
- priceAmount: decimal USDC string, no symbol
- capacity: whole-number string, or "" for unlimited
- modules: 3-8 items of {title, description}, ordered first lesson to last. Each description is 1-2 sentences describing what the student actually does or learns in that lesson, specific to the subject (not generic filler).
Rules: use the creator's exact price, class size and length when given. Match the stated level. Never promise income, profits or guaranteed returns (especially for trading, crypto or investing topics). Write in the creator's language.`

const FOLLOW_UP_SYSTEM = `You are LearnPurse's friendly course-building assistant talking to a creator. Some details are still missing before you can build their class.
Write ONE short, warm reply (max 3 sentences) that briefly reflects what you understood, then asks for the missing details listed. Plain text, no markdown, no lists.`

const SUMMARY_SYSTEM = `You are LearnPurse's course-building assistant. You just drafted a class for the creator. In 1-2 short, warm sentences (plain text), tell them what you built and invite them to review the lessons and pricing before publishing. Do not repeat every detail.`

export default defineEventHandler(async (event): Promise<AgentPlan & { source: 'ai' | 'planner'; reply: string }> => {
  const body = await readBody<{ brief?: unknown }>(event).catch(() => null)
  const brief = typeof body?.brief === 'string' ? body.brief.trim() : ''
  if (brief.length < 8 || brief.length > 4000) throw createError({ statusCode: 422, statusMessage: 'Tell me what you teach, in a sentence or two.' })

  // The planner always runs: it extracts the creator's explicit numbers and is the offline fallback.
  const plan = planCourseFromBrief(brief)

  if (plan.missing.length) {
    const fallback = `Thanks! To build your class I still need: ${plan.missing.map(item => item.question).join(' ')}`
    const context = `Creator conversation:\n${brief}\n\nMissing details:\n${plan.missing.map(item => `- ${item.label}: ${item.question}`).join('\n')}`
    const reply = await askModel(FOLLOW_UP_SYSTEM, [{ role: 'user', content: context }], { temperature: 0.6, maxTokens: 200 }).catch(() => null)
    return { ...plan, source: reply ? 'ai' : 'planner', reply: reply?.trim() || fallback }
  }

  try {
    const draft = reconcileAgentDraft(await askModelJson(SYSTEM, [{ role: 'user', content: brief }], { temperature: 0.6, maxTokens: 1500 }), brief)
    if (draft) {
      const summary = await askModel(SUMMARY_SYSTEM, [{ role: 'user', content: `Class drafted: ${draft.title}, ${draft.modules.length} lessons, ${draft.priceAmount} USDC, ${draft.capacity ? `${draft.capacity} places` : 'unlimited places'}, ${draft.duration}.` }], { temperature: 0.6, maxTokens: 120 }).catch(() => null)
      return { ...plan, draft, source: 'ai', reply: summary?.trim() || `I drafted “${draft.title}” with ${draft.modules.length} lessons. Review it, then publish when you’re happy.` }
    }
  } catch { /* Model unavailable or returned invalid JSON. The planner result is still valid. */ }
  return { ...plan, source: 'planner', reply: `I drafted “${plan.draft.title}” with ${plan.draft.modules.length} lessons. Review it, then publish when you’re happy.` }
})
