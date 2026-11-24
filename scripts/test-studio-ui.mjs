import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Window } from 'happy-dom'

// Mounts the real app SFCs and PrimeVue in Happy DOM. Exercises behaviour, not visual layout.
const window = new Window({ url: 'http://localhost:3000', width: 1440, height: 1000 })
for (const key of ['window', 'document', 'navigator', 'localStorage', 'Document', 'ShadowRoot', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'Element', 'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'ResizeObserver', 'CSS']) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? window : window[key] })
}
for (const key of ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia']) globalThis[key] = window[key].bind(window)
window.scrollTo = () => {}
// Server stub: the real agent planner answers /api/agent/course, publishing echoes a listing.
const { planCourseFromBrief } = await import('../shared/agent.ts')
const requests = []
globalThis.fetch = async (url, init = {}) => {
  requests.push({ url: String(url), init })
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body, headers: new Map() })
  if (String(url) === '/api/agent/course') return json(200, { ...planCourseFromBrief(JSON.parse(init.body).brief), source: 'planner' })
  if (String(url) === '/api/courses' && init.method === 'POST') { const body = JSON.parse(init.body); return json(201, { id: 'stories-abc123', url: '/class/stories-abc123', title: body.draft.title, priceAmount: body.draft.priceAmount, capacity: body.draft.capacity, enrolled: 0, seatsLeft: Number(body.draft.capacity) || null }) }
  if (String(url).startsWith('/api/courses?')) return json(200, [])
  // Auth stubs: signup registers an account, the session check reflects it.
  if (String(url) === '/api/auth/register') { const body = JSON.parse(init.body); globalThis.__session = { displayName: body.displayName, email: body.email, focus: body.focus, walletAddress: body.walletAddress }; return json(201, { user: globalThis.__session }) }
  if (String(url) === '/api/auth/me') return globalThis.__session ? json(200, { user: globalThis.__session }) : json(401, {})
  if (String(url) === '/api/auth/logout') { globalThis.__session = null; return json(200, { ok: true }) }
  if (String(url) === '/api/requests') return json(200, [])
  return json(404, {})
}
const { build } = await import('vite')
const { default: vue } = await import('@vitejs/plugin-vue')
const { createApp, nextTick } = await import('vue')
const { default: PrimeVue } = await import('primevue/config')
await mkdir('.nuxt', { recursive: true })
const temp = await mkdtemp(resolve('.nuxt/studio-dom-'))
const VALID_ADDRESS = 'GAFTAVL2T7COSDRTLB62FR7MCE3FXAFFZLXRIOK6QOUM34QXHRQYMVIT'
let app
const errors = []
const flush = async (ms = 120) => { await nextTick(); await new Promise(r => setTimeout(r, ms)); await nextTick() }
const query = selector => { const element = document.querySelector(selector); assert.ok(element, `Missing ${selector}`); return element }
const button = (text, root = document) => {
  const element = [...root.querySelectorAll('button')].find(el => el.textContent.replace(/\s+/g, ' ').trim() === text)
  assert.ok(element, `Missing button: ${text}`)
  return element
}
const click = async element => { assert.equal(element.disabled, false, `Control should be enabled: ${element.textContent.trim()}`); element.click(); await flush() }
const fill = async (selector, value) => { const element = query(selector); element.value = value; element.dispatchEvent(new window.Event('input', { bubbles: true })); await nextTick() }
const submit = async selector => { query(selector).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await flush() }
const heading = () => query('h1').textContent.trim()

