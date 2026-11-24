import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  env: { ...process.env, PORT: '3197', HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
server.stdout.on('data', chunk => { output += chunk })
server.stderr.on('data', chunk => { output += chunk })
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(output)
    try {
      const response = await fetch('http://127.0.0.1:3197/api/health')
      if (response.ok) {
        assert.deepEqual(await response.json(), { status: 'ok', service: 'learnpurse', stage: 'scaffold' })
        ready = true
        break
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, `Production server did not become healthy: ${output}`)
  const response = await fetch('http://127.0.0.1:3197/')
  assert.equal(response.status, 200, `Production response failed: ${output}`)
  const html = await response.text()
  const readable = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  for (const text of ['Let your agent pay', 'Create your learning agent', 'One goal in.', 'An assistant that', 'Paid directly.', 'Runs on Stellar Testnet']) assert.ok(readable.includes(text), text)
  for (const image of ['creator-workspace-640', 'creator-workspace-1200', 'creator-home-480', 'creator-home-960', 'pottery-480', 'pottery-960']) {
    const asset = await fetch(`http://127.0.0.1:3197/images/${image}.webp`)
    assert.equal(asset.status, 200, image)
    assert.match(asset.headers.get('content-type'), /image\/webp/)
    assert.ok((await asset.arrayBuffer()).byteLength > 1000)
  }
  assert.match(html, /<html[^>]*lang="en"/)
  const stylesheets = [...html.matchAll(/href="([^\"]+\.css)"/g)]
  assert.ok(stylesheets.length >= 1, 'Rendered page must load its stylesheets')
  let css = ''
  let cssUrl = ''
  for (const stylesheet of stylesheets) {
    const cssResponse = await fetch(new URL(stylesheet[1], 'http://127.0.0.1:3197'))
    assert.equal(cssResponse.status, 200)
    css += await cssResponse.text()
    cssUrl = cssResponse.url
  }
  assert.match(css, /\.topbar/)
  assert.match(css, /view-transition-group/)
  assert.match(css, /\.btn\{|\.btn \{/)
  assert.match(css, /backdrop-filter/)
  assert.match(css, /Outfit Variable/)
  const font = css.match(/url\(["']?([^"')]+\.woff2)["']?\)/)
  assert.ok(font, 'Stylesheet must reference a self-hosted font')
  const fontUrl = new URL(font[1], cssUrl)
  assert.equal(fontUrl.origin, 'http://127.0.0.1:3197')
  const fontResponse = await fetch(fontUrl)
  assert.equal(fontResponse.status, 200)
  assert.ok((await fontResponse.arrayBuffer()).byteLength > 1000)
  console.log('PASS: production landing SSR, local responsive photographs, stylesheet, self-hosted typography and health endpoint')
} finally {
  server.kill()
}
