import { test, expect } from '@playwright/test'
import { importSampleShape, readPositionProps, pathPointToScreen } from './helpers.js'

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

  test('select tool shows resize handles that resize from the opposite corner', async ({ page }) => {
    const before = await readPositionProps(page)
    const brHandle = await pathPointToScreen(page, before.x + before.w, before.y + before.h)

    await page.mouse.move(brHandle.x, brHandle.y)
    await page.mouse.down()
    await page.mouse.move(brHandle.x + 50, brHandle.y + 50, { steps: 5 })
    await page.mouse.up()

    const after = await readPositionProps(page)
    // Dragging the bottom-right handle out should grow the shape while the top-left
    // (opposite corner) stays anchored.
    expect(after.w).toBeGreaterThan(before.w)
    expect(after.h).toBeGreaterThan(before.h)
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2)
  })

  test('select tool shows a rotate handle that rotates the selected shape', async ({ page }) => {
    const before = await readPositionProps(page)
    const topCenter = await pathPointToScreen(page, before.x + before.w / 2, before.y)
    const rotateHandle = { x: topCenter.x, y: topCenter.y - 22 }

    await page.mouse.move(rotateHandle.x, rotateHandle.y)
    await page.mouse.down()
    await page.mouse.move(rotateHandle.x + 90, rotateHandle.y + 20, { steps: 8 })
    await page.mouse.up()

    const after = await readPositionProps(page)
    // Rotating changes the axis-aligned bounding box — some combination of its edges moves.
    const changed =
      Math.abs(after.x - before.x) > 1 ||
      Math.abs(after.y - before.y) > 1 ||
      Math.abs(after.w - before.w) > 1 ||
      Math.abs(after.h - before.h) > 1
    expect(changed).toBe(true)
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
