const { defineConfig, devices } = require('@playwright/test')

// Deliberately not a tooling default. `reuseExistingServer` adopts whatever is
// already listening here, so a shared port (4173 is Vite's preview default)
// lets an unrelated dev server — another checkout of this project, say —
// silently become the system under test and produce confident, wrong results.
// Two specs also navigate to this port by hostname, so keep them in step.
const port = 47317

module.exports = defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `python3 -m http.server ${port} --directory dist`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
