import { expect, type Page } from '@playwright/test'

export async function mockCreatorAccount(page: Page) {
  const user = { id: 'browser-test-creator', email: 'amara@example.test', displayName: 'Amara Okafor',
    role: 'creator', focus: 'Money & budgeting', walletAddress: null }
  let registered = false
  await page.route('**/api/auth/me', route => route.fulfill({ status: registered ? 200 : 401, json: registered ? { user } : { statusMessage: 'Sign in to continue.' } }))
  await page.route('**/api/auth/register', async route => {
    const body = route.request().postDataJSON()
    if (body.password !== 'Test-only-password-123!' || body.role !== 'creator') throw new Error('Unexpected signup data')
    registered = true
    await route.fulfill({ status: 200, json: { user } })
  })
}

export async function openCreatorSignup(page: Page) {
  await page.getByRole('button', { name: 'Want to teach? Create a class with AI', exact: true }).click()
  const choice = page.getByRole('dialog', { name: 'This is the creator studio' })
  await expect(choice).toBeVisible()
  await choice.getByRole('button', { name: 'Continue as a creator' }).click()
  await expect(page.locator('#auth-heading')).toHaveText('Let’s get you set up.')
}

export async function completeCreatorSignup(page: Page) {
  await page.getByLabel('Your name', { exact: true }).fill('Amara Okafor')
  await page.getByLabel('Email address', { exact: true }).fill('amara@example.test')
  await page.getByLabel('Create a password').fill('Test-only-password-123!')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.locator('#auth-heading')).toHaveText('What will you teach?')
  await page.getByRole('radio', { name: 'Money & budgeting' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.locator('#auth-heading')).toHaveText('Connect your wallet.')
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.locator('#auth-heading')).toHaveText('Welcome, Amara.')
}
