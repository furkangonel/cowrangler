import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
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

  await page.getByPlaceholder('my-connector').fill('manual-e2e-mcp')
  await page.getByPlaceholder('npx').fill('/definitely/missing/mcp-command')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByText('Manual MCP setup', { exact: true })).toHaveCount(0)
  await expect(page.getByText('manual-e2e-mcp', { exact: true })).toBeVisible()
  const config = fs.readFileSync(path.join(launched.homeDir, '.cowrangler', 'config.yaml'), 'utf8')
  expect(config).toContain('manual-e2e-mcp:')
  expect(config).toContain('/definitely/missing/mcp-command')
})

test('managed storage is visible and can be cleaned from settings', async () => {
  const page = launched.window

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Storage & advanced', exact: true }).click()
  await expect(page.getByText('Local storage', { exact: true })).toBeVisible()
  await expect(page.getByText(/Source folders, credentials, skills and active conversations are never cleaned/)).toBeVisible()
  await page.getByRole('button', { name: 'Clean now', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Clean now', exact: true })).toBeEnabled()
})
