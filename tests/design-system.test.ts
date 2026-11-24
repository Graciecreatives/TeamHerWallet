import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')
const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(match => [match[1], match[2]]))
function luminance(hex: string): number {
  const rgb = hex.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255)
    .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
  return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722
}
function ratio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}
const token = (name: string) => tokens[name]!
// Actual flat surfaces behind text, including the two purposeful color panels.
const surfaces = { paper: token('paper'), canvas: token('canvas'), blush: token('blush'), lilac: token('lilac') }

test('text tokens meet 4.5:1 on every surface they sit on', () => {
  for (const [surfaceName, surface] of Object.entries(surfaces)) {
    for (const name of ['ink', 'muted', 'accent', 'accent-ink', 'success', 'danger']) {
      assert.ok(ratio(token(name), surface) >= 4.5, `${name} on ${surfaceName}: ${ratio(token(name), surface).toFixed(2)}:1`)
    }
  }
})

test('white text on filled buttons meets 4.5:1', () => {
  for (const name of ['ink', 'danger', 'accent']) assert.ok(ratio('#FFFFFF', token(name)) >= 4.5, `white on ${name}`)
})

test('primary gradient endpoints preserve white-label contrast', () => {
  const experience = readFileSync(new URL('../app/assets/css/experience.css', import.meta.url), 'utf8')
  const backgrounds = [...experience.matchAll(/\.btn-dark[^{}]*\{\s*background:\s*linear-gradient\(([^;]+)\)/g)]
  assert.equal(backgrounds.length, 2, 'Default and hover action surfaces must be covered')
  for (const background of backgrounds) {
    for (const color of background[1]!.match(/#[0-9a-f]{6}/gi)!) assert.ok(ratio('#FFFFFF', color) >= 4.5, `white on ${color}`)
  }
})

test('focus ring and error border meet 3:1 non-text contrast', () => {
  for (const name of ['accent', 'danger', 'border']) {
    for (const surface of [token('paper'), token('canvas')]) assert.ok(ratio(token(name), surface) >= 3, `${name} boundary on ${surface}`)
  }
})

test('design rules: pill controls, visible focus, Inter, reduced motion, mobile breakpoint', () => {
  assert.match(css, /\.btn\s*\{[^}]*min-height: 48px[^}]*border-radius: 999px/)
  assert.match(css, /\.icon-btn\s*\{[^}]*width: 40px; height: 40px/)
  assert.match(css, /:focus-visible\s*\{[^}]*outline: 3px/)
  assert.match(css, /@fontsource-variable\/inter/)
  assert.match(css, /--spring: cubic-bezier\(\.22, 1, \.36, 1\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /@media \(max-width: 640px\)/)
})
