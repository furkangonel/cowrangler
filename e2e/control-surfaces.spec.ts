import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './fixtures'

let launched: LaunchedApp
test.beforeEach(async () => { launched = await launchApp() })
test.afterEach(async () => { await closeApp(launched) })

test('model, skill, and manual MCP controls share the capability workspace', async () => {
  const page = launched.window

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Models', exact: true })).toBeVisible()
  await expect(page.getByText('Model pool', { exact: true })).toBeVisible()
  await expect(page.getByText('Provider access', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close settings' }).click()

  await page.getByRole('button', { name: 'Customize', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Skills', exact: true })).toBeVisible()
  await expect(page.getByText('Capability directory', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Connectors', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Connectors', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Add custom connector' }).click()
  await expect(page.getByText('Manual MCP setup', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /STDIO/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /HTTP/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /SSE/ })).toBeVisible()
})
