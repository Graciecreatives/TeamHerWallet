// Real Chromium UI checks with mocked account/data services. No money or accounts are created.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const BASE = process.argv[2] ?? 'http://127.0.0.1:3001'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ reducedMotion: 'reduce' })
let signedIn = false
let role = 'student'
let registrations = 0
let savedMessages = []
let completed = false
let notificationRead = false
const course = () => ({ id: 'yoruba-class', title: 'Yoruba for beginners', duration: '2 weeks', modules: [{ title: 'Greetings' }], url: '/class/yoruba-class?access=private-test-token', completedModules: completed ? [0] : [], schedule: { mode: 'live', startsAt: '2026-12-01T14:00:00Z', timezone: 'Africa/Lagos', meetingUrl: 'https://meet.example.com/yoruba', instructions: 'Bring a notebook.' } })
const learning = () => ({ courses: [course()], analytics: { enrolledClasses: 1, completedModules: completed ? 1 : 0, totalModules: 1, completionPercent: completed ? 100 : 0, studyDays: completed ? 1 : 0, weeklyActivity: [{ date: '2026-11-24', count: completed ? 1 : 0 }], totalSpent: 2 }, notifications: [{ id: 'enrolled:tx', title: 'Class unlocked', message: 'Your Yoruba class is ready.', url: course().url, createdAt: '2026-11-24T12:00:00Z', read: notificationRead }], unreadCount: notificationRead ? 0 : 1 })
const user = () => ({ id: 'student-check', displayName: 'Ada Learner', email: 'ada@example.com', focus: 'Creative skills', walletAddress: '', role })
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname
  if (path === '/api/auth/me') return json(route, signedIn ? { user: user() } : { message: 'Sign in required' }, signedIn ? 200 : 401)
  if (path === '/api/auth/register') {
    const body = route.request().postDataJSON()
    assert.equal(body.role, 'student')
    registrations++
    signedIn = true
    return json(route, { user: user() })
  }
  if (path === '/api/auth/login') { signedIn = true; return json(route, { user: user() }) }
  if (path === '/api/auth/logout') { signedIn = false; return json(route, { ok: true }) }
  if (path === '/api/courses/mine') return json(route, { courses: [{ id: 'yoruba-class', title: 'Yoruba for beginners', duration: '2 weeks', description: 'Speak with family', modules: [{ title: 'Greetings' }], url: '/class/yoruba-class?access=private-test-token' }] })
  if (path === '/api/payments') return json(route, { history: [{ courseId: 'yoruba-class', title: 'Yoruba for beginners', amount: 2, transaction: 'a'.repeat(64), enrolledAt: '2026-11-24T12:00:00Z' }] })
  if (path === '/api/student/learning') return json(route, learning())
  if (path === '/api/student/progress') { completed = route.request().postDataJSON().completed; return json(route, { ok: true }) }
  if (path === '/api/student/notifications/read') { notificationRead = true; return json(route, { ok: true }) }
  if (path === '/api/student/chat') {
    if (route.request().method() === 'GET') return json(route, { messages: savedMessages })
    if (route.request().method() === 'DELETE') { savedMessages = []; return json(route, { ok: true }) }
    const input = route.request().postDataJSON()
    const courses = [{ id: 'yoruba-class', title: 'Yoruba for beginners', price: '2', url: '/class/yoruba-class' }]
    savedMessages.push({ id: `${input.requestId}:user`, role: 'user', content: input.message, createdAt: new Date().toISOString() }, { id: `${input.requestId}:assistant`, role: 'assistant', content: 'Let’s begin with Yoruba greetings.', courses, createdAt: new Date().toISOString() })
    return json(route, { reply: 'Let’s begin with Yoruba greetings.', courses, via: 'ai', saved: true })
  }
  return json(route, [])
})
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' })
  await page.getByLabel('Your name', { exact: true }).fill('Ada Learner')
  await page.getByLabel('Email address', { exact: true }).fill('ada@example.com')
  await page.getByLabel('Create a password', { exact: true }).fill('a-safe-test-password')
  await page.getByRole('radio', { name: 'Learner', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Learner', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('radio', { name: 'Creative skills', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await page.getByRole('button', { name: 'Open your dashboard' }).click()
  await expect(page).toHaveURL(`${BASE}/student`)
  assert.equal(registrations, 1)
  await expect(page.locator('a[href="/student/chat"]').first()).toBeVisible()
  console.log('PASS learner signup opens student dashboard')
  if (process.env.JCODE_SCRATCH_DIR) await page.screenshot({ path: `${process.env.JCODE_SCRATCH_DIR}/student-dashboard.png`, fullPage: true })
  await page.locator('a[href="/student/chat"]').first().click()
  await expect(page).toHaveURL(`${BASE}/student/chat`)
  await page.locator('textarea').fill('Help me learn Yoruba')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByText('Let’s begin with Yoruba greetings.')).toBeVisible()
  console.log('PASS chatbot request and reply')
  await page.reload()
  await expect(page.getByText('Let’s begin with Yoruba greetings.')).toBeVisible()
  console.log('PASS saved chat restored after reload')
  for (const section of ['classes', 'analytics', 'notifications', 'payments', 'settings']) {
    await page.locator(`a[href="/student/${section}"]`).first().click()
    await expect(page).toHaveURL(`${BASE}/student/${section}`)
  }
  await page.goto(`${BASE}/student/classes`)
  await expect(page.locator('a[href*="access=private-test-token"]').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Yoruba for beginners' })).toBeVisible()
  console.log('PASS paid class access link and account sections')
  await expect(page.getByRole('link', { name: /Join session/ })).toHaveAttribute('href', 'https://meet.example.com/yoruba')
  await page.getByRole('checkbox', { name: 'Greetings', exact: true }).check()
  await expect(page.getByRole('checkbox', { name: 'Greetings', exact: true })).toBeChecked()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Greetings', exact: true })).toBeChecked()
  await page.locator('a[href="/student/analytics"]').first().click()
  await expect(page.getByText('1 of 1 modules marked complete.', { exact: true })).toBeVisible()
  await page.locator('a[href="/student/notifications"]').first().click()
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click()
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible()
  console.log('PASS live meeting link, persistent module completion, analytics and read notifications')
  await page.goto(`${BASE}/student/chat`)
  await page.getByRole('button', { name: 'Clear conversation', exact: true }).click()
  await page.getByRole('button', { name: 'Keep conversation', exact: true }).click()
  await expect(page.getByText('Let’s begin with Yoruba greetings.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear conversation', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, delete conversation', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What would you love to learn?' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What would you love to learn?' })).toBeVisible()
  console.log('PASS confirmed conversation clearing survives reload')
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${BASE}/student/chat`)
    await expect(page.locator('textarea')).toBeVisible()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}`)
  }
  console.log('PASS mobile and desktop layout')
  await page.goto(`${BASE}/studio`)
  await expect(page).toHaveURL(`${BASE}/student`)
  await page.goto(`${BASE}/login`)
  await expect(page).toHaveURL(`${BASE}/student`)
  console.log('PASS student session cannot enter creator studio')
  signedIn = false
  await page.goto(`${BASE}/student/settings`)
  await expect(page).toHaveURL(`${BASE}/login`)
  await page.getByLabel('Email address', { exact: true }).fill('ada@example.com')
  await page.getByLabel('Password', { exact: true }).fill('a-safe-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(`${BASE}/student`)
  console.log('PASS learner login and signed-out route protection')
  role = 'creator'
  await page.goto(`${BASE}/student`)
  await expect(page).toHaveURL(`${BASE}/studio`)
  console.log('PASS creator session stays in creator workspace')
  assert.deepEqual(errors, [])
} finally { await browser.close() }
