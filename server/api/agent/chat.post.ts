import { planCourseFromBrief } from '#shared/agent'
import { validateCourseDraft, parseUsdcUnits, type CourseDraft } from '#shared/course'
import { askModelJson, sanitizeHistory, type ChatTurn } from '#server/utils/ai'

/**
 * Creator agent. Sees the live studio state, decides on actions, and returns them for the studio to apply.
 * The model never publishes on its own: "publish" only asks the creator to confirm.
 */
type Step = 'details' | 'curriculum' | 'pricing' | 'review'
type Action =
  | { type: 'set_details'; title?: string; description?: string; targetAudience?: string; duration?: string }
  | { type: 'set_modules'; modules: { title: string; description: string }[] }
  | { type: 'add_module'; title: string; description: string; position?: number }
  | { type: 'update_module'; index: number; title?: string; description?: string }
  | { type: 'remove_module'; index: number }
  | { type: 'set_pricing'; priceAmount?: string; capacity?: string; paymentMode?: 'single' | 'repeat' | 'installments'; installments?: number }
  | { type: 'set_style'; accent?: string; tagline?: string; cover?: 'creator-home' | 'creator-workspace' | 'pottery' }
  | { type: 'go_to_step'; step: Step }
  | { type: 'request_publish' }

interface StudioState {
  draft: CourseDraft
  paymentMode: 'single' | 'repeat' | 'installments'
  installments: number
  style: { accent: string; tagline: string; image: string }
  step: Step
  hasWallet: boolean
  creatorName: string
}

const SYSTEM = `You are LearnPurse's creator agent. You work INSIDE the creator's course studio and act on it directly, like a capable assistant with hands on the controls.
LearnPurse sells online classes paid in USDC on Stellar TESTNET via x402. Students pay with their own Freighter wallet and never need an account.

Each turn you receive the creator's message, the conversation so far, and CURRENT_STATE (the live draft). Decide what to do, then respond with JSON:
{"reply": string, "actions": Action[], "suggestions": string[]}

Actions you can take (only include what is needed; they are applied in order):
- {"type":"set_details","title"?,"description"?,"targetAudience"?,"duration"?}
- {"type":"set_modules","modules":[{"title","description"}]}   // replace the whole curriculum (3-8 modules usually)
- {"type":"add_module","title","description","position"?}       // position is the 0-based index the new lesson will have. "Before the last one" = moduleCount-1. Omit to append at the end.
- {"type":"update_module","index","title"?,"description"?}      // index is 0-based
- {"type":"remove_module","index"}
- {"type":"set_pricing","priceAmount"?,"capacity"?,"paymentMode"?,"installments"?}  // priceAmount decimal USDC string; capacity whole-number string or "" for unlimited; paymentMode single|repeat|installments; installments 2-12
- {"type":"set_style","accent"?,"tagline"?,"cover"?}  // accent "#rrggbb"; tagline <=120 chars; cover one of creator-home|creator-workspace|pottery
- {"type":"go_to_step","step":"details"|"curriculum"|"pricing"|"review"}
- {"type":"request_publish"}  // ONLY when the creator explicitly asks to publish. The studio asks them to confirm. Never claim it is published.

How to behave:
- Be proactive. If the creator describes a class, build ALL of it in one turn: set_details (title, description, audience, duration), set_modules with the full curriculum (never fewer than 3 lessons), and set_pricing. Use sensible defaults and say what you assumed.
- Lesson order matters. Keep the final lesson last unless told otherwise.
- Only ask a question when something essential (the subject) is truly unknown. Price, size and length can be defaulted and mentioned.
- When editing, change only what was asked and keep everything else. Use the creator's exact numbers.
- Module descriptions are specific, concrete, 1-2 sentences about what the student does or learns. No filler.
- After acting, go_to_step to where the creator should look next.
- Point out real problems you see in CURRENT_STATE (missing price, empty modules, no wallet for publishing).
- Never promise income or returns (especially trading/crypto/investing). Testnet only.
- Pricing rule: priceAmount is charged on EACH payment. With installments, the student pays priceAmount x installments in total. If the creator gives a total price and asks for installments, set priceAmount = total / installments (2 decimals max) and say the per-payment amount and total.
- Aim for about 2 lessons per week of duration (3-8 total) unless the creator asks otherwise.
- reply: 1-3 short, warm sentences, plain text, describing what you did or need. No markdown.
- suggestions: 2-3 short next things the creator might say, written in their voice (e.g. "Make it 6 weeks", "Add a module on pricing your work").`

const STEPS = new Set(['details', 'curriculum', 'pricing', 'review'])
const COVERS = new Set(['creator-home', 'creator-workspace', 'pottery'])
const str = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : undefined

function cleanModule(input: any) {
  const title = str(input?.title, 100)
  const description = str(input?.description, 2000) ?? ''
  return title ? { title, description } : null
}

