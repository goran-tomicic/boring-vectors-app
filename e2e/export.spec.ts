import { test, expect } from '@playwright/test'
import { importSampleShape, enableAnimateMode } from './helpers.js'

async function downloadBytes(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

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

  test('downloads a valid PNG (correct magic bytes, non-trivial size)', async ({ page }) => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Download .png')])
    const bytes = await downloadBytes(download)
    // PNG files always start with this fixed 8-byte signature.
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(bytes.length).toBeGreaterThan(100) // not just a near-empty/corrupt stub
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

// GIF's "repeat" encoding needs Animate mode enabled (gates the GIF/video export section),
// so these don't share the plain draw-mode beforeEach above — each does its own setup.
test.describe('GIF export respects the Loop timeline playback setting', () => {
  // A GIF's loop count lives in an optional "NETSCAPE2.0" application extension block —
  // gif.js (see node_modules/gif.js/dist/gif.worker.js) only writes it when `repeat >= 0`,
  // omitting it entirely for `repeat: -1` (play once, standard GIF convention for "no loop").
  const hasLoopExtension = (bytes: Buffer) => bytes.includes(Buffer.from('NETSCAPE2.0', 'ascii'))

  test('includes a looping extension when Loop timeline playback is on', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.TopBar-projectName')
    await enableAnimateMode(page)
    await importSampleShape(page)

    // Loop timeline playback is off by default — turn it on.
    await page.click('.TopBar-menuButton')
    await page.click('text=Settings')
    await page.click('text=Loop timeline playback')
    await page.click('.SettingsModal-close')

    await page.click('.TopBar-menuButton')
    await page.click('text=Export')
    await page.waitForSelector('.ExportModal')

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Download .gif')])
    const bytes = await downloadBytes(download)
    expect(bytes.length).toBeGreaterThan(0)
    expect(hasLoopExtension(bytes)).toBe(true)
  })

  test('omits the looping extension when Loop timeline playback is off (the default)', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.TopBar-projectName')
    await enableAnimateMode(page)
    await importSampleShape(page)
    await page.click('.TopBar-menuButton')
    await page.click('text=Export')
    await page.waitForSelector('.ExportModal')

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Download .gif')])
    const bytes = await downloadBytes(download)
    expect(bytes.length).toBeGreaterThan(0)
    expect(hasLoopExtension(bytes)).toBe(false)
  })
})

test.describe('video export', () => {
  test('downloads a valid WebM (correct EBML magic bytes)', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.TopBar-projectName')
    await enableAnimateMode(page)
    await importSampleShape(page)
    await page.click('.TopBar-menuButton')
    await page.click('text=Export')
    await page.waitForSelector('.ExportModal')

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Download .webm')])
    const bytes = await downloadBytes(download)
    // WebM is a Matroska/EBML container — every valid file starts with this 4-byte signature.
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  })
})
