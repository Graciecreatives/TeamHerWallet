/** One run or decision per agent at a time, so two requests cannot both spend the same budget. */
const busy = new Set<string>()
export async function withAgentLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  if (busy.has(id)) throw createError({ statusCode: 409, statusMessage: 'The agent is already working. Wait for it to finish.' })
  busy.add(id)
  try { return await task() } finally { busy.delete(id) }
}
