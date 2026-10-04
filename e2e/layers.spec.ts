import { test, expect } from '@playwright/test'
import { importSampleShape, readPositionProps, pathPointToScreen } from './helpers.js'

test.describe('layers panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.TopBar-projectName')
  })

  test('imported shape gets a derived name, numbered once duplicated', async ({ page }) => {
    await importSampleShape(page)
    await expect(page.locator('.LayersPanel-row')).toHaveText(['Shape'])

    // A second import of the same sample shape should number both as "Shape 1"/"Shape 2".
    await importSampleShape(page)
    await expect(page.locator('.LayersPanel-row')).toHaveText(['Shape 2', 'Shape 1'])
  })

  test('rectangle and ellipse tools produce correctly named layers', async ({ page }) => {
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!

    await page.keyboard.press('m') // rectangle tool
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + 150, { steps: 5 })
    await page.mouse.up()

    await page.keyboard.press('v')
    await page.keyboard.press('l') // ellipse tool
    await page.mouse.move(box.x + 200, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 260, box.y + 150, { steps: 5 })
    await page.mouse.up()

    await expect(page.locator('.LayersPanel-row')).toHaveText(['Ellipse', 'Rectangle'])
  })

  test('selecting a layer row selects it on canvas, and canvas selection highlights the row', async ({ page }) => {
    const canvas = page.locator('.CanvasWrap-canvas')
    const box = (await canvas.boundingBox())!

    await page.keyboard.press('m')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + 150, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.press('v')

    await importSampleShape(page)

    const rectRow = page.locator('.LayersPanel-row', { hasText: 'Rectangle' })
    const shapeRow = page.locator('.LayersPanel-row', { hasText: 'Shape' })

    // Importing auto-selects the sample shape — its row should already show selected.
    await expect(shapeRow).toHaveAttribute('aria-pressed', 'true')
    await expect(rectRow).toHaveAttribute('aria-pressed', 'false')

    // While the star is selected, record its on-screen center for the canvas click below.
    const starProps = await readPositionProps(page)
    const starCenter = await pathPointToScreen(page, starProps.x + starProps.w / 2, starProps.y + starProps.h / 2)

    // Click the rectangle's row — canvas selection (and the Properties panel) follow.
    await rectRow.click()
    await expect(rectRow).toHaveAttribute('aria-pressed', 'true')
    await expect(shapeRow).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.PropsPanel-heading', { hasText: 'Position' })).toBeVisible()

    // Click back on the shape directly on canvas — the panel highlight follows.
    await page.mouse.click(starCenter.x, starCenter.y)
    await expect(shapeRow).toHaveAttribute('aria-pressed', 'true')
    await expect(rectRow).toHaveAttribute('aria-pressed', 'false')
  })

  test('layers panel can be hidden and shown via its toggle', async ({ page }) => {
    await importSampleShape(page)
    await expect(page.locator('.LayersPanel')).toBeVisible()
    await page.click('.LayersToggle-btn')
    await expect(page.locator('.LayersPanel')).toHaveCount(0)
    await page.click('.LayersToggle-btn')
    await expect(page.locator('.LayersPanel')).toBeVisible()
  })
})
