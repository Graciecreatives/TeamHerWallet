import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

const PAY_TO = 'GAFTAVL2T7COSDRTLB62FR7MCE3FXAFFZLXRIOK6QOUM34QXHRQYMVIT'

async function stubClassListImages(page: Page) {
  await page.route('**/images/**.webp', route => {
    if (!/\/images\/creator-home-\d+\.webp$/.test(route.request().url())) return route.continue()
    // Other routes can continue. This route returns valid dimensions and metadata.
    const width = 960, height = 540
    const body = Buffer.alloc(240)
    return route.fulfill({
      status: 200, contentType: 'image/webp', body,
      headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=3600', 'content-disposition': 'inline', 'width': String(width), 'height': String(height) },
    })
  })
}

test('publishing a class requires a creator session', async ({ request }) => {
  const published = await request.post('/api/courses', { data: { draft: { title: 'Unowned class' }, payTo: PAY_TO } })
  expect(published.status()).toBe(401)
})

test('a signed-in creator publishes a class protected by x402', async ({ page, request }) => {
  test.skip(process.env.E2E_LIVE_CLOUD !== '1', 'Requires E2E_LIVE_CLOUD=1 and configured Cloudflare D1 and x402 facilitator')
  const registered = await request.post('/api/auth/register', { data: {
    email: `browser-${randomUUID()}@example.test`, password: 'Test-only-password-123!',
    displayName: 'Grace', role: 'creator', focus: 'Money & budgeting', walletAddress: PAY_TO,
  } })
  expect(registered.status()).toBe(200)

  const planResponse = await request.post('/api/agent/course', { data: { brief: 'I want to create a forex beginners’ class. It costs $15, and I want to teach 30 students.' } })
  expect(planResponse.ok()).toBe(true)
  const plan = await planResponse.json()
  expect(plan.draft).toMatchObject({ priceAmount: '15', capacity: '30' })
  const published = await request.post('/api/courses', { data: { draft: plan.draft, payTo: 'ignored', creatorName: 'ignored', image: 'creator-home' } })
  expect(published.status()).toBe(201)
  const course = await published.json()
  expect(course).toMatchObject({ payTo: PAY_TO, creatorName: 'Grace' })
  await stubClassListImages(page)

  const gated = await request.get(`/api/courses/${course.id}/access`)
  expect(gated.status()).toBe(402)
  expect(gated.headers()['payment-required']).toBeTruthy()
  const required = await gated.json()
  expect(required.accepts[0]).toMatchObject({ scheme: 'exact', network: 'stellar:testnet', amount: '150000000', payTo: PAY_TO })
  expect(JSON.stringify(required)).not.toContain('description":"How forex')

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(course.url)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(plan.draft.title)
    await expect(page.getByText('30 of 30 places left')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue to payment' })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
  await page.getByRole('button', { name: 'Continue to payment' }).click()
  await expect(page.getByRole('button', { name: 'Approve in Freighter' })).toBeEnabled()
  await page.getByRole('button', { name: 'Approve in Freighter' }).click()
  await expect(page.getByRole('alert')).toContainText(/Freighter/)
})

test('unknown class shows a friendly message', async ({ page }) => {
  await page.goto('/class/does-not-exist')
  await expect(page.getByRole('heading', { name: 'This class isn’t available.' })).toBeVisible()
})
