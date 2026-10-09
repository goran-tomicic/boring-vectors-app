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

  test('arrow keys nudge the selected shape by 1px, 10px with Shift', async ({ page }) => {
    const before = await readPositionProps(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    let after = await readPositionProps(page)
    expect(after.x - before.x).toBe(1)
    expect(after.y - before.y).toBe(1)

    await page.keyboard.press('Shift+ArrowRight')
    after = await readPositionProps(page)
    expect(after.x - before.x).toBe(11)
  })

  test('shift-dragging a shape constrains the move to one axis', async ({ page }) => {
    const before = await readPositionProps(page)
    const center = await pathPointToScreen(page, before.x + before.w / 2, before.y + before.h / 2)

    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(center.x + 60, center.y + 10, { steps: 8 })
    await page.keyboard.up('Shift')
    await page.mouse.up()

    const after = await readPositionProps(page)
    expect(after.x).toBeGreaterThan(before.x)
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
  })

  test('alt-dragging a shape duplicates it, leaving the original in place', async ({ page }) => {
    const before = await readPositionProps(page)
    const center = await pathPointToScreen(page, before.x + before.w / 2, before.y + before.h / 2)

    await page.keyboard.down('Alt')
    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    await page.mouse.move(center.x + 80, center.y + 40, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Alt')

    const rows = page.locator('.LayersPanel-row')
    await expect(rows).toHaveCount(2)
    const positions = []
    for (let i = 0; i < 2; i++) {
      await rows.nth(i).click()
      positions.push(await readPositionProps(page))
    }
    const matchesOriginal = (p: { x: number; y: number }) =>
      Math.abs(p.x - before.x) < 1 && Math.abs(p.y - before.y) < 1
    // Exactly one of the two paths is still at the original position; the other moved with the drag.
    expect(positions.filter(matchesOriginal)).toHaveLength(1)
  })

  test('alt-resizing anchors the shape\'s center instead of the opposite corner', async ({ page }) => {
    const before = await readPositionProps(page)
    const centerBefore = { x: before.x + before.w / 2, y: before.y + before.h / 2 }
    const brHandle = await pathPointToScreen(page, before.x + before.w, before.y + before.h)

    await page.keyboard.down('Alt')
    await page.mouse.move(brHandle.x, brHandle.y)
    await page.mouse.down()
    await page.mouse.move(brHandle.x + 40, brHandle.y + 30, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Alt')

    const after = await readPositionProps(page)
    const centerAfter = { x: after.x + after.w / 2, y: after.y + after.h / 2 }
    expect(after.w).toBeGreaterThan(before.w)
    // readPositionProps rounds twice (once per read) so a 1px rounding wobble is expected —
    // the center staying fixed is what matters, not sub-pixel precision.
    expect(Math.abs(centerAfter.x - centerBefore.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(centerAfter.y - centerBefore.y)).toBeLessThanOrEqual(1)
  })

  test('resize handles work across a multi-selection, scaling every shape together', async ({ page }) => {
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!

    await page.keyboard.press('m')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + 150, { steps: 5 })
    await page.mouse.up()

    await page.keyboard.press('m')
    await page.mouse.move(box.x + 300, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 360, box.y + 150, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.press('v')

    const rows = page.locator('.LayersPanel-row')
    await rows.nth(0).click()
    const firstBefore = await readPositionProps(page)
    await rows.nth(1).click()
    const secondBefore = await readPositionProps(page)
    // LayersPanel lists frontmost-first (most recently drawn on top), not draw order — identify
    // "the one at the group's left edge" by position rather than assuming row 0 is it.
    const leftIsFirst = firstBefore.x <= secondBefore.x

    await rows.nth(0).click()
    await rows.nth(1).click({ modifiers: ['Shift'] })
    const combinedBefore = await readPositionProps(page)
    const brHandle = await pathPointToScreen(
      page,
      combinedBefore.x + combinedBefore.w,
      combinedBefore.y + combinedBefore.h,
    )

    await page.mouse.move(brHandle.x, brHandle.y)
    await page.mouse.down()
    await page.mouse.move(brHandle.x + 60, brHandle.y + 40, { steps: 8 })
    await page.mouse.up()

    // Both shapes individually grew — the whole group resized, not just its bounding box.
    await rows.nth(0).click()
    const firstAfter = await readPositionProps(page)
    await rows.nth(1).click()
    const secondAfter = await readPositionProps(page)
    expect(firstAfter.w).toBeGreaterThan(firstBefore.w)
    expect(secondAfter.w).toBeGreaterThan(secondBefore.w)
    // Resizing from the br handle anchors the group's top-left — the shape that started there
    // stays put; the other one (offset from that anchor) shifts further right as the group grows.
    const [anchoredBefore, anchoredAfter, driftedBefore, driftedAfter] = leftIsFirst
      ? [firstBefore, firstAfter, secondBefore, secondAfter]
      : [secondBefore, secondAfter, firstBefore, firstAfter]
    expect(Math.abs(anchoredAfter.x - anchoredBefore.x)).toBeLessThanOrEqual(2)
    expect(driftedAfter.x).toBeGreaterThan(driftedBefore.x)
  })

  test('rotate handle works across a multi-selection, rotating every shape around the group center', async ({
    page,
  }) => {
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!

    await page.keyboard.press('m')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + 150, { steps: 5 })
    await page.mouse.up()

    await page.keyboard.press('m')
    await page.mouse.move(box.x + 300, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 360, box.y + 150, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.press('v')

    const rows = page.locator('.LayersPanel-row')
    await rows.nth(0).click()
    const firstBefore = await readPositionProps(page)
    await rows.nth(1).click()
    const secondBefore = await readPositionProps(page)

    await rows.nth(0).click()
    await rows.nth(1).click({ modifiers: ['Shift'] })
    const combinedBefore = await readPositionProps(page)
    const topCenter = await pathPointToScreen(page, combinedBefore.x + combinedBefore.w / 2, combinedBefore.y)
    const rotateHandle = { x: topCenter.x, y: topCenter.y - 22 }

    await page.mouse.move(rotateHandle.x, rotateHandle.y)
    await page.mouse.down()
    await page.mouse.move(rotateHandle.x + 90, rotateHandle.y + 20, { steps: 8 })
    await page.mouse.up()

    await rows.nth(0).click()
    const firstAfter = await readPositionProps(page)
    await rows.nth(1).click()
    const secondAfter = await readPositionProps(page)
    const changed = (b: typeof firstBefore, a: typeof firstBefore) =>
      Math.abs(a.w - b.w) > 1 || Math.abs(a.h - b.h) > 1 || Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1
    expect(changed(firstBefore, firstAfter)).toBe(true)
    expect(changed(secondBefore, secondAfter)).toBe(true)
  })

  test('clicking a selected path\'s own curve in the Node tool adds a point without switching tools', async ({
    page,
  }) => {
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!
    await page.keyboard.press('m')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 })
    await page.mouse.up()

    const before = await readPositionProps(page)
    const infoBefore = await page.locator('.PropsPanel-info').innerText()

    await page.keyboard.press('n')
    const topMid = await pathPointToScreen(page, before.x + before.w / 2, before.y)
    await page.mouse.move(topMid.x, topMid.y)
    await page.mouse.down()
    await page.mouse.up()

    const infoAfter = await page.locator('.PropsPanel-info').innerText()
    expect(infoAfter).not.toBe(infoBefore)
    expect(infoAfter).toContain('Nodes: 5')

    const nodeXInput = page.locator('.PropsPanel-row').nth(2).locator('input').first()
    const nodeYInput = page.locator('.PropsPanel-row').nth(2).locator('input').nth(1)
    expect(Math.abs(Number(await nodeXInput.inputValue()) - (before.x + before.w / 2))).toBeLessThan(3)
    expect(Math.abs(Number(await nodeYInput.inputValue()) - before.y)).toBeLessThan(3)
  })

  test('double-clicking a node toggles corner mode, stopping its handles from mirroring', async ({ page }) => {
    const p1 = await pathPointToScreen(page, 200, 200)
    const p2 = await pathPointToScreen(page, 350, 200)

    await page.keyboard.press('p')
    await page.mouse.move(p1.x, p1.y)
    await page.mouse.down()
    await page.mouse.move(p1.x + 40, p1.y - 20, { steps: 5 })
    await page.mouse.up()
    await page.mouse.move(p2.x, p2.y)
    await page.mouse.down()
    await page.mouse.up()
    await page.keyboard.press('Enter')

    await page.keyboard.press('n')
    await page.mouse.click(p1.x, p1.y)

    const handleInRow = page.locator('.PropsPanel-row').nth(3)
    const handleOutRow = page.locator('.PropsPanel-row').nth(4)
    const readXY = async (row: typeof handleInRow) => ({
      x: Number(await row.locator('input').nth(0).inputValue()),
      y: Number(await row.locator('input').nth(1).inputValue()),
    })

    const handleInBefore = await readXY(handleInRow)
    const handleOutBefore = await readXY(handleOutRow)
    const dragScreen1 = await pathPointToScreen(page, handleOutBefore.x, handleOutBefore.y)
    await page.mouse.move(dragScreen1.x, dragScreen1.y)
    await page.mouse.down()
    await page.mouse.move(dragScreen1.x + 20, dragScreen1.y + 15, { steps: 5 })
    await page.mouse.up()
    // Default (smooth) behavior: moving handle-out mirrors handle-in.
    expect(await readXY(handleInRow)).not.toEqual(handleInBefore)

    await page.mouse.dblclick(p1.x, p1.y)

    const handleInBeforeCorner = await readXY(handleInRow)
    const handleOutBeforeCorner = await readXY(handleOutRow)
    const dragScreen2 = await pathPointToScreen(page, handleOutBeforeCorner.x, handleOutBeforeCorner.y)
    await page.mouse.move(dragScreen2.x, dragScreen2.y)
    await page.mouse.down()
    await page.mouse.move(dragScreen2.x - 15, dragScreen2.y - 25, { steps: 5 })
    await page.mouse.up()
    // After the double-click toggle: handle-in no longer follows handle-out.
    expect(await readXY(handleInRow)).toEqual(handleInBeforeCorner)
  })

  test('shift-clicking multiple nodes selects them together; dragging or deleting affects all of them', async ({
    page,
  }) => {
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!
    await page.keyboard.press('m')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 250, box.y + 220, { steps: 5 })
    await page.mouse.up()

    const before = await readPositionProps(page)
    await page.keyboard.press('n')

    const topLeft = await pathPointToScreen(page, before.x, before.y)
    const bottomLeft = await pathPointToScreen(page, before.x, before.y + before.h)

    await page.mouse.click(topLeft.x, topLeft.y)
    await page.keyboard.down('Shift')
    await page.mouse.click(bottomLeft.x, bottomLeft.y)
    await page.keyboard.up('Shift')

    // Node X/Y stays disabled for a multi-node selection, same pattern as multi-path selection.
    const nodeXInput = page.locator('.PropsPanel-row').nth(2).locator('input').first()
    await expect(nodeXInput).toBeDisabled()

    // Drag one of the two selected left-edge anchors purely horizontally. If (and only if) both
    // moved together, the left edge shifts right and the width shrinks by the same amount while
    // the height stays exactly unchanged — if only the dragged node had moved, the other left
    // corner would still anchor the bounding box's left edge and both width and height would
    // read back identical to `before` (the moved corner would sit unseen inside the box).
    const dx = 30
    await page.mouse.move(topLeft.x, topLeft.y)
    await page.mouse.down()
    await page.mouse.move(topLeft.x + dx, topLeft.y, { steps: 5 })
    await page.mouse.up()

    const afterDrag = await readPositionProps(page)
    expect(afterDrag.x).toBeGreaterThan(before.x)
    expect(afterDrag.w).toBeCloseTo(before.w - (afterDrag.x - before.x), 0)
    expect(afterDrag.h).toBe(before.h)

    // Both nodes are still selected (the drag didn't drop the multi-selection) — deleting now
    // removes both corners at once, not just one.
    await page.keyboard.press('Delete')
    await expect(page.locator('.PropsPanel-info')).toContainText('Nodes: 2')
  })
})
