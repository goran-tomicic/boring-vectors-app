import type { Page } from '@playwright/test'

/** Imports the first built-in sample shape (a star), which gets auto-selected. */
export async function importSampleShape(page: Page) {
  await page.click('.TopBar-menuButton')
  await page.click('text=Import')
  await page.waitForSelector('.ImportModal')
  await page.click('.ImportModal-sample')
  await page.click('.ImportModal-confirm')
  await page.waitForSelector('.ImportModal', { state: 'hidden' })
}

/** Turns on the animation feature flag and switches into Animate mode. */
export async function enableAnimateMode(page: Page) {
  await page.click('.TopBar-menuButton')
  await page.click('text=Settings')
  await page.waitForSelector('.SettingsModal')
  await page.click('text=Animation timeline (beta — early, expect rough edges)')
  await page.click('.SettingsModal-close')
  await page.click('text=Animate')
  await page.waitForSelector('.Timeline')
}

/** Resolves the bounding box of a Timeline property row's scrub track, given its row index (Opacity=0, X=1, Y=2, Width=3, Height=4, Rotation=5, Scale=6, Fill Color=7, Stroke Color=8). */
export async function timelineTrackBox(page: Page, rowIndex: number) {
  const row = page.locator('.Timeline-row').nth(rowIndex)
  const track = row.locator('.Timeline-track')
  const box = await track.boundingBox()
  if (!box) throw new Error(`Timeline row ${rowIndex} has no visible track`)
  return { row, track, box }
}

/**
 * Shrinks the Timeline panel to its minimum height by dragging its resize handle down. At its
 * default height the Timeline overlays most of the canvas (see CanvasWrap.tsx/Timeline.css —
 * it's an absolute overlay, not a flex sibling, so opening it doesn't resize the canvas or
 * shift the Rulers), which blocks mouse-based direct manipulation of a shape near canvas
 * center. Call this before driving a canvas drag/handle gesture in Animate mode.
 */
export async function shrinkTimeline(page: Page) {
  const handle = page.locator('.Timeline-resizeHandle')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 600, { steps: 5 })
  await page.mouse.up()
}

/** Reverses shrinkTimeline, growing the panel back to its (clamped) maximum height. */
export async function growTimeline(page: Page) {
  const handle = page.locator('.Timeline-resizeHandle')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 600, { steps: 5 })
  await page.mouse.up()
}

/** Reads the selected path's W/H/X/Y from the Properties panel's Position section (document order: W, H, X, Y). */
export async function readPositionProps(page: Page) {
  const inputs = page.locator('.PropsPanel-section').first().locator('input')
  const w = Number(await inputs.nth(0).inputValue())
  const h = Number(await inputs.nth(1).inputValue())
  const x = Number(await inputs.nth(2).inputValue())
  const y = Number(await inputs.nth(3).inputValue())
  return { x, y, w, h }
}

/**
 * Converts a point in canvas/path space (same coordinate system as the Properties panel's
 * X/Y/W/H, artboard origin at [0,0]) to a screen point — mirrors background.ts's
 * fitCanvasInView (scale = min((viewW-80)/canvasW, (viewH-80)/canvasH), centered). Assumes
 * the default 800×600 canvas and that the view hasn't been panned/zoomed off that initial fit,
 * true for every test here since none of them resize the canvas or touch the Pan tool.
 */
export async function pathPointToScreen(page: Page, x: number, y: number, canvasWidth = 800, canvasHeight = 600) {
  const box = (await page.locator('.CanvasWrap-canvas').boundingBox())!
  const scale = Math.min((box.width - 80) / canvasWidth, (box.height - 80) / canvasHeight)
  return {
    x: box.x + box.width / 2 + (x - canvasWidth / 2) * scale,
    y: box.y + box.height / 2 + (y - canvasHeight / 2) * scale,
  }
}
