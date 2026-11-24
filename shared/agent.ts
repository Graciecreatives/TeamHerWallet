import { parseUsdcUnits, validateCourseDraft, type CourseDraft } from './course.ts'

export interface AgentPlan {
  draft: CourseDraft
  /** What the assistant understood, shown back to the creator as a checklist. */
  understood: { label: string; value: string }[]
  /** Details the creator did not give. The assistant filled a sensible default. */
  assumptions: string[]
  /** Details the agent needs before it can propose a complete course. */
  missing: { key: 'subject' | 'price' | 'duration' | 'capacity'; label: string; question: string }[]
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 }
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const

function toNumber(token: string): number | null {
  const value = NUMBER_WORDS[token.toLowerCase()] ?? Number(token.replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? value : null
}

function titleCase(text: string): string {
  const small = new Set(['and', 'or', 'for', 'of', 'the', 'a', 'an', 'to', 'in', 'on', 'with'])
  return text.split(/\s+/).filter(Boolean).map((word, index) => index > 0 && small.has(word.toLowerCase()) ? word.toLowerCase() : word[0]!.toUpperCase() + word.slice(1)).join(' ')
}

/** Price in plain decimal USDC. Accepts "$15", "15 dollars", "15 USDC", "15.50". */
export function extractPrice(brief: string): string | null {
  const match = brief.match(/\$\s?([0-9][0-9,]*(?:\.[0-9]{1,7})?)/) ?? brief.match(/([0-9][0-9,]*(?:\.[0-9]{1,7})?)\s*(?:usdc|usd|dollars?|bucks)\b/i) ?? brief.match(/(?:costs?|price(?:d)?(?: at| is)?|charge|for)\s+([0-9][0-9,]*(?:\.[0-9]{1,7})?)\b(?!\s*(?:students?|learners?|people|seats?|weeks?|days?|lessons?|modules?|sessions?))/i)
  if (!match) return null
  const amount = match[1]!.replace(/,/g, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return parseUsdcUnits(amount) ? amount : null
}

export function extractCapacity(brief: string): string | null {
  const match = brief.match(/\b([0-9][0-9,]*|[a-z]+)\s+(?:students?|learners?|people|participants?|seats?|spots?|places?|trainees?)\b/i)
  if (!match) return null
  const value = toNumber(match[1]!)
  return value && Number.isInteger(value) && value <= 100000 ? String(value) : null
}

export function extractDuration(brief: string): string | null {
  const match = brief.match(/\b([0-9]+|[a-z]+)[\s-](day|week|month|session|lesson|hour)s?\b/i)
  if (!match) return null
  const value = toNumber(match[1]!)
  if (!value) return null
  const unit = match[2]!.toLowerCase()
  return `${value} ${unit}${value === 1 ? '' : 's'}`
}

export function extractLevel(brief: string): (typeof LEVELS)[number] | null {
  const lower = brief.toLowerCase()
  return LEVELS.find(level => lower.includes(level)) ?? null
}

/** The subject the creator teaches, with filler words removed. */
export function extractTopic(brief: string): string | null {
  const cleaned = brief.replace(/[“”"]/g, '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
  const patterns = [
    /\b(?:a|an|my|the)\s+((?:[0-9]+[\s-](?:day|week|month|session)s?[\s-]+)?[a-z][a-z' -]*?)\s+(?:class|course|programme|program|bootcamp|workshop|masterclass)\b/i,
    /\bteach(?:es|ing)?\s+(?:people\s+|women\s+|beginners\s+|students\s+)?(?:how\s+to\s+)?(.+?)(?=[.,;!?]| for \$| for [0-9]| at \$| it costs| costs?\b| and i | i want| with | to [0-9]|$)/i,
    /\b(?:class|course|programme|program|workshop)\s+(?:on|about|in)\s+(.+?)(?=[.,;!?]| for | at |$)/i,
    /^([a-z][a-z' -]{2,40}?)\s+(?:class|course|programme|program|bootcamp|workshop|masterclass)\b/i,
  ]
  for (const pattern of patterns) {
    const found = cleaned.match(pattern)?.[1]
    if (!found) continue
    const topic = found
      .replace(/\b(?:a|an|the|my|our)\b\s*/gi, '')
      .replace(/\b(?:[0-9]+|one|two|three|four|five|six|seven|eight|ten|twelve)[\s-](?:day|week|month|session)s?\b/gi, '')
      .replace(/\b(?:beginners?'?|beginner|intermediate|advanced|absolute|complete)(?=\s|$)/gi, '')
      .replace(/'/g, '')
      .replace(/\b(?:class|course|programme|program|bootcamp|workshop|masterclass|trading class)\b$/i, '')
      .replace(/\s+/g, ' ').trim()
    if (topic.length >= 3 && topic.length <= 60 && !/\b(?:students?|learners?|people|[0-9]+)\b/i.test(topic) && !/^(?:to |create|launch|start|make|run)\b/i.test(topic)) return topic
  }
  return null
}

export function missingCourseDetails(brief: string): AgentPlan['missing'] {
  const missing: AgentPlan['missing'] = []
  if (!extractTopic(brief)) missing.push({ key: 'subject', label: 'Subject', question: 'What would you like to teach?' })
  if (!extractPrice(brief)) missing.push({ key: 'price', label: 'Price', question: 'What should students pay in USDC?' })
  if (!extractDuration(brief)) missing.push({ key: 'duration', label: 'Length', question: 'How long is the class, for example 3 weeks?' })
  if (!extractCapacity(brief) && !/\b(?:unlimited|no limit|any number|open enrolment|open enrollment)\b/i.test(brief)) {
    missing.push({ key: 'capacity', label: 'Class size', question: 'How many students can join, or should enrolment be unlimited?' })
  }
  return missing
}

function moduleCount(duration: string | null): number {
  const weeks = duration?.match(/^(\d+) weeks?$/)
  if (weeks) return Math.min(Math.max(Number(weeks[1]) * 2, 3), 8)
  const units = duration?.match(/^(\d+) (?:sessions?|lessons?|days?)$/)
  if (units) return Math.min(Math.max(Number(units[1]), 2), 8)
  return 4
}

function curriculum(topic: string, level: string, count: number): CourseDraft['modules'] {
  const subject = topic.toLowerCase()
  const stages = [
    { title: `Welcome to ${topic}`, description: `How ${subject} works, the words you will hear and what you will be able to do by the end.` },
    { title: 'The core foundations', description: `The essential ideas behind ${subject}, explained with simple examples for ${level} learners.` },
    { title: 'Tools and set-up', description: `The tools, accounts and routines you need to practise ${subject} safely and confidently.` },
    { title: 'Guided practice', description: `Step-by-step exercises that turn the foundations into a repeatable method.` },
    { title: 'Common mistakes', description: `What usually goes wrong for new learners and how to avoid or recover from it.` },
    { title: 'Building your routine', description: `A weekly plan so ${subject} becomes a habit rather than a one-off effort.` },
    { title: 'Real-world case studies', description: `Worked examples from start to finish, with the reasoning behind each decision.` },
    { title: 'Your next steps', description: `A personal action plan, recommended resources and how to keep improving.` },
  ]
  return [...stages.slice(0, count - 1), stages.at(-1)!]
}

/** Deterministic agent planner. Works offline and is the fallback when no AI provider is configured. */
export function planCourseFromBrief(brief: string): AgentPlan {
  const text = brief.trim().slice(0, 2000)
  const topicRaw = extractTopic(text)
  const price = extractPrice(text)
  const capacity = extractCapacity(text)
  const duration = extractDuration(text)
  const level = extractLevel(text) ?? 'beginner'
  const assumptions: string[] = []
  const topic = titleCase(topicRaw ?? 'Your Skill')
  if (!topicRaw) assumptions.push('I couldn’t tell the subject, so I used a placeholder title. Add it in Details.')
  if (!price) assumptions.push('No price was given, so I set 10 USDC. Change it in Pricing.')
  if (!capacity) assumptions.push('No class size was given, so enrolment is unlimited.')
  if (!duration) assumptions.push('No length was given, so I planned it as self-paced.')
  const levelLabel = level === 'beginner' ? 'Beginners' : titleCase(level)
  const title = `${topic} for ${levelLabel}`.slice(0, 100)
  const draft: CourseDraft = {
    title: title.length >= 5 ? title : `${title} Class`,
    description: `A practical ${duration ? `${duration} ` : ''}${level} programme in ${topic.toLowerCase()}. You will learn the foundations, practise with guided exercises and finish with a clear plan you can keep using.${capacity ? ` Places are limited to ${capacity} students so everyone gets attention.` : ''}`,
    targetAudience: `${levelLabel} who want a clear, supported introduction to ${topic.toLowerCase()}`,
    duration: duration ?? 'Self-paced',
    priceAmount: price ?? '10',
    capacity: capacity ?? '',
    modules: curriculum(topic, level, moduleCount(duration)),
  }
  const understood = [
    { label: 'Subject', value: topicRaw ? topic : 'Not given' },
    { label: 'Level', value: titleCase(level) },
    { label: 'Price', value: price ? `${price} USDC` : 'Not given' },
    { label: 'Class size', value: capacity ? `${capacity} students` : 'Unlimited' },
    { label: 'Length', value: duration ?? 'Self-paced' },
  ]
  return { draft, understood, assumptions, missing: missingCourseDetails(text) }
}

/** Merge a model's draft with the creator's explicit numbers, which always win. */
export function reconcileAgentDraft(candidate: unknown, brief: string): CourseDraft | null {
  if (!validateCourseDraft(candidate).valid) return null
  const draft = structuredClone(candidate) as CourseDraft
  const price = extractPrice(brief)
  const capacity = extractCapacity(brief)
  if (price) draft.priceAmount = price
  if (capacity) draft.capacity = capacity
  return validateCourseDraft(draft).valid ? draft : null
}
/** An action the creator agent asks the studio to apply. */
export type AgentAction = { type: string; [key: string]: any }
