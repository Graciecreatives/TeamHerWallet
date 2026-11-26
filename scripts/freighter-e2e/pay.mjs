import { chromium } from '/home/dev/Downloads/HerWallet-source-2026-11-26/HerWallet-source-2026-11-24/HerWallet/node_modules/playwright/index.mjs'
const ext = process.cwd() + '/ext'
const BASE = process.argv[2] ?? 'http://localhost:3000'
const CLASS = process.argv[3] ?? 'forex-for-beginners-c90665'
const ctx = await chromium.launchPersistentContext('profile', {
  headless: false, executablePath: '/home/dev/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`], viewport: { width: 1280, height: 900 },
})
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker')
const id = sw.url().split('/')[2]
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
// unlock first unless test asks to leave it locked
if (process.argv[4] !== 'locked') {
  const u = await ctx.newPage(); await u.goto(`chrome-extension://${id}/index.html#/`); await u.waitForTimeout(1500)
  const pw = u.locator('[data-testid=enter-password-input]')
  if (await pw.count()) { await pw.fill('TestnetPass123!'); await u.locator('[data-testid=enter-password-submit]').click(); await u.waitForURL(x => !String(x).includes('unlock'), { timeout: 60000 }) }
  await u.close(); log('wallet unlocked')
}
// auto-handle every Freighter popup window
ctx.on('page', async popup => {
  if (!popup.url().startsWith('chrome-extension://')) { await popup.waitForLoadState().catch(() => {}) }
  log('POPUP opened', popup.url())
  try {
    for (let i = 0; i < 40 && !popup.isClosed(); i++) {
      await popup.waitForTimeout(1000)
      if (popup.isClosed()) break
      const text = (await popup.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
      log('POPUP', popup.url().split('#')[1], '|', text)
      await popup.screenshot({ path: `popup-${Date.now()}.png` }).catch(() => {})
      const pw = popup.locator('[data-testid=enter-password-input]')
      if (await pw.count()) { await pw.fill('TestnetPass123!'); await popup.locator('[data-testid=enter-password-submit]').click(); continue }
      const btn = popup.getByRole('button', { name: /^(connect|approve|confirm|sign|allow|continue)/i }).last()
      if (await btn.count() && await btn.isEnabled()) { log('POPUP click', await btn.innerText()); await btn.click().catch(() => {}) }
    }
  } catch (e) { log('popup err', e.message) }
})
const page = await ctx.newPage()
page.on('console', m => log('page console', m.type(), m.text().slice(0, 300)))
await page.goto(`${BASE}/class/${CLASS}`); await page.waitForTimeout(4000)
await page.getByRole('button', { name: /Continue to payment/ }).click()
const pay = page.getByRole('button', { name: /Approve in Freighter/ })
await pay.click(); log('clicked pay')
const start = Date.now()
while (Date.now() - start < 240000) {
  await page.waitForTimeout(3000)
  const err = await page.locator('[role=alert]').innerText().catch(() => '')
  const done = await page.getByText(/You’re enrolled/).count()
  const steps = await page.locator('.pay-steps li').evaluateAll(l => l.map(x => x.className).join(','))
  log('state', steps, err ? 'ERROR: ' + err : '')
  if (done) { log('PASS enrolled', await page.locator('.enrol-receipt').innerText().catch(() => '')); break }
  if (err) break
}
await page.screenshot({ path: 'final.png', fullPage: true })
await ctx.close()
