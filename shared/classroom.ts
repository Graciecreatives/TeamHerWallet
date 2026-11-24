export interface ClassSchedule {
  mode: 'self-paced' | 'live'
  startsAt: string
  timezone: string
  meetingUrl: string
  instructions: string
}
export const emptySchedule = (): ClassSchedule => ({ mode: 'self-paced', startsAt: '', timezone: 'UTC', meetingUrl: '', instructions: '' })
export function cleanSchedule(input: unknown): ClassSchedule {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const schedule = emptySchedule()
  schedule.mode = value.mode === 'live' ? 'live' : 'self-paced'
  schedule.instructions = String(value.instructions ?? '').trim().slice(0, 4000)
  schedule.timezone = String(value.timezone ?? 'UTC').slice(0, 80)
  try { new Intl.DateTimeFormat('en', { timeZone: schedule.timezone }).format() } catch { throw new Error('Choose a valid timezone, such as Africa/Lagos or Europe/London.') }
  if (value.startsAt) {
    const date = new Date(String(value.startsAt))
    if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid class start date and time.')
    schedule.startsAt = date.toISOString()
  }
  if (value.meetingUrl) {
    const url = new URL(String(value.meetingUrl))
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS meeting link without embedded credentials.')
    schedule.meetingUrl = url.href.slice(0, 2000)
  }
  if (schedule.mode === 'live' && (!schedule.startsAt || !schedule.meetingUrl || !schedule.instructions)) throw new Error('Live classes need a start time, meeting link and joining instructions.')
  return schedule
}
