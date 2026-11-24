/** Spending rules for learning agents. Pure, so the rules are tested apart from the AI and the chain. */
export interface AgentPolicy {
  /** Never pay more than this for one class (USDC). */
  perClassMax: number
  /** Never spend more than this in total (USDC). */
  totalBudget: number
  /** Classes above this price wait for the owner to approve them (USDC). 0 = always ask. */
  approvalAbove: number
  /** Most classes to buy in one run. */
  maxPerRun: number
}

export interface PolicyEvent { kind: string; amount?: number | null; courseId?: string | null; data?: Record<string, any> }

export const DEFAULT_POLICY: AgentPolicy = { perClassMax: 5, totalBudget: 10, approvalAbove: 3, maxPerRun: 2 }

const clampMoney = (value: unknown, fallback: number, max = 1000) => {
  const number = Number(value)
  return value !== null && value !== '' && Number.isFinite(number) && number >= 0 ? Math.min(Math.round(number * 100) / 100, max) : fallback
}

export function cleanPolicy(input: any, base: AgentPolicy = DEFAULT_POLICY): AgentPolicy {
  const policy = {
    perClassMax: clampMoney(input?.perClassMax, base.perClassMax),
    totalBudget: clampMoney(input?.totalBudget, base.totalBudget),
    approvalAbove: clampMoney(input?.approvalAbove, base.approvalAbove),
    maxPerRun: Math.max(1, Math.min(5, Math.floor(Number(input?.maxPerRun ?? base.maxPerRun)) || 1)),
  }
  if (policy.perClassMax > policy.totalBudget) policy.perClassMax = policy.totalBudget
  return policy
}

/** Why a payment is not allowed, or null. */
export function policyBlock(policy: AgentPolicy, price: number, spent: number): string | null {
  if (!(price > 0)) return 'The class has no valid price.'
  if (price > policy.perClassMax) return `${price} USDC is above the ${policy.perClassMax} USDC per-class limit.`
  if (spent + price > policy.totalBudget + 1e-9) return `Buying it would bring spending to ${(spent + price).toFixed(2)} USDC, over the ${policy.totalBudget} USDC budget.`
  return null
}

export const needsApproval = (policy: AgentPolicy, price: number) => price > policy.approvalAbove

export function spentFrom(events: PolicyEvent[]): number {
  return events.filter(event => event.kind === 'paid').reduce((sum, event) => sum + Number(event.amount ?? 0), 0)
}

export function ownedCourses(events: PolicyEvent[]): Set<string> {
  return new Set(events.filter(event => event.kind === 'paid' && event.courseId).map(event => event.courseId!))
}

/** Events newest first. A request is cleared by a later paid, approved or declined event for the same class.
 *  A failed payment after approval re-opens it, so the owner can try again (the purse never releases twice). */
export function pendingApprovals<T extends PolicyEvent>(events: T[]): T[] {
  const settled = new Set<string>()
  const reopened = new Set<string>()
  const pending: T[] = []
  for (const event of events) {
    if (!event.courseId) continue
    if (event.kind === 'failed' && !settled.has(event.courseId)) reopened.add(event.courseId)
    else if (event.kind === 'approved' && reopened.has(event.courseId)) continue
    else if (['paid', 'approved', 'declined'].includes(event.kind)) settled.add(event.courseId)
    else if (event.kind === 'approval_needed' && !settled.has(event.courseId)) { pending.push(event); settled.add(event.courseId) }
  }
  return pending
}