/** Validate and normalise model actions. Unknown or malformed actions are dropped. */
function sanitizeActions(raw: unknown, moduleCount: number): Action[] {
  if (!Array.isArray(raw)) return []
  const actions: Action[] = []
  let count = moduleCount
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue
    const a = item as any
    switch (a.type) {
      case 'set_details': {
        const out: any = { type: 'set_details' }
        for (const [key, max] of [['title', 100], ['description', 5000], ['targetAudience', 500], ['duration', 100]] as const) { const value = str(a[key], max); if (value) out[key] = value }
        if (Object.keys(out).length > 1) actions.push(out)
        break
      }
      case 'set_modules': {
        const modules = Array.isArray(a.modules) ? a.modules.map(cleanModule).filter(Boolean).slice(0, 30) : []
        if (modules.length) { actions.push({ type: 'set_modules', modules }); count = modules.length }
        break
      }
      case 'add_module': {
        const module = cleanModule(a)
        if (module && count < 30) { actions.push({ type: 'add_module', ...module, position: Number.isInteger(a.position) ? Math.max(0, Math.min(count, a.position)) : undefined }); count++ }
        break
      }
      case 'update_module': {
        if (Number.isInteger(a.index) && a.index >= 0 && a.index < count) actions.push({ type: 'update_module', index: a.index, title: str(a.title, 100), description: str(a.description, 2000) })
        break
      }
      case 'remove_module': {
        if (Number.isInteger(a.index) && a.index >= 0 && a.index < count && count > 1) { actions.push({ type: 'remove_module', index: a.index }); count-- }
        break
      }
      case 'set_pricing': {
        const out: any = { type: 'set_pricing' }
        const price = typeof a.priceAmount === 'number' ? String(a.priceAmount) : str(a.priceAmount, 30)?.replace(/[^0-9.]/g, '')
        if (price && parseUsdcUnits(price)) out.priceAmount = price
        const capacity = typeof a.capacity === 'number' ? String(a.capacity) : str(a.capacity, 10)
        if (capacity !== undefined && (capacity === '' || /^[1-9][0-9]{0,8}$/.test(capacity))) out.capacity = capacity
        if (['single', 'repeat', 'installments'].includes(a.paymentMode)) out.paymentMode = a.paymentMode
        if (Number.isFinite(Number(a.installments))) out.installments = Math.max(2, Math.min(12, Math.floor(Number(a.installments))))
        if (Object.keys(out).length > 1) actions.push(out)
        break
      }
      case 'set_style': {
        const out: any = { type: 'set_style' }
        if (typeof a.accent === 'string' && /^#[0-9a-f]{6}$/i.test(a.accent)) out.accent = a.accent.toLowerCase()
        const tagline = str(a.tagline, 120); if (tagline !== undefined) out.tagline = tagline
        if (COVERS.has(a.cover)) out.cover = a.cover
        if (Object.keys(out).length > 1) actions.push(out)
        break
      }
      case 'go_to_step': if (STEPS.has(a.step)) actions.push({ type: 'go_to_step', step: a.step }); break
      case 'request_publish': actions.push({ type: 'request_publish' }); break
    }
  }
  return actions
}

function cleanState(input: any): StudioState {
  const draft = input?.draft ?? {}
  return {
    draft: {
      title: str(draft.title, 100) ?? '', description: str(draft.description, 5000) ?? '', targetAudience: str(draft.targetAudience, 500) ?? '',
      duration: str(draft.duration, 100) ?? '', priceAmount: str(draft.priceAmount, 30) ?? '', capacity: str(draft.capacity, 10) ?? '',
      modules: Array.isArray(draft.modules) ? draft.modules.slice(0, 30).map((m: any) => ({ title: str(m?.title, 100) ?? '', description: str(m?.description, 2000) ?? '' })) : [],
    },
    paymentMode: ['repeat', 'installments'].includes(input?.paymentMode) ? input.paymentMode : 'single',
    installments: Math.max(2, Math.min(12, Number(input?.installments) || 2)),
    style: { accent: str(input?.style?.accent, 7) ?? '', tagline: str(input?.style?.tagline, 120) ?? '', image: (str(input?.style?.image, 300) ?? '').startsWith('http') ? 'custom upload' : (str(input?.style?.image, 40) ?? '') },
    step: STEPS.has(input?.step) ? input.step : 'details',
    hasWallet: Boolean(input?.hasWallet),
    creatorName: str(input?.creatorName, 80) ?? '',
  }
}

/** Offline fallback: reuse the deterministic planner so the agent still builds a class without an AI key. */
function fallback(message: string, state: StudioState) {
  const wantsPublish = /\bpublish|go live|launch it\b/i.test(message)
  if (wantsPublish) return { reply: 'Ready when you are. Confirm below and I’ll publish your class.', actions: [{ type: 'request_publish' }] as Action[], suggestions: [] }
  const plan = planCourseFromBrief(message)
  if (!plan.understood.find(item => item.label === 'Subject' && item.value !== 'Not given')) {
    return { reply: 'Tell me what you’d like to teach, and roughly the price, length and class size. I’ll build the whole class for you.', actions: [], suggestions: ['A 4-week bread baking class, $25, 12 students', 'Beginner forex basics for $15, 30 students'] }
  }
  const draft = plan.draft
  return {
    reply: `I built “${draft.title}” with ${draft.modules.length} lessons. ${plan.assumptions.join(' ')}`.trim(),
    actions: [
      { type: 'set_details', title: draft.title, description: draft.description, targetAudience: draft.targetAudience, duration: draft.duration },
      { type: 'set_modules', modules: draft.modules },
      { type: 'set_pricing', priceAmount: draft.priceAmount, capacity: draft.capacity },
      { type: 'go_to_step', step: 'curriculum' },
    ] as Action[],
    suggestions: ['Make the lessons more hands-on', 'Change the price to 20 USDC', state.hasWallet ? 'Publish it' : 'What do I need before publishing?'],
  }
}

