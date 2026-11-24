import { expect, test } from '@playwright/test'
import { openCreatorSignup, completeCreatorSignup } from './creator-helpers'

test('existing photograph and creator surface transform through the flow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    const original = document.startViewTransition.bind(document)
    const records: { ready: boolean; finished: boolean; error: string; groups: string[] }[] = []
    Object.assign(window, { transitionRecords: records })
    document.startViewTransition = ((update: () => Promise<void>) => {
      const record = { ready: false, finished: false, error: '', groups: [] as string[] }
      records.push(record)
      const transition = original(update)
      transition.ready.then(() => {
        record.ready = true
        for (const name of ['journey-panel', 'course-image', 'setup-content', 'editor-content']) {
          const style = getComputedStyle(document.documentElement, `::view-transition-group(${name})`)
          if (style.animationName.includes(name)) record.groups.push(name)
        }
      }).catch(error => { record.error = String(error) })
      transition.finished.then(() => { record.finished = true })
      return transition
    }) as typeof document.startViewTransition
  })
  await page.goto('/')
  await page.locator('.showcase-photo').nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).transitionRecords.at(-1)?.finished)).toBe(true)
  expect(await page.evaluate(() => (window as any).transitionRecords.at(-1))).toMatchObject({ ready: true, error: '', groups: expect.arrayContaining(['course-image']) })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as any).transitionRecords.at(-1)?.finished)).toBe(true)
  expect(await page.evaluate(() => (window as any).transitionRecords.at(-1))).toMatchObject({ ready: true, error: '', groups: expect.arrayContaining(['course-image']) })

  await openCreatorSignup(page)
  await expect(page.locator('#auth-heading')).toHaveText('Let’s get you set up.')
  await page.getByLabel('Your name', { exact: true }).fill('Amara')
  await page.getByLabel('Email address', { exact: true }).fill('amara@example.test')
  const before = await page.locator('.auth-card').boundingBox()
  const countBefore = await page.evaluate(() => (window as any).transitionRecords.length)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.locator('#auth-heading')).toHaveText('What will you teach?')
  const after = await page.locator('.auth-card').boundingBox()
  expect(after!.width).toBe(before!.width)
  expect(after!.height).toBeGreaterThan(before!.height)
  await expect.poll(() => page.locator('.setup-progress > span').evaluate(el => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width)).toBeCloseTo(2 / 3, 1)
  await page.getByRole('radio', { name: 'Money & budgeting' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.locator('#auth-heading')).toHaveText('Connect your wallet.')
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.locator('#auth-heading')).toHaveText('Welcome, Amara.')
  await page.getByRole('button', { name: 'Open studio', exact: true }).click()
  await expect(page.locator('#step-heading')).toBeVisible()
  for (const step of ['Curriculum', 'Pricing', 'Review', 'Details']) {
    await page.locator('.segmented .seg', { hasText: step }).click()
    await expect(page.locator('#step-heading')).toBeVisible()
  }
  expect(await page.evaluate(() => (window as any).transitionRecords.length), 'Setup and studio tab changes do not start view transitions').toBe(countBefore)
  expect(await page.evaluate(() => (window as any).transitionRecords.filter((record: any) => !record.ready || record.error))).toEqual([])
})

for (const fallback of ['unsupported', 'snapshot throws', 'reduced motion']) {
  test(`setup remains usable when ${fallback}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: fallback === 'reduced motion' ? 'reduce' : 'no-preference' })
    await page.addInitScript(mode => {
      if (mode === 'unsupported') Object.defineProperty(document, 'startViewTransition', { value: undefined })
      else Object.defineProperty(document, 'startViewTransition', { value: () => { throw new Error('No snapshot available') } })
    }, fallback)
    await page.goto('/')
    await openCreatorSignup(page)
    await expect(page.locator('#auth-heading')).toHaveText('Let’s get you set up.')
    await page.getByLabel('Your name', { exact: true }).fill('Amara')
    await page.getByLabel('Email address', { exact: true }).fill('amara@example.test')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.locator('#auth-heading')).toHaveText('What will you teach?')
  })
}

for (const motion of ['unsupported', 'snapshot throws', 'reduced motion'] as const) {
  test(`studio completes when ${motion}`, async ({ page }) => {
    await completeCreatorSignup(page)
    await page.getByRole('button', { name: 'Open studio', exact: true }).click()
    await expect(page.locator('#step-heading')).toHaveText('What’s your course about?')
    await page.getByLabel('Course title', { exact: true }).fill('Amara Studio Course')
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.locator('#step-heading')).toHaveText('Plan the modules.')
  })
}
