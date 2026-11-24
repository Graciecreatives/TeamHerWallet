import { validateCourseDraft, type CourseDraft } from './course.ts'

export const studioSteps = [
  { id: 'details', label: 'Course details', shortLabel: 'Details' },
  { id: 'curriculum', label: 'Build your curriculum', shortLabel: 'Curriculum' },
  { id: 'pricing', label: 'Pricing and enrollment', shortLabel: 'Pricing' },
  { id: 'review', label: 'Review your course', shortLabel: 'Review' },
] satisfies Array<{ id: 'details' | 'curriculum' | 'pricing' | 'review'; label: string; shortLabel: string }>

export type StudioStep = (typeof studioSteps)[number]['id']

const detailFields = new Set(['title', 'description', 'targetAudience', 'duration'])
const pricingFields = new Set(['priceAmount', 'capacity'])

export function errorsForStep(draft: CourseDraft, step: StudioStep): Record<string, string> {
  const { errors } = validateCourseDraft(draft)
  if (step === 'review') return errors
  return Object.fromEntries(Object.entries(errors).filter(([key]) =>
    step === 'details' ? detailFields.has(key)
      : step === 'pricing' ? pricingFields.has(key)
        : key === 'modules' || key.startsWith('modules.'),
  ))
}

export function firstIncompleteStep(draft: CourseDraft): StudioStep {
  return studioSteps.find(({ id }) => id !== 'review' && Object.keys(errorsForStep(draft, id)).length > 0)?.id ?? 'review'
}

export function completedStepCount(draft: CourseDraft): number {
  return studioSteps.filter(({ id }) => id !== 'review' && Object.keys(errorsForStep(draft, id)).length === 0).length
}

/** Reorder in place without replacing modules or accepting non-integer indices. */
export function moveModule(draft: CourseDraft, index: number, direction: -1 | 1): boolean {
  const destination = index + direction
  if (!Number.isInteger(index) || (direction !== -1 && direction !== 1) || index < 0 || index >= draft.modules.length || destination < 0 || destination >= draft.modules.length) return false
  const module = draft.modules[index]!
  draft.modules[index] = draft.modules[destination]!
  draft.modules[destination] = module
  return true
}

/** Blank placeholder modules do not count as entered content. */
export function hasDraftContent(draft: CourseDraft): boolean {
  return [draft.title, draft.description, draft.targetAudience, draft.duration, draft.priceAmount, draft.capacity].some(value => value.trim().length > 0)
    || draft.modules.some(module => module.title.trim().length > 0 || module.description.trim().length > 0)
}

export const starterExamples: Array<{ id: string; name: string; description: string; draft: CourseDraft }> = [
  {
    id: 'workshop', name: 'Budget reset workshop', description: 'A hands-on workshop to build a practical monthly budget.',
    draft: {
      title: 'Build a budget that works for you', description: 'Map your income and expenses, choose realistic spending limits, and leave with a monthly budget you can maintain.',
      targetAudience: 'Women who want a clear starting point for managing their money.', duration: 'One 90-minute live workshop', priceAmount: '25', capacity: '20',
      modules: [
        { title: 'Understand your cash flow', description: 'Identify income, fixed costs, and flexible spending using a simple worksheet.' },
        { title: 'Create your monthly plan', description: 'Set spending limits and choose a weekly check-in routine.' },
      ],
    },
  },
  {
    id: 'short-course', name: 'Savings foundations short course', description: 'A focused three-week course for building a savings habit.',
    draft: {
      title: 'Your first emergency fund', description: 'Learn how to set a savings target, find room in your budget, and automate small contributions toward an emergency fund.',
      targetAudience: 'First-time savers looking for a manageable, step-by-step plan.', duration: '3 weeks, one hour per week', priceAmount: '60', capacity: '',
      modules: [
        { title: 'Choose a realistic target', description: 'Estimate essential expenses and set your first savings milestone.' },
        { title: 'Make space to save', description: 'Review recurring expenses and identify a sustainable contribution.' },
        { title: 'Build the habit', description: 'Create an automatic savings routine and track progress.' },
      ],
    },
  },
  {
    id: 'guided-program', name: 'Freelancer finances guided program', description: 'A six-week small-group program for navigating variable income.',
    draft: {
      title: 'Confident finances for freelancers', description: 'Build a system for variable income with weekly coaching, practical exercises, and supportive small-group accountability.',
      targetAudience: 'Self-employed women ready to organize their business and personal finances.', duration: '6 weeks with weekly live group coaching', priceAmount: '180', capacity: '12',
      modules: [
        { title: 'Map your income patterns', description: 'Review recent earnings and estimate a conservative baseline income.' },
        { title: 'Separate and organize', description: 'Create a clear routine for tracking business expenses and personal spending.' },
        { title: 'Plan for uneven months', description: 'Design a buffer and a flexible spending plan for slower periods.' },
        { title: 'Your ongoing money routine', description: 'Practice a monthly review and build a plan for the next quarter.' },
      ],
    },
  },
]
