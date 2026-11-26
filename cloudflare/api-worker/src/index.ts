/**
 * LearnPurse data API on Cloudflare Workers + D1. Stellar Testnet only.
 * Only the LearnPurse Nuxt server calls this (Authorization: Bearer API_SECRET).
 * Students never talk to it directly, and it never sees wallet secrets.
 */
export interface Env {
  DB: D1Database
  API_SECRET: string
}

type Row = Record<string, any>

function authorized(request: Request, env: Env): boolean {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '')
  if (!env.API_SECRET || token.length !== env.API_SECRET.length) return false
  let diff = 0
  for (let index = 0; index < token.length; index++) diff |= token.charCodeAt(index) ^ env.API_SECRET.charCodeAt(index)
  return diff === 0
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
const fail = (message: string, status = 400) => json({ error: message }, status)

function toEnrolment(row: Row) {
  return { student: row.student, transaction: row.tx_hash, network: row.network, enrolledAt: row.enrolled_at, accessToken: row.access_token, paymentNumber: row.payment_number, userId: row.user_id ?? null }
}

async function loadCourses(env: Env, where: string, binds: unknown[]) {
  const { results: courses } = await env.DB.prepare(`SELECT * FROM courses ${where} ORDER BY created_at DESC`).bind(...binds).all<Row>()
  if (!courses.length) return []
  const ids = courses.map(course => course.id)
  const { results: enrolments } = await env.DB.prepare(`SELECT * FROM enrolments WHERE course_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all<Row>()
  return courses.map(course => ({
    id: course.id,
    creatorId: course.creator_id,
    creatorName: course.creator_name,
    payTo: course.pay_to,
    image: course.image,
    accent: course.accent ?? undefined,
    tagline: course.tagline ?? undefined,
    productType: course.product_type ?? 'class',
    document: course.document ? JSON.parse(course.document) : undefined,
    draft: JSON.parse(course.draft),
    paymentPolicy: JSON.parse(course.payment_policy),
    createdAt: course.created_at,
    enrolments: enrolments.filter(enrolment => enrolment.course_id === course.id).map(toEnrolment),
  }))
}

function userOut(row: Row | null) {
  return row ? { id: row.id, email: row.email, displayName: row.display_name, role: row.role, focus: row.focus, walletAddress: row.wallet_address } : null
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const method = request.method
  const body: Row = method === 'POST' || method === 'PATCH' ? await request.json<Row>().catch(() => ({})) : {}

  if (parts[0] === 'health') return json({ ok: true, database: 'd1', network: 'TESTNET' })

  // ---- Account-scoped student learning state (server-authorized) ----
  if (parts[0] === 'students' && parts[1] && parts.length === 3) {
    const userId = decodeURIComponent(parts[1])
    const student = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").bind(userId).first()
    if (!student) return fail('Student not found', 404)
    const input: Row = body && typeof body === 'object' && !Array.isArray(body) ? body : {}

    if (parts[2] === 'chat') {
      if (method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id, role, content, courses, created_at FROM student_chat_messages WHERE user_id = ? ORDER BY rowid DESC LIMIT 100').bind(userId).all<Row>()
        return json({ messages: results.reverse().map(row => ({ id: row.id, role: row.role, content: row.content, ...(row.courses === null ? {} : { courses: JSON.parse(row.courses) }), createdAt: row.created_at })) })
      }
      if (method === 'POST') {
        if (typeof input.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)
          || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 2000
          || typeof input.reply !== 'string' || !input.reply.trim() || input.reply.length > 12000
          || !Array.isArray(input.courses) || input.courses.length > 4) return fail('Invalid chat exchange')
        const courses = JSON.stringify(input.courses)
        if (courses.length > 32000) return fail('Course recommendations are too large')
        const createdAt = new Date().toISOString()
        // One multi-row statement keeps both messages atomic, including idempotent retries.
        await env.DB.prepare(`INSERT OR IGNORE INTO student_chat_messages(user_id, id, role, content, courses, created_at)
          VALUES (?, ?, 'user', ?, NULL, ?), (?, ?, 'assistant', ?, ?, ?)`)
          .bind(userId, `${input.id}:user`, input.message, createdAt, userId, `${input.id}:assistant`, input.reply, courses, createdAt).run()
        return json({ ok: true })
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM student_chat_messages WHERE user_id = ?').bind(userId).run()
        return json({ ok: true })
      }
    }

    if (parts[2] === 'progress') {
      if (method === 'GET') {
        const { results } = await env.DB.prepare('SELECT course_id, module_index, completed_at FROM student_module_progress WHERE user_id = ? ORDER BY course_id, module_index').bind(userId).all<Row>()
        return json({ progress: results.map(row => ({ courseId: row.course_id, moduleIndex: row.module_index, completedAt: row.completed_at })) })
      }
      if (method === 'POST') {
        if (typeof input.courseId !== 'string' || !input.courseId || input.courseId.length > 200
          || !Number.isSafeInteger(input.moduleIndex) || input.moduleIndex < 0 || typeof input.completed !== 'boolean') return fail('Invalid module completion')
        const enrolled = await env.DB.prepare(`SELECT c.draft FROM courses c WHERE c.id = ? AND EXISTS
          (SELECT 1 FROM enrolments e WHERE e.course_id = c.id AND e.user_id = ?)`)
          .bind(input.courseId, userId).first<{ draft: string }>()
        if (!enrolled) return fail('Learner is not enrolled', 403)
        const draft = JSON.parse(enrolled.draft)
        if (!Array.isArray(draft?.modules) || input.moduleIndex >= draft.modules.length) return fail('Invalid module index')
        if (input.completed) {
          await env.DB.prepare(`INSERT INTO student_module_progress(user_id, course_id, module_index, completed_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, course_id, module_index) DO NOTHING`)
            .bind(userId, input.courseId, input.moduleIndex, new Date().toISOString()).run()
        } else {
          await env.DB.prepare('DELETE FROM student_module_progress WHERE user_id = ? AND course_id = ? AND module_index = ?').bind(userId, input.courseId, input.moduleIndex).run()
        }
        return json({ ok: true })
      }
    }

    if (parts[2] === 'notification-reads') {
      if (method === 'GET') {
        const { results } = await env.DB.prepare('SELECT notification_id FROM student_notification_reads WHERE user_id = ? ORDER BY notification_id').bind(userId).all<{ notification_id: string }>()
        return json({ readIds: results.map(row => row.notification_id) })
      }
      if (method === 'POST') {
        if (!Array.isArray(input.ids) || input.ids.length > 200 || input.ids.some((id: unknown) => typeof id !== 'string' || !id.trim() || id.length > 200)) return fail('Invalid notification IDs')
        const ids = [...new Set(input.ids as string[])]
        // Chunk below SQLite's bound-variable limit, with one transaction for the whole request.
        if (ids.length) await env.DB.batch(Array.from({ length: Math.ceil(ids.length / 40) }, (_, index) => {
          const chunk = ids.slice(index * 40, (index + 1) * 40)
          return env.DB.prepare(`INSERT OR IGNORE INTO student_notification_reads(user_id, notification_id) VALUES ${chunk.map(() => '(?, ?)').join(', ')}`)
            .bind(...chunk.flatMap(id => [userId, id]))
        }))
        return json({ ok: true })
      }
    }
    return fail('Not found', 404)
  }

  // ---- Classroom settings and private teacher/learner threads (server-authorized) ----
  if (parts[0] === 'classrooms' && parts[1]) {
    const id = parts[1]
    const exists = await env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(id).first()
    if (!exists) return fail('Class not found', 404)
    if (!parts[2] && method === 'GET') {
      const row = await env.DB.prepare('SELECT settings FROM classroom_settings WHERE course_id = ?').bind(id).first<Row>()
      return json(row ? JSON.parse(row.settings) : null)
    }
    if (!parts[2] && method === 'PATCH') {
      await env.DB.prepare('INSERT INTO classroom_settings(course_id, settings, updated_at) VALUES (?, ?, ?) ON CONFLICT(course_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at').bind(id, JSON.stringify(body), new Date().toISOString()).run()
      return json({ ok: true })
    }
    if (parts[2] === 'messages') {
      if (method === 'GET') {
        const student = url.searchParams.get('student')
        const query = student ? 'SELECT * FROM classroom_messages WHERE course_id = ? AND student = ? ORDER BY created_at DESC LIMIT 100' : 'SELECT * FROM classroom_messages WHERE course_id = ? ORDER BY created_at DESC LIMIT 200'
        const { results } = await env.DB.prepare(query).bind(...(student ? [id, student] : [id])).all()
        return json(results.reverse())
      }
      if (method === 'POST') {
        if (!body.student || !['teacher', 'student'].includes(body.author) || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) return fail('Invalid message')
        const enrolled = await env.DB.prepare('SELECT 1 FROM enrolments WHERE course_id = ? AND student = ? LIMIT 1').bind(id, body.student).first()
        if (!enrolled) return fail('Learner is not enrolled', 403)
        // A small persistent throttle also works across multiple Nuxt instances.
        const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM classroom_messages WHERE course_id = ? AND student = ? AND author = ? AND created_at > ?").bind(id, body.student, body.author, new Date(Date.now() - 60000).toISOString()).first<Row>()
        if (Number(recent?.n) >= 10) return fail('Please wait a minute before sending more messages.', 429)
        const item = { id: crypto.randomUUID(), course_id: id, student: body.student, author: body.author, name: String(body.name || (body.author === 'teacher' ? 'Teacher' : 'Learner')).slice(0, 80), message: body.message.trim(), created_at: new Date().toISOString() }
        await env.DB.prepare('INSERT INTO classroom_messages(id, course_id, student, author, name, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(item.id, id, item.student, item.author, item.name, item.message, item.created_at).run()
        return json(item, 201)
      }
    }
  }

  // ---- Courses ----
  if (parts[0] === 'courses') {
    const id = parts[1]
    if (method === 'GET' && !id) {
      const payTo = url.searchParams.get('payTo')
      const creatorId = url.searchParams.get('creatorId')
      if (creatorId) return json(await loadCourses(env, 'WHERE creator_id = ?', [creatorId]))
      return json(payTo ? await loadCourses(env, 'WHERE pay_to = ?', [payTo]) : await loadCourses(env, '', []))
    }
    if (method === 'GET' && id && !parts[2]) {
      const [course] = await loadCourses(env, 'WHERE id = ?', [id])
      return course ? json(course) : fail('Not found', 404)
    }
    if (method === 'POST' && !id) {
      const course = body
      if (!course.id || !course.payTo || !course.draft) return fail('Missing course fields')
      const insertCourse = env.DB.prepare('INSERT INTO courses (id, creator_id, creator_name, pay_to, image, accent, tagline, draft, payment_policy, created_at, product_type, document) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(course.id, course.creatorId ?? null, course.creatorName, course.payTo, course.image ?? 'creator-home', course.accent ?? null, course.tagline ?? null, JSON.stringify(course.draft), JSON.stringify(course.paymentPolicy ?? { mode: 'single' }), course.createdAt ?? new Date().toISOString(), course.productType ?? 'class', course.document ? JSON.stringify(course.document) : null)
      if (course.classroom) {
        await env.DB.batch([insertCourse, env.DB.prepare('INSERT INTO classroom_settings(course_id, settings, updated_at) VALUES (?, ?, ?)').bind(course.id, JSON.stringify(course.classroom), new Date().toISOString())])
      } else await insertCourse.run()
      return json({ ok: true }, 201)
    }
    if (method === 'POST' && id && parts[2] === 'enrolments') {
      const enrolment = body
      if (!enrolment.student || !enrolment.transaction || !enrolment.accessToken) return fail('Missing enrolment fields')
      // Seat check and insert in one statement, so two payments cannot both take the last seat.
      const result = await env.DB.prepare(`INSERT INTO enrolments (course_id, student, tx_hash, network, enrolled_at, access_token, payment_number, user_id)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 FROM courses c WHERE c.id = ?1 AND (
          json_extract(c.draft, '$.capacity') IS NULL OR json_extract(c.draft, '$.capacity') = ''
          OR EXISTS (SELECT 1 FROM enrolments e WHERE e.course_id = ?1 AND e.student = ?2)
          OR (SELECT COUNT(DISTINCT student) FROM enrolments e WHERE e.course_id = ?1) < CAST(json_extract(c.draft, '$.capacity') AS INTEGER))`)
        .bind(id, enrolment.student, enrolment.transaction, enrolment.network ?? 'stellar:testnet', enrolment.enrolledAt ?? new Date().toISOString(), enrolment.accessToken, enrolment.paymentNumber ?? 1, enrolment.userId ?? null)
        .run()
        .catch((error: Error) => { if (/UNIQUE/.test(error.message)) return { meta: { changes: 0 }, duplicate: true }; throw error })
      if ((result as any).duplicate) return fail('Transaction already recorded', 409)
      if (!result.meta.changes) return fail('Class is full or missing', 409)
      const [course] = await loadCourses(env, 'WHERE id = ?', [id])
      return json(course, 201)
    }
  }

  // ---- Users and sessions (creator accounts) ----
  if (parts[0] === 'users') {
    if (method === 'POST' && !parts[1]) {
      const user = body
      const id = crypto.randomUUID()
      try {
        await env.DB.prepare('INSERT INTO users (id, email, password_hash, display_name, role, focus, wallet_address) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(id, user.email, user.passwordHash, user.displayName, user.role, user.focus ?? '', user.walletAddress ?? null).run()
      } catch (error) {
        if (/UNIQUE/.test((error as Error).message)) return fail('Email already registered', 409)
        throw error
      }
      return json(userOut(await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<Row>()), 201)
    }
    if (method === 'GET' && parts[1] === 'by-email') {
      const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(url.searchParams.get('email') ?? '').first<Row>()
      return row ? json({ ...userOut(row), passwordHash: row.password_hash }) : fail('Not found', 404)
    }
    if (method === 'PATCH' && parts[1]) {
      const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(parts[1]).first<Row>()
      if (!row) return fail('Not found', 404)
      await env.DB.prepare('UPDATE users SET display_name = ?, focus = ?, wallet_address = ? WHERE id = ?')
        .bind(body.displayName ?? row.display_name, body.focus ?? row.focus, body.walletAddress === undefined ? row.wallet_address : body.walletAddress, parts[1]).run()
      return json(userOut(await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(parts[1]).first<Row>()))
    }
  }

  if (parts[0] === 'sessions') {
    const hash = parts[1]
    if (method === 'POST' && !hash) {
      await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(body.tokenHash, body.userId, body.expiresAt).run()
      return json({ ok: true }, 201)
    }
    if (method === 'GET' && hash) {
      const row = await env.DB.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?').bind(hash, new Date().toISOString()).first<Row>()
      return row ? json(userOut(row)) : fail('Not found', 404)
    }
    if (method === 'DELETE' && hash) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run()
      return json({ ok: true })
    }
  }

  // ---- Learning agents (AI buyers with owner-set spending rules) ----
  if (parts[0] === 'agents') {
    const id = parts[1]
    const agentOut = (row: Row) => ({ id: row.id, ownerTokenHash: row.owner_token_hash, name: row.name, learner: row.learner, goal: row.goal, publicKey: row.public_key, secretEnc: row.secret_enc, purseId: row.purse_id ?? null, ownerSecretEnc: row.owner_secret_enc ?? null, userId: row.user_id ?? null, policy: JSON.parse(row.policy), network: row.network, createdAt: row.created_at })
    if (method === 'GET' && !id) {
      const userId = url.searchParams.get('userId')
      if (!userId) return fail('userId is required')
      const { results } = await env.DB.prepare('SELECT * FROM learning_agents WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(userId).all<Row>()
      return json(results.map(agentOut))
    }
    if (method === 'POST' && !id) {
      const agent = body
      if (!agent.id || !agent.ownerTokenHash || !agent.publicKey || agent.secretEnc === undefined || !agent.policy) return fail('Missing agent fields')
      // One wallet maps to one agent: reissue the owner link instead of inserting a duplicate row.
      const existing = await env.DB.prepare('SELECT id FROM learning_agents WHERE public_key = ?').bind(agent.publicKey).first()
      if (existing) {
        await env.DB.prepare('UPDATE learning_agents SET owner_token_hash = ? WHERE public_key = ?').bind(agent.ownerTokenHash, agent.publicKey).run()
        const { results } = await env.DB.prepare('SELECT * FROM learning_agents WHERE id = ?').bind(existing.id).all<Row>()
        const row = results[0]
        return json({ ok: true, existing: true, agent: row ? agentOut(row) : null }, 200)
      }
      await env.DB.prepare('INSERT INTO learning_agents (id, owner_token_hash, name, learner, goal, public_key, secret_enc, policy, purse_id, owner_secret_enc, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(agent.id, agent.ownerTokenHash, agent.name ?? 'Learning agent', agent.learner ?? '', agent.goal ?? '', agent.publicKey, agent.secretEnc, JSON.stringify(agent.policy), agent.purseId ?? null, agent.ownerSecretEnc ?? null, agent.userId ?? null).run()
      return json({ ok: true }, 201)
    }
    if (method === 'GET' && id && !parts[2]) {
      const row = await env.DB.prepare('SELECT * FROM learning_agents WHERE id = ?').bind(id).first<Row>()
      return row ? json(agentOut(row)) : fail('Not found', 404)
    }
    if (method === 'PATCH' && id && !parts[2]) {
      const row = await env.DB.prepare('SELECT * FROM learning_agents WHERE id = ?').bind(id).first<Row>()
      if (!row) return fail('Not found', 404)
      await env.DB.prepare('UPDATE learning_agents SET name = ?, learner = ?, goal = ?, policy = ?, purse_id = COALESCE(?, purse_id), user_id = COALESCE(user_id, ?) WHERE id = ?')
        .bind(body.name ?? row.name, body.learner ?? row.learner, body.goal ?? row.goal, body.policy ? JSON.stringify(body.policy) : row.policy, body.purseId ?? null, body.userId ?? null, id).run()
      return json(agentOut((await env.DB.prepare('SELECT * FROM learning_agents WHERE id = ?').bind(id).first<Row>())!))
    }
    if (id && parts[2] === 'events') {
      if (method === 'POST') {
        await env.DB.prepare('INSERT INTO agent_events (agent_id, kind, message, data, amount, course_id) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(id, String(body.kind ?? 'note'), String(body.message ?? '').slice(0, 2000), JSON.stringify(body.data ?? {}), body.amount ?? null, body.courseId ?? null).run()
        return json({ ok: true }, 201)
      }
      if (method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM agent_events WHERE agent_id = ? ORDER BY id DESC LIMIT 200').bind(id).all<Row>()
        return json(results.map(row => ({ id: row.id, kind: row.kind, message: row.message, data: JSON.parse(row.data), amount: row.amount, courseId: row.course_id, createdAt: row.created_at })))
      }
    }
  }

  // ---- Class requests (demand from learning agents) ----
  if (parts[0] === 'requests') {
    const id = parts[1]
    const out = (row: Row) => ({ id: row.id, agentId: row.agent_id, topic: row.topic, learner: row.learner, brief: row.brief, maxPrice: row.max_price, status: row.status, courseId: row.course_id, createdAt: row.created_at })
    if (method === 'GET' && !id) {
      const status = url.searchParams.get('status')
      const agent = url.searchParams.get('agentId')
      const where = [status ? 'status = ?' : '', agent ? 'agent_id = ?' : ''].filter(Boolean)
      const { results } = await env.DB.prepare(`SELECT * FROM class_requests ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 100`).bind(...[status, agent].filter(Boolean)).all<Row>()
      return json(results.map(out))
    }
    if (method === 'POST' && !id) {
      if (!body.id || !body.agentId || !body.topic || !body.brief) return fail('Missing request fields')
      await env.DB.prepare('INSERT INTO class_requests (id, agent_id, topic, learner, brief, max_price) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(body.id, body.agentId, String(body.topic).slice(0, 120), String(body.learner ?? '').slice(0, 200), String(body.brief).slice(0, 1000), Number(body.maxPrice) || 0).run()
      return json({ ok: true }, 201)
    }
    if (method === 'PATCH' && id) {
      await env.DB.prepare('UPDATE class_requests SET status = COALESCE(?, status), course_id = COALESCE(?, course_id) WHERE id = ?').bind(body.status ?? null, body.courseId ?? null, id).run()
      const row = await env.DB.prepare('SELECT * FROM class_requests WHERE id = ?').bind(id).first<Row>()
      return row ? json(out(row)) : fail('Not found', 404)
    }
  }

  return fail('Not found', 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!authorized(request, env)) return fail('Unauthorized', 401)
    try { return await route(request, env) }
    catch (error) { console.error(error); return fail('Database error', 500) }
  },
  // Daily cleanup of expired sessions.
  async scheduled(_event: ScheduledEvent, env: Env) {
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(new Date().toISOString()).run()
  },
}
