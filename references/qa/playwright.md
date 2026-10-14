# Playwright — e2e and UI/UX QA for any web UI

Playwright drives the real browser for e2e flows and for the UI/UX checks:
accessibility, visual regression, responsive layout, keyboard, reduced motion.
It works whatever the server stack — Django, Phoenix, Rails, Go templates, and
Next.js alike — because it tests what the browser receives. Use the Node runner
(`@playwright/test`) unless the team is Python-only, then `pytest-playwright`.

Native mobile is out of its reach: use the platform's own runner (XCUITest,
Espresso) or Maestro, and keep Playwright for any web surface.

## Layout

```
e2e/
  flows/          one spec per v1 core flow, named after the flow
  ux/             accessibility, visual, keyboard, reduced-motion specs
  fixtures/       test data builders, authenticated pages
  auth.setup.ts   logs in once per role, saves storageState
playwright.config.ts
```

## Config skeleton

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,        // one retry, to capture a trace — not to pass
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
    // product class adds:
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, dependencies: ['setup'] },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, dependencies: ['setup'] },
  ],
  webServer: {
    command: '<the stack\'s start command>',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

## Writing flow tests

- **Locate by role and name**, the way a user and a screen reader find things:
  `page.getByRole('button', { name: 'Save' })`. CSS selectors and test ids are
  the fallback, not the default — a test that only passes with a `data-testid`
  says nothing about whether the control is labelled.
- **Assert with web-first assertions** (`await expect(locator).toBeVisible()`),
  which wait. Never `waitForTimeout`.
- **Log in once per role** in a setup project and reuse `storageState`. Logging in
  through the UI in every test is slow and tests login a hundred times.
- **Seed through the API or the database**, not through the UI, except in the
  flow under test.
- **Freeze time** with `page.clock.install()` where the page shows dates or
  countdowns. **Stub third parties** with `page.route()` — the e2e suite tests
  this product, not a payment provider's sandbox uptime.

## UI/UX checks

### Accessibility — `@axe-core/playwright`

```ts
import AxeBuilder from '@axe-core/playwright'

const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  .analyze()
expect(results.violations).toEqual([])
```

Scan every page **in each state** a flow reaches — empty, loaded, error, open
dialog — not only on first load. Axe catches perhaps a third of real issues; the
keyboard and reduced-motion checks below cover more.

### Keyboard path

Each core flow completes with the keyboard alone: `page.keyboard.press('Tab')`
through the controls, assert `toBeFocused()` lands where expected, that focus is
visible, that dialogs trap and restore focus, and that `Escape` closes them.

### Accessible structure — ARIA snapshots

`await expect(page.getByRole('main')).toMatchAriaSnapshot(...)` locks the
accessible tree of a key screen: headings, landmarks, labels. It catches a
heading level or a label silently changing, which a pixel diff will not.

### Visual regression

```ts
await expect(page).toHaveScreenshot('dashboard-empty.png', {
  fullPage: true,
  animations: 'disabled',
  mask: [page.getByTestId('relative-time')],
})
```

- Take screenshots at the breakpoints `DESIGN.md` names, in **each theme**
  (`page.emulateMedia({ colorScheme: 'dark' })`).
- **Generate and compare baselines in the same environment** — the official
  Playwright Docker image, pinned to the same version locally and in CI. Fonts
  render differently per OS; baselines from a laptop fail in CI.
- Mask what changes legitimately (times, avatars, randomised content); freeze
  the clock rather than masking where possible.
- A baseline update is a reviewed change: the PR shows the new image.

### Reduced motion

```ts
test.use({ reducedMotion: 'reduce' })
```

Run the flows once with reduced motion. Assert that content which animates in is
still reachable and that nothing depends on a transition ending to become usable.

### Design-token conformance

Where `DESIGN.md` names tokens, a spec may read computed styles on key components
(`getComputedStyle` via `locator.evaluate`) and assert they resolve to token
values — cheap insurance against hard-coded colours creeping in. Prefer a lint
rule when the stack has one; use this where it does not.

## CI

- Install browsers with `npx playwright install --with-deps <browsers>` or run in
  the Playwright Docker image (required for visual baselines).
- Upload the HTML report and traces as artifacts on failure — a red e2e job
  without a trace costs a re-run to diagnose.
- Shard with `--shard=i/n` once the suite passes a few minutes.
- E2E runs against a built, production-mode app, not the dev server.
