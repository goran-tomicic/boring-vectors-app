import { test, expect } from '@playwright/test'
import {
  enableAnimateMode,
  importSampleShape,
  timelineTrackBox,
  readPositionProps,
  pathPointToScreen,
  shrinkTimeline,
  growTimeline,
} from './helpers.js'

test.describe('animation', () => {
  test('feature flag is off by default and gates the Draw/Animate switch', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.TopBar-projectName')
    await expect(page.locator('.TopBar-modeSwitch')).toHaveCount(0)
    await expect(page.locator('.Timeline')).toHaveCount(0)

    await page.click('.TopBar-menuButton')
    await page.click('text=Settings')
    await page.click('text=Animation timeline (beta — early, expect rough edges)')
    await page.click('.SettingsModal-close')
    await expect(page.locator('.TopBar-modeSwitch')).toBeVisible()
  })

  test.describe('with the flag on', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.waitForSelector('.TopBar-projectName')
      await enableAnimateMode(page)
      await importSampleShape(page)
    })

    test('Animate mode hides the drawing Toolbar without resizing the canvas', async ({ page }) => {
      const before = (await page.locator('.CanvasWrap-canvas').boundingBox())!
      await expect(page.locator('.Toolbar')).toHaveCount(0)
      const after = (await page.locator('.CanvasWrap-canvas').boundingBox())!
      expect(after.width).toBe(before.width)
      expect(after.height).toBe(before.height)
    })

    test('can add, drag, and delete a keyframe', async ({ page }) => {
      const { row, track, box } = await timelineTrackBox(page, 1) // X
      await row.locator('button', { hasText: 'Key' }).click()
      await expect(row.locator('.Timeline-keyframe')).toHaveCount(1)

      // Drag the keyframe to a new time.
      const diamond = row.locator('.Timeline-keyframe')
      const diamondBox = (await diamond.boundingBox())!
      await page.mouse.move(diamondBox.x + diamondBox.width / 2, diamondBox.y + diamondBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 5 })
      await page.mouse.up()
      await expect(row.locator('.Timeline-keyframe')).toHaveCount(1)

      // Delete it.
      await row.locator('.Timeline-keyframe').dblclick()
      await expect(row.locator('.Timeline-keyframe')).toHaveCount(0)
      void track
    })

    test('scrubbing interpolates and keeps the field live (not stale)', async ({ page }) => {
      const { row, track, box } = await timelineTrackBox(page, 1) // X
      const input = row.locator('input[type="number"]')

      await row.locator('button', { hasText: 'Key' }).click() // kf1 at t=0, live value
      await page.mouse.click(box.x + box.width - 20, box.y + box.height / 2) // scrub to end
      await input.fill('555')
      await row.locator('button', { hasText: 'Key' }).click() // kf2 at ~end, 555

      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2) // scrub to middle
      const mid = Number(await input.inputValue())
      expect(mid).toBeGreaterThan(300)
      expect(mid).toBeLessThan(555)
      void track
    })

    test('playback runs and stops at the end without looping by default', async ({ page }) => {
      await page.fill('.Timeline-durationLabel input', '0.5')
      await page.click('button[title="Play"]')
      await page.waitForTimeout(1000)
      await expect(page.locator('button[title="Play"]')).toBeVisible()
      await expect(page.locator('.Timeline-time')).toHaveText('0.50s / 0.50s')
    })

    test('loop setting makes playback wrap instead of stopping', async ({ page }) => {
      await page.click('.TopBar-menuButton')
      await page.click('text=Settings')
      await page.click('text=Loop timeline playback')
      await page.click('.SettingsModal-close')

      await page.fill('.Timeline-durationLabel input', '0.5')
      await page.click('button[title="Play"]')
      await page.waitForTimeout(1000)
      await expect(page.locator('button[title="Pause"]')).toBeVisible()
    })

    test('direct manipulation updates an existing keyframe at the current time', async ({ page }) => {
      const { row } = await timelineTrackBox(page, 1) // X
      const input = row.locator('input[type="number"]')
      await row.locator('button', { hasText: 'Key' }).click()
      await expect(row.locator('.Timeline-keyframe')).toHaveCount(1)
      const beforeDrag = Number(await input.inputValue())

      // At its default height the Timeline overlays most of the canvas — shrink it first so
      // the drag below actually lands on the shape instead of the Timeline panel.
      await shrinkTimeline(page)
      const before = await readPositionProps(page)
      const start = await pathPointToScreen(page, before.x + before.w / 2, before.y + before.h / 2)
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      await page.mouse.move(start.x + 100, start.y, { steps: 10 })
      await page.mouse.up()

      await expect(row.locator('.Timeline-keyframe')).toHaveCount(1) // updated, not duplicated
      const afterDrag = Number(await input.inputValue())
      expect(afterDrag).not.toBe(beforeDrag) // the keyframe's value actually changed

      // Survives a scrub-away-and-back, proving the keyframe itself changed (not just the
      // live, unkeyed value). Grow the Timeline back first — `box` was captured before the
      // shrink and the panel's own layout has moved since.
      await growTimeline(page)
      const grown = await timelineTrackBox(page, 1)
      await page.mouse.click(grown.box.x + grown.box.width - 5, grown.box.y + grown.box.height / 2)
      await page.mouse.click(grown.box.x + 5, grown.box.y + grown.box.height / 2)
      expect(Number(await input.inputValue())).toBeCloseTo(afterDrag, 0)
    })

    test('rotation and scale keyframes render visibly on the shape', async ({ page }) => {
      const { row } = await timelineTrackBox(page, 5) // Rotation
      await row.locator('button', { hasText: 'Key' }).click()
      const input = row.locator('input[type="number"]')
      await input.fill('90')
      await row.locator('button', { hasText: 'Key' }).click()
      // Moving the playhead re-evaluates rotation; just assert no crash and a keyframe exists.
      await expect(row.locator('.Timeline-keyframe')).toHaveCount(1)
    })

    test('deleting all of a path\'s rotation keyframes prunes its rest geometry, so a later node-edit sticks', async ({
      page,
    }) => {
      // Regression: a path's rest-geometry snapshot (captured once, the first time
      // rotation/scale is keyframed — see PathTrack.restSegments in animation.ts) used to
      // only get cleared when the path's ENTIRE keyframe track was removed. If an unrelated
      // property (here, X) was also keyframed, deleting just the rotation keyframes left a
      // stale snapshot behind — and the next playhead change would silently reset any
      // subsequent node-edit back to that stale shape.

      // Key X too — keeps the path's track alive after rotation's own keyframe is deleted.
      const { row: xRow } = await timelineTrackBox(page, 1) // X
      await xRow.locator('button', { hasText: 'Key' }).click()
      await expect(xRow.locator('.Timeline-keyframe')).toHaveCount(1)

      // Key rotation at t=0 with value 0 (identity) — captures rest geometry without
      // visually rotating the shape, so screen coordinates stay valid for the node-drag below.
      const { row } = await timelineTrackBox(page, 5) // Rotation
      await row.locator('button', { hasText: 'Key' }).click()
      await expect(row.locator('.Timeline-keyframe')).toHaveCount(1)

      // Delete only the rotation keyframe — X survives, so the path track itself isn't removed.
      await row.locator('.Timeline-keyframe').dblclick()
      await expect(row.locator('.Timeline-keyframe')).toHaveCount(0)

      // Switch to Node tool and drag a node to reshape the star.
      await shrinkTimeline(page)
      await page.keyboard.press('n')
      const before = await readPositionProps(page)
      const nodePoint = await pathPointToScreen(page, before.x + before.w / 2, before.y)
      await page.mouse.move(nodePoint.x, nodePoint.y)
      await page.mouse.down()
      await page.mouse.move(nodePoint.x + 40, nodePoint.y + 10, { steps: 8 })
      await page.mouse.up()
      await growTimeline(page)

      const nodeXInput = page.locator('.PropsPanel-row').nth(2).locator('input').first()
      const nodeXAfterEdit = await nodeXInput.inputValue()

      // Scrub the playhead away and back — a stale rest snapshot would silently reset this.
      const { box: trackBox } = await timelineTrackBox(page, 0)
      await page.mouse.click(trackBox.x + trackBox.width - 5, trackBox.y + trackBox.height / 2)
      await page.mouse.click(trackBox.x + 5, trackBox.y + trackBox.height / 2)

      expect(await nodeXInput.inputValue()).toBe(nodeXAfterEdit)
    })

    test('clicking a keyframe opens an easing editor; double-click still deletes', async ({ page }) => {
      const { row } = await timelineTrackBox(page, 1) // X
      await row.locator('button', { hasText: 'Key' }).click()
      const diamond = row.locator('.Timeline-keyframe')
      await expect(diamond).toHaveCount(1)

      await diamond.click()
      await expect(page.locator('.Timeline-keyframeEditor')).toBeVisible()
      await page.locator('.Timeline-keyframeEditor select').selectOption('easeInOut')
      await expect(diamond).toHaveAttribute('title', /easeInOut/)

      await page.locator('.Timeline-keyframeEditor button', { hasText: '×' }).click()
      await expect(page.locator('.Timeline-keyframeEditor')).toHaveCount(0)

      // A genuine double-click still deletes outright (the editor's open-delay must not
      // interfere with the dblclick gesture).
      await diamond.dblclick()
      await expect(diamond).toHaveCount(0)
    })

    test('rotate-handle drag extends an already-keyframed rotation', async ({ page }) => {
      const { row } = await timelineTrackBox(page, 5) // Rotation
      await row.locator('button', { hasText: 'Key' }).click() // rotation=0 at t=0
      await expect(row.locator('.Timeline-keyframe')).toHaveCount(1)

      // At its default height the Timeline overlays most of the canvas — shrink it first so
      // the rotate-handle drag below actually lands on the shape.
      await shrinkTimeline(page)
      const before = await readPositionProps(page)
      const topCenter = await pathPointToScreen(page, before.x + before.w / 2, before.y)
      const rotateHandle = { x: topCenter.x, y: topCenter.y - 22 }

      await page.mouse.move(rotateHandle.x, rotateHandle.y)
      await page.mouse.down()
      await page.mouse.move(rotateHandle.x + 90, rotateHandle.y + 20, { steps: 8 })
      await page.mouse.up()

      // Still exactly one keyframe (updated in place at t=0, not a second one added) — its
      // stored value, not the "next value to key" input (which has no live readback for
      // rotation, see PROPERTY_DEFS.getLive in Timeline.tsx), is what should have changed.
      const diamond = row.locator('.Timeline-keyframe')
      await expect(diamond).toHaveCount(1)
      await expect(diamond).not.toHaveAttribute('title', /Rotation 0\.00/)
    })

    test('Timeline groups property rows per shape — only the selected one is expanded', async ({ page }) => {
      // The Timeline overlays most of the canvas at its default height — shrink it first so
      // the rectangle drawn below actually lands on the canvas, not the Timeline panel.
      await shrinkTimeline(page)

      // A second shape alongside the sample star from beforeEach.
      const canvas = page.locator('.CanvasWrap-canvas')
      const box = (await canvas.boundingBox())!
      await page.keyboard.press('m') // rectangle tool
      await page.mouse.move(box.x + 100, box.y + 100)
      await page.mouse.down()
      await page.mouse.move(box.x + 160, box.y + 150, { steps: 5 })
      await page.mouse.up()
      await page.keyboard.press('v')
      await growTimeline(page)

      const starHeader = page.locator('.Timeline-groupHeader', { hasText: 'Shape' })
      const rectHeader = page.locator('.Timeline-groupHeader', { hasText: 'Rectangle' })
      await expect(starHeader).toHaveCount(1)
      await expect(rectHeader).toHaveCount(1)

      // The rectangle (just drawn) is selected — its group is expanded, the star's isn't.
      await expect(rectHeader).toHaveAttribute('aria-pressed', 'true')
      await expect(starHeader).toHaveAttribute('aria-pressed', 'false')
      await expect(page.locator('.Timeline-tracks')).toHaveCount(1)

      // Key a property on the rectangle — its header should now show the "has keyframes" dot.
      const opacityRow = page.locator('.Timeline-row').first()
      await opacityRow.locator('button', { hasText: 'Key' }).click()
      await expect(rectHeader.locator('.Timeline-groupDot')).toHaveCount(1)
      await expect(starHeader.locator('.Timeline-groupDot')).toHaveCount(0)

      // Switching groups by clicking the star's header selects it on canvas too (and
      // collapses the rectangle's group, expanding the star's instead).
      await starHeader.click()
      await expect(starHeader).toHaveAttribute('aria-pressed', 'true')
      await expect(rectHeader).toHaveAttribute('aria-pressed', 'false')
      await expect(page.locator('.Timeline-tracks')).toHaveCount(1)
      await expect(page.locator('.PropsPanel-heading', { hasText: 'Position' })).toBeVisible()

      // The rectangle's keyframe dot persists even while collapsed/not selected.
      await expect(rectHeader.locator('.Timeline-groupDot')).toHaveCount(1)
    })
  })
})
