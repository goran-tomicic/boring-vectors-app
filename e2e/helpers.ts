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
