import { createSession, loginUser } from '../../utils/auth'

export default defineEventHandler(async event => {
  const body = await readBody<{ email?: unknown; password?: unknown }>(event).catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const user = await loginUser(email, password)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Email or password is incorrect.' })
  await createSession(event, user.id)
  return { user }
})
