import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './fixtures'

let launched: LaunchedApp

test.beforeEach(async () => { launched = await launchApp() })
test.afterEach(async () => { await closeApp(launched) })

test('Design home exposes 13 render-specific templates, systems, and theme switch', async () => {
  await launched.window.evaluate(() => window.electronAPI.design.openWindow())
  await expect.poll(() => launched.app.windows().length).toBe(2)
  const design = launched.app.windows().find(page => page.url().includes('#/design'))!
  await design.waitForLoadState('domcontentloaded')

  await expect(design.getByRole('heading', { name: 'Make the idea in your head visible.' })).toBeVisible()
  await expect(design.locator('.design-template-card')).toHaveCount(13)
  await expect(design.getByRole('tab', { name: 'Projects' })).toBeVisible()
  await expect(design.getByRole('tab', { name: 'Design systems' })).toBeVisible()
  await expect(design.getByRole('tab', { name: 'Templates' })).toHaveCount(0)
  if (await design.locator('.design-root').getAttribute('data-design-theme') === 'dark') {
    await design.getByRole('button', { name: 'Use light theme' }).click()
  }

  const templateControl = design.locator('.design-control-chip').filter({ hasText: 'Template' })
  await templateControl.click()
  const templatePicker = design.locator('.design-popover.is-template-grid')
  await expect(templatePicker).toBeVisible()
  await expect(templatePicker.getByRole('option')).toHaveCount(14)

  const pickerBounds = await templatePicker.boundingBox()
  const templateControlBounds = await templateControl.boundingBox()
  const viewport = await design.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  expect(pickerBounds).not.toBeNull()
  expect(templateControlBounds).not.toBeNull()
  expect(pickerBounds!.x).toBeGreaterThanOrEqual(8)
  expect(pickerBounds!.y).toBeGreaterThanOrEqual(44)
  expect(pickerBounds!.x + pickerBounds!.width).toBeLessThanOrEqual(viewport.width - 8)
  expect(pickerBounds!.y + pickerBounds!.height).toBeLessThanOrEqual(viewport.height - 8)
  expect(Math.abs(pickerBounds!.x - templateControlBounds!.x)).toBeLessThanOrEqual(1)

  const glyphSize = await templatePicker.locator('.design-template-glyph').first().evaluate((node) => {
    const style = getComputedStyle(node)
    return { width: style.width, height: style.height }
  })
  expect(glyphSize).toEqual({ width: '18px', height: '18px' })
  await design.screenshot({ path: '/tmp/cowrangler-template-menu.png', fullPage: true })

  await templatePicker.getByRole('option', { name: 'Research' }).click()
  await expect(templateControl).toContainText('Research')
  const selectedResearch = design.locator('.design-template-card[data-template="research"]')
  await expect(selectedResearch).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => selectedResearch.evaluate((card) => {
    const rail = card.closest('.design-template-rail')
    if (!rail) return false
    const cardBounds = card.getBoundingClientRect()
    const railBounds = rail.getBoundingClientRect()
    return cardBounds.left >= railBounds.left && cardBounds.right <= railBounds.right
  })).toBe(true)

  await design.waitForTimeout(500)
  await design.screenshot({ path: '/tmp/cowrangler-design-light.png', fullPage: true })

  await design.locator('.design-template-card').first().click()
  await expect(design.getByText('Interactive device canvas', { exact: true })).toBeVisible()

  await design.getByRole('button', { name: 'Use dark theme' }).click()
  await expect(design.locator('.design-root')).toHaveAttribute('data-design-theme', 'dark')
  await design.screenshot({ path: '/tmp/cowrangler-design-dark.png', fullPage: true })

  await design.getByRole('tab', { name: 'Design systems' }).click()
  await expect(design.getByText('Modernist', { exact: true })).toBeVisible()
  await expect(design.getByText('Organic', { exact: true })).toBeVisible()
  await expect(design.getByText('Broadsheet', { exact: true })).toBeVisible()
  await expect(design.getByText('Industry', { exact: true })).toBeVisible()
})
