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

  test('canvas cursor reflects what hovering will do (resize/rotate/move), not just a plain arrow', async ({
    page,
  }) => {
    const canvasCursor = async () =>
      page.evaluate(() => (document.getElementById('paper-view-0') as HTMLCanvasElement).style.cursor)

    const props = await readPositionProps(page)
    const topLeft = await pathPointToScreen(page, props.x, props.y)
    const topCenter = await pathPointToScreen(page, props.x + props.w / 2, props.y)
    const center = await pathPointToScreen(page, props.x + props.w / 2, props.y + props.h / 2)

    await page.mouse.move(topLeft.x, topLeft.y)
    expect(await canvasCursor()).toBe('nwse-resize') // corner resize handle

    await page.mouse.move(topCenter.x, topCenter.y)
    expect(await canvasCursor()).toBe('ns-resize') // edge resize handle

    await page.mouse.move(topCenter.x, topCenter.y - 22)
    expect(await canvasCursor()).toContain('grab') // rotate handle (custom cursor, 'grab' fallback)

    await page.mouse.move(center.x, center.y)
    expect(await canvasCursor()).toBe('move') // shape body — draggable

    await page.mouse.move(topLeft.x - 200, topLeft.y - 200)
    expect(await canvasCursor()).toBe('') // empty canvas — default
  })

  test('drawing tools (pen, shapes, ruler, add point) show a crosshair cursor', async ({ page }) => {
    const canvasCursor = () =>
      page.evaluate(() => (document.getElementById('paper-view-0') as HTMLCanvasElement).style.cursor)

    for (const key of ['m', 'l', 'p', 'r', '+']) {
      await page.keyboard.press(key)
      expect(await canvasCursor()).toBe('crosshair')
    }

    // Switching back to Select/Node drops the crosshair (those manage their own cursor).
    await page.keyboard.press('v')
    expect(await canvasCursor()).toBe('')
    await page.keyboard.press('n')
    expect(await canvasCursor()).toBe('')
  })

  test('select tool shows node anchors; dragging one switches to the Node tool', async ({ page }) => {
    // Sample star (sampleShapes.ts) viewBox is 0..100: M50 5 L61 35 L95 35 L68 55 L79 90
    // L50 70 L21 90 L32 55 L5 35 L39 35 Z. Vertex (50,70) is a concave inner point, well
    // inside the bounding box — unlike the tip vertices, it won't collide with the
    // resize/rotate handles that sit on the box's corners/edges/top-center.
    const before = await readPositionProps(page)
    const vertex = await pathPointToScreen(
      page,
      before.x + (50 / 100) * before.w,
      before.y + (70 / 100) * before.h,
    )

    await page.mouse.move(vertex.x, vertex.y)
    await page.mouse.down()
    await page.mouse.move(vertex.x + 50, vertex.y + 20, { steps: 8 })
    await page.mouse.up()

    await expect(page.locator('.Toolbar-btn[title="Node (N)"]')).toHaveAttribute('aria-pressed', 'true')
    const after = await readPositionProps(page)
    expect(after).not.toEqual(before) // the dragged vertex actually moved the path
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

  test('fill and stroke can each be removed independently, like Figma\'s "no fill"/"no stroke"', async ({
    page,
  }) => {
    // Draw a rectangle (born with both a fill and a stroke) rather than relying on the
    // sample star, whose fill/stroke state varies by sample.
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!
    await page.keyboard.press('m')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 })
    await page.mouse.up()

    const noStroke = page.locator('.PropsPanel-row', { hasText: 'No stroke' }).locator('input[type="checkbox"]')
    const noFill = page.locator('.PropsPanel-row', { hasText: 'No fill' }).locator('input[type="checkbox"]')
    const strokeWeightInput = page.locator('.PropsPanel-row', { hasText: 'Weight' }).locator('input')

    await expect(noStroke).not.toBeChecked()
    await expect(noFill).not.toBeChecked()
    await expect(strokeWeightInput).toBeEnabled()

    await noStroke.check()
    await expect(noStroke).toBeChecked()
    await expect(strokeWeightInput).toBeDisabled() // nothing to set a weight on anymore

    await noFill.check()
    await expect(noFill).toBeChecked()

    // Re-enabling restores a real color rather than staying "no stroke"/"no fill".
    await noStroke.uncheck()
    await expect(noStroke).not.toBeChecked()
    await expect(strokeWeightInput).toBeEnabled()
  })

  test('fill/stroke edits apply to every selected shape at once in a multi-selection', async ({ page }) => {
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!

    await page.keyboard.press('m')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + 150, { steps: 5 })
    await page.mouse.up()

    await page.keyboard.press('m')
    await page.mouse.move(box.x + 200, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 260, box.y + 150, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.press('v')

    const rows = page.locator('.LayersPanel-row')
    await rows.nth(0).click()
    await rows.nth(1).click({ modifiers: ['Shift'] })
    await expect(page.locator('.PropsPanel-info')).toContainText('2 paths selected')

    // Position editing works across a multi-selection too (see the dedicated position test
    // below), but node/handle editing has no multi-shape equivalent and stays disabled.
    const nodeXInput = page.locator('.PropsPanel-row').nth(2).locator('input').first()
    await expect(nodeXInput).toBeDisabled()
    const fillPill = page.locator('.PropsPanel-section', { hasText: 'Fill' }).locator('.ColorPicker-pill')
    await expect(fillPill).toBeEnabled()

    const noFillCheckbox = page.locator('.PropsPanel-section', { hasText: 'Fill' }).locator('input[type="checkbox"]')
    await expect(noFillCheckbox).not.toBeChecked()
    await noFillCheckbox.check()
    await expect(noFillCheckbox).toBeChecked()

    // Re-select each rectangle individually — both lost their fill, not just one.
    await rows.nth(0).click()
    await expect(noFillCheckbox).toBeChecked()
    await rows.nth(1).click()
    await expect(noFillCheckbox).toBeChecked()
  })

  test('position edits on a multi-selection move every selected shape by the same delta', async ({ page }) => {
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!

    await page.keyboard.press('m')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + 150, { steps: 5 })
    await page.mouse.up()

    await page.keyboard.press('m')
    await page.mouse.move(box.x + 300, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + 360, box.y + 250, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.press('v')

    const rows = page.locator('.LayersPanel-row')

    await rows.nth(0).click()
    const firstBefore = await readPositionProps(page)
    await rows.nth(1).click()
    const secondBefore = await readPositionProps(page)

    await rows.nth(0).click()
    await rows.nth(1).click({ modifiers: ['Shift'] })
    await expect(page.locator('.PropsPanel-info')).toContainText('2 paths selected')

    const combinedBefore = await readPositionProps(page)
    // W/H stay read-only for a multi-selection (per-shape resize semantics aren't decided) —
    // only X/Y are editable, the first two enabled inputs in the Position section.
    const wInput = page.locator('.PropsPanel-row').nth(0).locator('input').first()
    await expect(wInput).toBeDisabled()
    const xInput = page.locator('.PropsPanel-row').nth(1).locator('input').first()
    const yInput = page.locator('.PropsPanel-row').nth(1).locator('input').nth(1)
    await expect(xInput).toBeEnabled()

    const dx = 50
    const dy = -20
    await xInput.fill(String(combinedBefore.x + dx))
    await yInput.fill(String(combinedBefore.y + dy))

    // Re-select each rectangle individually — both shifted by the same delta, not just one,
    // and their relative arrangement (the gap between them) is unchanged.
    await rows.nth(0).click()
    const firstAfter = await readPositionProps(page)
    expect(firstAfter.x - firstBefore.x).toBeCloseTo(dx, 0)
    expect(firstAfter.y - firstBefore.y).toBeCloseTo(dy, 0)

    await rows.nth(1).click()
    const secondAfter = await readPositionProps(page)
    expect(secondAfter.x - secondBefore.x).toBeCloseTo(dx, 0)
    expect(secondAfter.y - secondBefore.y).toBeCloseTo(dy, 0)
  })
})
