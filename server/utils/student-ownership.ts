import { cloud, cloudConfigured } from './cloud'
import type { Enrolment, PublishedCourse } from './courses'

/**
 * Which enrolments belong to a signed-in learner: ones paid while signed in (userId), plus ones bought by the
 * learner's own AI agents (enrolment.student is the agent's wallet). Agents are linked to the account when a
 * signed-in learner creates or opens them.
 */
export async function learnerOwnership(userId: string): Promise<(enrolment: Enrolment) => boolean> {
  const agentWallets = new Set<string>()
  if (cloudConfigured()) {
    const agents = await cloud<{ publicKey: string }[]>('/agents', { query: { userId } }).catch(() => [])
    for (const agent of agents) agentWallets.add(agent.publicKey)
  }
  return enrolment => enrolment.userId === userId || agentWallets.has(enrolment.student)
}

export const ownedCourses = (courses: PublishedCourse[], owns: (enrolment: Enrolment) => boolean) =>
  courses.filter(course => course.enrolments.some(owns))
