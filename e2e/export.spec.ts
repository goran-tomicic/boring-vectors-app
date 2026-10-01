import { test, expect } from '@playwright/test'
import { importSampleShape } from './helpers.js'

test.describe('export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.TopBar-projectName')
    await importSampleShape(page)
    await page.click('.TopBar-menuButton')
    await page.click('text=Export')
    await page.waitForSelector('.ExportModal')
  })

  test('downloads a valid, non-empty SVG', async ({ page }) => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Download .svg')])
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(chunk as Buffer)
    const content = Buffer.concat(chunks).toString('utf8')
    expect(content).toContain('<svg')
    expect(content).toContain('<path')
  })

  test('downloads a non-empty PNG', async ({ page }) => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Download .png')])
    const path = await download.path()
    expect(path).toBeTruthy()
  })

  test('project file export/import round-trips the project', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('text=Download project file'),
    ])
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(chunk as Buffer)
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    expect(payload).toHaveProperty('svg')
    expect(payload).toHaveProperty('canvasWidth')
    expect(payload.svg).toContain('<path')

    const savedPath = await download.path()
    // The modal already closes itself right after triggering the download — no explicit close.
    await page.click('.TopBar-menuButton')
    await page.click('text=Projects')
    await page.waitForSelector('.ProjectsModal')
    await page.setInputFiles('.ProjectsModal-fileInput', savedPath!)
    await page.waitForSelector('.ProjectsModal', { state: 'hidden' })
    await expect(page.locator('.TopBar-projectName')).not.toHaveText('')
  })
})