/** Apply actions to a copy of the state, the same way the studio does. Used to check the agent's work before replying. */
function simulate(state: StudioState, actions: Action[]): StudioState {
  const next: StudioState = structuredClone(state)
  const draft = next.draft
  for (const action of actions) {
    if (action.type === 'set_details') for (const key of ['title', 'description', 'targetAudience', 'duration'] as const) { if (action[key]) draft[key] = action[key]! }
    if (action.type === 'set_modules') draft.modules = action.modules.map(module => ({ ...module }))
    if (action.type === 'add_module') draft.modules.splice(action.position ?? draft.modules.length, 0, { title: action.title, description: action.description })
    if (action.type === 'update_module' && draft.modules[action.index]) { if (action.title) draft.modules[action.index]!.title = action.title; if (action.description) draft.modules[action.index]!.description = action.description }
    if (action.type === 'remove_module') draft.modules.splice(action.index, 1)
    if (action.type === 'set_pricing') { if (action.priceAmount) draft.priceAmount = action.priceAmount; if (action.capacity !== undefined) draft.capacity = action.capacity; if (action.paymentMode) next.paymentMode = action.paymentMode; if (action.installments) next.installments = action.installments }
  }
  return next
}

/** Problems the agent should fix itself before answering. */
function review(before: StudioState, after: StudioState, actions: Action[]): string[] {
  const problems: string[] = []
  const built = actions.some(action => action.type === 'set_modules')
  if (built && after.draft.modules.length < 3) problems.push(`The curriculum has only ${after.draft.modules.length} lesson(s). Write a complete curriculum of 3-8 lessons with set_modules.`)
  if (after.draft.modules.some(module => !module.title.trim())) problems.push('Some lessons have no title. Give every lesson a title.')
  const touched = actions.some(action => action.type !== 'go_to_step' && action.type !== 'request_publish')
  if (touched && after.draft.title.trim() && !after.draft.priceAmount) problems.push('No price is set. Set a sensible default price with set_pricing and mention it.')
  if (touched && before.draft.title === '' && after.draft.title === '' && built) problems.push('The class has no title. Add one with set_details.')
  return problems
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ message?: unknown; history?: unknown; state?: unknown }>(event).catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (message.length < 1 || message.length > 2000) throw createError({ statusCode: 422, statusMessage: 'Tell me what you’d like to do.' })
  const state = cleanState(body?.state)
  const history = sanitizeHistory(body?.history, 12)
  const validation = validateCourseDraft(state.draft)

  const indexed = { ...state, draft: { ...state.draft, modules: state.draft.modules.map((module, index) => ({ index, ...module })) }, moduleCount: state.draft.modules.length }
  const context = `CURRENT_STATE:\n${JSON.stringify({ ...indexed, draftValid: validation.valid, draftProblems: validation.errors })}\n\nCREATOR: ${message}`
  const turns: ChatTurn[] = [...history, { role: 'user', content: context }]

  try {
    let result = await askModelJson<{ reply?: unknown; actions?: unknown; suggestions?: unknown }>(SYSTEM, turns, { temperature: 0.4, maxTokens: 2500 })
    let actions = sanitizeActions(result?.actions, state.draft.modules.length)
    // Self-check: simulate the actions and give the agent one chance to fix what it got wrong.
    const problems = result ? review(state, simulate(state, actions), actions) : []
    if (problems.length) {
      const retry = await askModelJson<typeof result>(SYSTEM, [...turns, { role: 'assistant', content: JSON.stringify(result) }, { role: 'user', content: `Your actions left these problems:\n- ${problems.join('\n- ')}\nReturn the COMPLETE corrected JSON (reply, actions, suggestions) to replace your previous answer. Actions apply to the ORIGINAL state.` }], { temperature: 0.3, maxTokens: 2500 }).catch(() => null)
      const retryActions = sanitizeActions(retry?.actions, state.draft.modules.length)
      if (retry && typeof retry.reply === 'string' && review(state, simulate(state, retryActions), retryActions).length < problems.length) { result = retry; actions = retryActions }
    }
    if (result && typeof result.reply === 'string') {
      const suggestions = Array.isArray(result.suggestions) ? result.suggestions.filter((s): s is string => typeof s === 'string').map(s => s.slice(0, 80)).slice(0, 3) : []
      return { reply: result.reply.trim().slice(0, 800), actions, suggestions, source: 'ai' }
    }
  } catch { /* fall through to the offline planner */ }
  return { ...fallback(message, state), source: 'planner' }
})
