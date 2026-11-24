import { createHash } from 'node:crypto'
import { cloud } from './cloud'

export interface SavedMessage { id: string; role: 'user' | 'assistant'; content: string; courses?: { id: string; title: string; price: string | number; url: string }[]; createdAt: string }
export interface ModuleProgress { courseId: string; moduleIndex: number; completedAt: string }
type LocalState = { messages: SavedMessage[]; progress: ModuleProgress[]; readIds: string[] }
const locks = new Map<string, Promise<unknown>>()
export async function withStudentLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(task)
  locks.set(id, next)
  try { return await next } finally { if (locks.get(id) === next) locks.delete(id) }
}
const local = () => process.env.NODE_ENV !== 'production'
const key = (id: string) => createHash('sha256').update(id).digest('hex')
const storage = () => useStorage('student-learning')
async function localState(id: string): Promise<LocalState> {
  return await storage().getItem<LocalState>(key(id)) ?? { messages: [], progress: [], readIds: [] }
}
export async function savedChat(id: string): Promise<SavedMessage[]> {
  return local() ? (await localState(id)).messages : (await cloud<{ messages: SavedMessage[] }>(`/students/${encodeURIComponent(id)}/chat`)).messages
}
/** Called under the per-account lock. A turn is one durable write, never half a conversation. */
export async function saveChatTurn(id: string, turn: { id: string; message: string; reply: string; courses: SavedMessage['courses'] }) {
  if (!local()) { await cloud(`/students/${encodeURIComponent(id)}/chat`, { method: 'POST', body: turn }); return }
  const state = await localState(id)
  if (state.messages.some(message => message.id === `${turn.id}:assistant`)) return
  const createdAt = new Date().toISOString()
  state.messages.push({ id: `${turn.id}:user`, role: 'user', content: turn.message, createdAt }, { id: `${turn.id}:assistant`, role: 'assistant', content: turn.reply, courses: turn.courses, createdAt })
  state.messages = state.messages.slice(-100)
  await storage().setItem(key(id), state)
}
export async function clearSavedChat(id: string) {
  if (!local()) { await cloud(`/students/${encodeURIComponent(id)}/chat`, { method: 'DELETE' }); return }
  const state = await localState(id)
  state.messages = []
  await storage().setItem(key(id), state)
}
export async function studentProgress(id: string): Promise<ModuleProgress[]> {
  return local() ? (await localState(id)).progress : (await cloud<{ progress: ModuleProgress[] }>(`/students/${encodeURIComponent(id)}/progress`)).progress
}
export async function updateProgress(id: string, courseId: string, moduleIndex: number, completed: boolean) {
  if (!local()) { await cloud(`/students/${encodeURIComponent(id)}/progress`, { method: 'POST', body: { courseId, moduleIndex, completed } }); return }
  const state = await localState(id)
  const existing = state.progress.find(entry => entry.courseId === courseId && entry.moduleIndex === moduleIndex)
  if (completed && !existing) state.progress.push({ courseId, moduleIndex, completedAt: new Date().toISOString() })
  if (!completed) state.progress = state.progress.filter(entry => entry !== existing)
  await storage().setItem(key(id), state)
}
export async function notificationReads(id: string): Promise<string[]> {
  return local() ? (await localState(id)).readIds : (await cloud<{ readIds: string[] }>(`/students/${encodeURIComponent(id)}/notification-reads`)).readIds
}
export async function markNotificationReads(id: string, ids: string[]) {
  if (!local()) { await cloud(`/students/${encodeURIComponent(id)}/notification-reads`, { method: 'POST', body: { ids } }); return }
  const state = await localState(id)
  state.readIds = [...new Set([...state.readIds, ...ids])].slice(-1000)
  await storage().setItem(key(id), state)
}
