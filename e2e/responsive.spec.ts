import { expect, test, type Page } from '@playwright/test'
import { openCreatorSignup } from './creator-helpers'

async function fitsViewport(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    return [...document.querySelectorAll<HTMLElement>('main, section, article, button, a, input, textarea, h1, h2, h3, p, figure')]
      .filter(el => {
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && (box.left < -1 || box.right > width + 1)
      })
      .map(el => `${el.tagName}.${el.className}: ${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}`)
  })
  expect(overflow, `${label}: visible content must fit the viewport`).toEqual([])
  const documentFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  expect(documentFits, `${label}: no horizontal page overflow`).toBe(true)
}

for (const width of [320, 390, 640, 768, 1024, 1440, 1920]) {
  test(`landing and creator flow fit ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 1000 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learn more.Let your agent pay.')
    await page.evaluate(() => document.fonts.ready)
    await fitsViewport(page, 'landing')

    for (const image of await page.locator('.showcase-photo img').all()) {
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    }
    if (width === 1440) await page.locator('#courses').screenshot({ path: info.outputPath('course-showcases.png') })
    if (width === 1440) await page.locator('#features').screenshot({ path: info.outputPath('studio-showcase.png') })

    const topNav = width > 960 ? page.getByRole('navigation', { name: 'Main', exact: true }) : page.getByRole('navigation', { name: 'Sections', exact: true })
    if (width <= 960) await page.getByRole('button', { name: 'Menu' }).click()
    await topNav.getByRole('button', { name: 'AI assistant' }).click()
    if (width > 960) await expect(topNav.getByRole('button', { name: 'AI assistant' })).toHaveAttribute('aria-current', 'location')
    else await expect(topNav).toBeHidden()

    const ideaTab = page.getByRole('tab', { name: 'You say', exact: true })
    await ideaTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'It builds', exact: true })).toBeFocused()
    await expect(page.locator('#demo-panel-1')).toBeVisible()
    await expect(page.locator('#demo-panel-0')).toBeHidden()
    await page.keyboard.press('End')
    await expect(page.locator('#demo-panel-2')).toBeVisible()
    await fitsViewport(page, 'interactive studio example')
    const question = page.getByRole('button', { name: 'What does the AI assistant actually do?' })
    await question.focus()
    await page.keyboard.press('Enter')
    await expect(question).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#answer-0')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.locator('#answer-0')).toBeHidden()

    for (const image of await page.locator('.showcase-photo img').all()) {
      await image.scrollIntoViewIfNeeded()
      await expect(image).toBeVisible()
      expect(await image.evaluate((img: HTMLImageElement) => {
        const rect = img.getBoundingClientRect()
        return rect.width >= 90 && rect.height >= 90 && getComputedStyle(img).objectFit === 'cover'
      }), 'Photography keeps a visible subject area and sensible dimensions').toBe(true)
    }
    const hero = page.locator('.hero-photograph img')
    await expect(hero).toBeVisible()
    expect(await hero.evaluate((img: HTMLImageElement) => {
      const rect = img.getBoundingClientRect()
      return rect.width >= 380 && rect.height >= 150 && getComputedStyle(img).objectFit === 'cover'
    }), 'Hero photography is visible across responsive widths').toBe(true)

    const chatFacts = page.locator('.chat-facts span')
    for (const fact of await chatFacts.all()) {
      expect(await fact.evaluate((element: HTMLElement) => {
        const padding = parseFloat(getComputedStyle(element).padding)
        const font = parseFloat(getComputedStyle(element).fontSize)
        return padding >= 10 && font >= 12 && element.textContent?.trim().length
      }), 'Visible chat facts have an accessible minimum size').toBe(true)
    }

    const buttons = [page.getByRole('button', { name: /Create a class with AI/ }), page.getByRole('link', { name: /Sign up as a student or creator/ })]
    for (const button of buttons) {
      await expect(button).toBeVisible()
      const box = await button.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(48)
      expect(box!.width).toBeGreaterThanOrEqual((await button.textContent())?.length ?? 0)
    }
    await openCreatorSignup(page)
    await fitsViewport(page, 'creator signup choice')
    await expect(page.locator('#auth-heading')).toHaveText('Let’s get you set up.')

    if (width === 390 || width === 1920) {
      await page.screenshot({ path: info.outputPath(`landing-${width}.png`), animations: 'disabled' })
      await page.screenshot({ path: info.outputPath(`signup-${width}.png`), animations: 'disabled' })
    }
    expect(errors, 'No browser runtime errors').toEqual([])
  })
}

test('short landscape viewport keeps signup actions reachable', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 })
  await page.goto('/')
  await openCreatorSignup(page)
  await fitsViewport(page, 'landscape signup')
  const next = page.getByRole('button', { name: 'Continue', exact: true })
  await next.scrollIntoViewIfNeeded()
  await expect(next).toBeInViewport()
})
