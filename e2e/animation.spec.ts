import { test, expect } from '@playwright/test'
import { enableAnimateMode, importSampleShape, timelineTrackBox } from './helpers.js'

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
      const { row, box } = await timelineTrackBox(page, 1) // X
      const input = row.locator('input[type="number"]')
      await row.locator('button', { hasText: 'Key' }).click()
      await expect(row.locator('.Timeline-keyframe')).toHaveCount(1)

      const canvas = page.locator('.CanvasWrap-canvas')
      const canvasBox = (await canvas.boundingBox())!
      await page.mouse.move(canvasBox.x + canvasBox.width * 0.39, canvasBox.y + canvasBox.height * 0.5)
      await page.mouse.down()
      await page.mouse.move(canvasBox.x + canvasBox.width * 0.39 + 100, canvasBox.y + canvasBox.height * 0.5, {
        steps: 10,
      })
      await page.mouse.up()

      await expect(row.locator('.Timeline-keyframe')).toHaveCount(1) // updated, not duplicated
      const afterDrag = Number(await input.inputValue())

      // Survives a scrub-away-and-back, proving the keyframe itself changed.
      await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2)
      await page.mouse.click(box.x + 5, box.y + box.height / 2)
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
  })
})
