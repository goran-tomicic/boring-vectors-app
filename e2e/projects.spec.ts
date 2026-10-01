import { test, expect } from '@playwright/test'

test.describe('projects', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.TopBar-projectName')
  })

  test('TopBar menu offers Import/Export/Projects/Settings', async ({ page }) => {
    await page.click('.TopBar-menuButton')
    await expect(page.locator('.TopBar-dropdownItem')).toHaveText(['Import', 'Export', 'Projects', 'Settings'])
  })

  test('Projects modal can create a new project', async ({ page }) => {
    await page.click('.TopBar-menuButton')
    await page.click('text=Projects')
    await page.waitForSelector('.ProjectsModal')
    await expect(page.locator('.ProjectsModal-title')).toHaveText('Projects')

    await page.fill('.ProjectsModal-new input', 'E2E Test Project')
    await page.click('.ProjectsModal-new button:has-text("New")')
    await expect(page.locator('.TopBar-projectName')).toHaveText('E2E Test Project')
  })

  test('clicking the TopBar project name makes it editable and renames the project', async ({ page }) => {
    await page.click('.TopBar-projectName')
    const input = page.locator('.TopBar-projectNameInput')
    await input.fill('Renamed via TopBar')
    await input.press('Enter')
    await expect(page.locator('.TopBar-projectName')).toHaveText('Renamed via TopBar')

    // Persists across reload.
    await page.reload()
    await page.waitForSelector('.TopBar-projectName')
    await expect(page.locator('.TopBar-projectName')).toHaveText('Renamed via TopBar')
  })
})
