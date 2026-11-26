import { chromium } from '/home/dev/Downloads/HerWallet-source-2026-11-26/HerWallet-source-2026-11-24/HerWallet/node_modules/playwright/index.mjs'
import fs from 'node:fs'
const ext = process.cwd() + '/ext'
const wallet = JSON.parse(fs.readFileSync('wallet.json', 'utf8'))
const PASS = 'TestnetPass123!'
const fresh = process.argv[2] !== 'reuse'
if (fresh) fs.rmSync('profile', { recursive: true, force: true })
export const ctx = await chromium.launchPersistentContext('profile', {
  headless: false, executablePath: '/home/dev/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`], viewport: { width: 1280, height: 900 },
})
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker')
export const id = sw.url().split('/')[2]
const dump = async (p, tag) => { await p.waitForTimeout(1500); console.log(`--- ${tag} ${p.url()}\n` + (await p.locator('body').innerText()).slice(0, 600)); await p.screenshot({ path: `${tag}.png` }) }

if (fresh) {
  const p = await ctx.newPage(); await p.goto(`chrome-extension://${id}/index.html#/welcome`)
  await p.getByText('Import wallet').click(); await dump(p, 'o1')
  const pw = p.locator('input[type=password]')
  await pw.nth(0).fill(PASS); await pw.nth(1).fill(PASS)
  const box = p.locator('input[type=checkbox]'); if (await box.count()) await box.first().check({ force: true })
  await p.getByRole('button').filter({ hasText: /confirm|continue|next/i }).first().click(); await dump(p, 'o2')
  const words = wallet.mnemonic.split(' ')
  const inputs = p.locator('input:not([type=checkbox])')
  if (await inputs.count() >= 12) { for (let i = 0; i < 12; i++) await inputs.nth(i).fill(words[i]) }
  else { await inputs.first().click(); await p.keyboard.insertText(wallet.mnemonic) }
  await dump(p, 'o3')
  await p.getByRole('button').filter({ hasText: /import|confirm|continue/i }).last().click(); await dump(p, 'o4')
  await p.close()
}
// switch to testnet via the popup
const p = await ctx.newPage(); await p.goto(`chrome-extension://${id}/index.html#/`); await dump(p, 'home')
if (process.argv[3] !== 'keep') await ctx.close()
