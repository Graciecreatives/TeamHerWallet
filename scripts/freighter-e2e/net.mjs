import { chromium } from '/home/dev/Downloads/HerWallet-source-2026-11-26/HerWallet-source-2026-11-24/HerWallet/node_modules/playwright/index.mjs'
const ext = process.cwd() + '/ext'
const ctx = await chromium.launchPersistentContext('profile', {
  headless: false, executablePath: '/home/dev/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`], viewport: { width: 1280, height: 900 },
})
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker')
const id = sw.url().split('/')[2]
const dump = async (p, tag) => { await p.waitForTimeout(1500); console.log(`--- ${tag} ${p.url()}\n` + (await p.locator('body').innerText()).slice(0, 500)); await p.screenshot({ path: `${tag}.png` }) }
const p = await ctx.newPage(); await p.goto(`chrome-extension://${id}/index.html#/`); await dump(p, 'n0')
const pw = p.locator('[data-testid=enter-password-input]'); if (await pw.count()) { await pw.fill('TestnetPass123!'); await p.locator('[data-testid=enter-password-submit]').click(); await p.waitForURL(u => !String(u).includes('unlock'), { timeout: 60000 }); await dump(p, 'n0b') }
await p.goto(`chrome-extension://${id}/index.html#/manage-network/network-settings`); await dump(p, 'n1')
const sel = p.locator('[data-testid=network-settings-select]')
console.log('options', await sel.locator('option').allTextContents())
await sel.selectOption({ label: 'Test Net' }).catch(async () => sel.selectOption({ index: 1 }))
await dump(p, 'n2')
await p.goto(`chrome-extension://${id}/index.html#/`); await dump(p, 'n3')
await ctx.close()