try {
  const result = await build({
    configFile: false, logLevel: 'error', plugins: [vue()],
    resolve: { alias: { '#shared': resolve('shared') } },
    build: { write: false, minify: false, lib: { entry: resolve('app/app.vue'), formats: ['es'] },
      rollupOptions: { external: id => id === 'vue' || id.startsWith('primevue/') || id === '@lucide/vue' || id.startsWith('@stellar/') } },
  })
  const chunk = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry)
  assert.ok(chunk)
  const entry = resolve(temp, 'app.mjs')
  await writeFile(entry, chunk.code)
  const { default: App } = await import(pathToFileURL(entry).href)
  function mount() {
    document.body.innerHTML = '<div id="test-app"></div>'
    app = createApp(App).use(PrimeVue, { unstyled: true })
    app.config.errorHandler = error => { errors.push(error) }
    app.mount('#test-app')
  }

  // Landing
  mount()
  await flush()
  assert.match(heading(), /Let your agent pay/)
  assert.ok(document.querySelector('#features') && document.querySelector('#how'))
  assert.equal(document.querySelectorAll('.showcase').length, 3)
  const question = query('#question-0')
  assert.equal(question.getAttribute('aria-expanded'), 'false')
  await click(question)
  assert.equal(question.getAttribute('aria-expanded'), 'true')
  assert.match(query('#answer-0').textContent, /writes the listing/)
  await click(query('#question-1'))
  assert.equal(question.getAttribute('aria-expanded'), 'false', 'Opening a second question closes the first')
  await click(query('.showcase-photo'))
  assert.match(query('[role="dialog"]').textContent, /Inside the course/)
  assert.ok(query('[role="dialog"] .course-modules li'))
  await click(button('Keep exploring'))
  assert.equal(document.querySelector('[role="dialog"]'), null)
  await click(button('Want to teach? Create a class with AI'))

  // Signup step 1: validation and focus
  assert.match(heading(), /get you set up/)
  assert.equal(query('.setup-progress').getAttribute('aria-valuenow'), '1')
  await submit('.auth-card form')
  assert.equal(query('#signup-name').getAttribute('aria-invalid'), 'true')
  assert.equal(document.activeElement.id, 'signup-name', 'First invalid field is focused')
  await fill('#signup-name', 'Amara Okafor')
  await fill('#signup-email', 'not-an-email')
  await submit('.auth-card form')
  assert.match(query('#signup-email-error').textContent, /doesn’t look quite right/)
  await fill('#signup-email', 'amara@example.com')
  await fill('#signup-password', 'correct horse battery')
  await submit('.auth-card form')

  // Step 2: focus choice
  assert.match(heading(), /What will you teach/)
  await submit('.auth-card form')
  assert.match(query('.auth-card .field-error').textContent, /Choose what you’d like to teach/)
  assert.equal(document.activeElement.getAttribute('role'), 'radio', 'Choice validation focuses the first operable radio')
  const radio = [...document.querySelectorAll('[role="radio"]')].find(el => el.textContent.includes('Money & budgeting'))
  await click(radio)
  assert.equal(radio.getAttribute('aria-checked'), 'true')
  radio.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
  await flush()
  assert.match(document.activeElement.textContent, /Business/)
  assert.equal(document.activeElement.getAttribute('aria-checked'), 'true')
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
  await flush()
  assert.equal(document.activeElement, radio)
  assert.equal(radio.getAttribute('tabindex'), '0')
  await click(query('[aria-label="Previous step"]'))
  assert.equal(query('#signup-name').value, 'Amara Okafor', 'Going back keeps entered values')
  await submit('.auth-card form')
  await submit('.auth-card form')

  // Step 3: wallet. Freighter absent in DOM test, so use the paste path.
  assert.match(heading(), /Connect your wallet/)
  assert.equal(button('Create profile').disabled, true, 'Cannot create without a wallet or explicit skip')
  await click(button('Paste an address instead'))
  await fill('#signup-wallet', 'GBADADDRESS')
  await submit('.auth-card form')
  assert.match(query('#signup-wallet-error').textContent, /valid Stellar address/)
  await fill('#signup-wallet', VALID_ADDRESS)
  await submit('.auth-card form')

  // Success
  assert.match(heading(), /Welcome, Amara/)
  const storedProfile = JSON.parse(localStorage.getItem('learnpurse.profile.v1'))
  assert.deepEqual(storedProfile, { name: 'Amara Okafor', email: 'amara@example.com', focus: 'Money & budgeting', walletAddress: VALID_ADDRESS })
  await click(button('Open studio'))

  // Studio: the AI assistant turns one message into a complete class
  await fill('#agent-brief', 'I want to create a forex beginners class. It costs $15, and I want to teach 30 students over 2 weeks.')
  await submit('.agent-form')
  await flush(200)
  assert.match(query('.agent-result').textContent, /Forex for Beginners/)
  assert.equal(query('#title').value, 'Forex for Beginners', 'Approval loads the generated draft')
  await click(query('.segmented .seg:nth-of-type(4)'))
  assert.match(query('#step-heading').textContent, /Looking good/, 'Creator opens the review step explicitly')
  assert.match(query('.review-list').textContent, /15 USDC · 30 places/)
  // Back to a blank draft for the manual, step-by-step flow below.
  app.unmount()
  localStorage.removeItem('learnpurse.course-draft.v1')
  mount()
  await flush()
  await click(button('Open studio'))
  assert.match(query('#step-heading').textContent, /course about/)
  assert.equal(query('.avatar').textContent.trim(), 'AO')
  await click(query('.avatar'))
  assert.match(query('.menu').textContent, /GAFT…MVIT/)
  await click(query('.avatar'))
  await submit('#course-editor')
  assert.equal(query('#title').getAttribute('aria-invalid'), 'true')
  assert.equal(document.activeElement.id, 'title')
  await click(query('.segmented .seg:nth-of-type(3)'))
  assert.match(query('#step-heading').textContent, /course about/, 'Cannot skip ahead past invalid steps')
  await fill('#title', 'Stories worth telling')
  await fill('#description', 'Find your voice and write a meaningful personal story with confidence.')
  await fill('#audience', 'First-time storytellers')
  await fill('#duration', '2 weeks')
  assert.equal(query('.preview-pane h3').textContent, 'Stories worth telling', 'Live preview updates')
  assert.match(query('.preview-pane .course-by').textContent, /Amara Okafor/)
  await flush(300)
  assert.match(query('button[aria-label="Save draft"]').textContent, /Save draft/)
  const leave = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(leave)
  assert.equal(leave.defaultPrevented, true)
  await click(query('.studio [aria-label="LearnPurse home"]'))
  assert.match(query('[role="dialog"]').textContent, /Keep your latest changes/)
  await click(button('Stay here'))
  assert.equal(query('#title').value, 'Stories worth telling')
  await click(query('.studio [aria-label="LearnPurse home"]'))
  await click(button('Save and leave'))
  assert.match(heading(), /Let your agent pay/)
  await click(button('Open studio'))
  assert.equal(query('#title').value, 'Stories worth telling', 'Save-and-leave preserves an incomplete draft')
  await submit('#course-editor')
  assert.match(query('#step-heading').textContent, /Plan the modules/)
  await click(button('Back'))
  assert.equal(query('#title').value, 'Stories worth telling')
  await submit('#course-editor')
  await submit('#course-editor')
  assert.equal(document.activeElement.id, 'module-title-0')
  await fill('#module-title-0', 'Find your voice')
  await fill('#module-description-0', 'Reflect on your experiences and choose a story.')
  await click(button('Add module'))
  assert.equal(document.activeElement.id, 'module-title-1')
  await fill('#module-title-1', 'Shape your story')
  await fill('#module-description-1', 'Draft it and share for feedback.')
  await click(query('[aria-label="Move module 2 up"]'))
  assert.equal(query('#module-title-0').value, 'Shape your story')
  await click(query('[aria-label="Remove module 1"]'))
  assert.match(query('[role="dialog"]').textContent, /Remove this module/)
  await click(button('Keep my work'))
  assert.equal(document.querySelectorAll('.module').length, 2)
  await click(query('[aria-label="Remove module 1"]'))
  await click(button('Remove module'))
  await flush(250)
  assert.equal(document.querySelectorAll('.module').length, 1)
  assert.equal(query('#module-title-0').value, 'Find your voice')
  await submit('#course-editor')
  assert.match(query('#step-heading').textContent, /Set your price/)
  assert.match(query('.payout').textContent, /Paid to GAFT…MVIT/)
  await fill('#price', '1.00000001')
  await submit('#course-editor')
  assert.equal(query('#price').getAttribute('aria-invalid'), 'true')
  await fill('#price', '25.0000001')
  await fill('#capacity', '12')
  await submit('#course-editor')
  assert.match(query('#step-heading').textContent, /Looking good/)
  assert.match(query('.review-status').textContent, /Ready to save/)
  assert.equal(document.querySelectorAll('.seg-check.on').length, 3)
  assert.equal(button('Publish').disabled, false)
  await click(button('Publish'))
  await flush(200)
  const publishRequest = requests.find(request => request.url === '/api/courses' && request.init.method === 'POST')
  assert.ok(publishRequest, 'Publishing posts the course')
  assert.equal(JSON.parse(publishRequest.init.body).payTo, VALID_ADDRESS, 'Payments go to the creator wallet')
  assert.match(query('.publish-live').textContent, /Your class is live/)
  await submit('#course-editor')
  const saved = localStorage.getItem('learnpurse.course-draft.v1')
  assert.equal(JSON.parse(saved).draft.priceAmount, '25.0000001')
  await flush(300)
  assert.match(query('button[aria-label="Save draft"]').textContent, /Saved/)
  const savedLeave = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(savedLeave)
  assert.equal(savedLeave.defaultPrevented, false)

  // Preview sheet, export, Escape
  await click(query('.preview-toggle'))
  const sheet = query('[role="dialog"]')
  assert.equal(sheet.getAttribute('aria-modal'), 'true')
  assert.equal(sheet.querySelectorAll('.course-modules li').length, 1)
  let exported
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, anchorClick = window.HTMLAnchorElement.prototype.click
  URL.createObjectURL = blob => { exported = blob; return 'blob:test' }
  URL.revokeObjectURL = () => {}
  window.HTMLAnchorElement.prototype.click = function () { assert.equal(this.download, 'learnpurse-course-draft.json') }
  await click(button('Export draft', sheet))
  assert.deepEqual(JSON.parse(await exported.text()), JSON.parse(saved))
  await flush(150)
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; window.HTMLAnchorElement.prototype.click = anchorClick
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
  await flush()
  assert.equal(document.querySelector('[role="dialog"]'), null, 'Escape closes the sheet')

  // Reload: profile + draft restore and skip signup
  app.unmount()
  mount()
  await flush()
  assert.match(heading(), /Let your agent pay/)
  await click(button('Open studio'))
  assert.equal(query('#title').value, 'Stories worth telling', 'Draft restored after reload')

  // Example replacement requires confirmation
  await click(query('.avatar'))
  await click(button('Start from an example'))
  await click(document.querySelector('.example-option'))
  assert.match(query('[role="dialog"]').textContent, /Replace your current draft/)
  await click(button('Keep my work'))
  assert.equal(query('#title').value, 'Stories worth telling')
  await click(query('.avatar'))
  await click(button('Start from an example'))
  await click(document.querySelector('.example-option'))
  await click(button('Use this example'))
  assert.equal(query('#title').value, 'Build a budget that works for you')
  assert.equal(localStorage.getItem('learnpurse.course-draft.v1'), saved, 'Examples do not overwrite saved work')

  // Blocked storage and corrupt draft recovery
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: originalStorage.getItem.bind(originalStorage), setItem() { throw new Error('blocked') }, removeItem() {} }
  try {
    await click(button('Save draft'))
    assert.match(query('.toast').textContent, /couldn’t save/)
    await click(query('.studio [aria-label="LearnPurse home"]'))
    await click(button('Save and leave'))
    assert.ok(document.querySelector('.studio'), 'A blocked save must not navigate away')
    assert.ok(document.querySelector('[role="dialog"]'), 'Leave sheet remains open after a failed save')
    await click(button('Stay here'))
  } finally { globalThis.localStorage = originalStorage }
  app.unmount()
  localStorage.setItem('learnpurse.course-draft.v1', '{broken')
  mount()
  await flush()
  await click(button('Open studio'))
  assert.equal(query('#title').value, '')
  assert.match(query('.toast').textContent, /couldn’t be read/)
  assert.equal(localStorage.getItem('learnpurse.course-draft.v1'), '{broken', 'Corrupt draft is not overwritten')

  // Sign out clears profile and returns home
  await click(query('.avatar'))
  await click(button('Sign out'))
  assert.match(heading(), /Let your agent pay/)
  assert.equal(localStorage.getItem('learnpurse.profile.v1'), null)

  // Skip-wallet path
  localStorage.removeItem('learnpurse.course-draft.v1')
  await click(button('For creators'))
  await fill('#signup-name', 'Bea')
  await fill('#signup-email', 'bea@example.com')
  await submit('.auth-card form')
  await click([...document.querySelectorAll('[role="radio"]')][2])
  await submit('.auth-card form')
  await click(button('Skip for now'))
  assert.match(heading(), /Welcome, Bea/)
  assert.equal(JSON.parse(localStorage.getItem('learnpurse.profile.v1')).walletAddress, '')
  await click(button('Open studio'))
  await submit('#course-editor')
  await click(button('Start from an example'))
  await click(document.querySelector('.example-option'))
  await click(query('.segmented .seg:nth-of-type(3)'))
  assert.match(query('.payout').textContent, /No payout wallet yet/)
  await click(query('.studio [aria-label="LearnPurse home"]'))
  await click(button('Leave without saving'))
  assert.match(heading(), /Let your agent pay/)
  assert.equal(localStorage.getItem('learnpurse.course-draft.v1'), null, 'Discarding never saves implicitly')

  assert.deepEqual(errors, [], 'No component runtime errors')
  console.log('PASS: photographic landing, course sheets, FAQ, keyboard signup, validation, wallet paste/skip, studio gating, modules, pricing, save/restore/export, custom save-or-leave and blocked-save recovery.')
} finally {
  app?.unmount()
  await rm(temp, { recursive: true, force: true })
  await window.happyDOM.close()
}
