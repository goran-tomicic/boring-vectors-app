import { test, expect } from '@playwright/test'
import { importSampleShape } from './helpers.js'

// PropsPanel always renders — it shows "Artboard" when nothing is selected, "Position" etc.
// when a path is. The Position section's W/H inputs are disabled (read-only); X/Y are the
// first enabled inputs, in that order.
const positionHeading = (page: import('@playwright/test').Page) =>
  page.locator('.PropsPanel-heading', { hasText: 'Position' })
const enabledXInput = (page: import('@playwright/test').Page) =>
  page.locator('.PropsPanel input:not([disabled])').first()

test.describe('drawing tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.TopBar-projectName')
    await importSampleShape(page)
  })

  test('importing a shape auto-selects it', async ({ page }) => {
    await expect(positionHeading(page)).toBeVisible()
  })

  test('select tool can drag a path to a new position', async ({ page }) => {
    const xInput = enabledXInput(page)
    const before = Number(await xInput.inputValue())

    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5 + 60, box.y + box.height * 0.5, { steps: 5 })
    await page.mouse.up()

    const after = Number(await xInput.inputValue())
    expect(Math.abs(after - before)).toBeGreaterThan(20)
  })

  test('node tool switches without error and keeps the selection', async ({ page }) => {
    await page.keyboard.press('n')
    await expect(positionHeading(page)).toBeVisible()
  })

  test('undo/redo do not throw and keep the path present', async ({ page }) => {
    // Undo removes the import, redo restores it — restoreSnapshot() intentionally clears
    // selection either way, so re-select afterward rather than expecting it to persist.
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+Shift+z')
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await expect(positionHeading(page)).toBeVisible()
  })

  test('delete removes the selected path', async ({ page }) => {
    await page.keyboard.press('v')
    await page.keyboard.press('Delete')
    await expect(positionHeading(page)).toHaveCount(0)
    await expect(page.locator('.PropsPanel-heading', { hasText: 'Artboard' })).toBeVisible()
  })
})
