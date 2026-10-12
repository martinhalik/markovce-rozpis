// End-to-end walkthrough of the app in a real browser, desktop and phone.
// Run: E2E_DATABASE_URL=postgres://… npm run e2e   (details: CLAUDE.md, "Testing")
// Reports: e2e-report/index.html (one page, screenshots inline, for people)
//          playwright-report/ (Playwright's own, with traces, for debugging)
import { defineConfig } from '@playwright/test';
import { DEVICES, databaseUrl } from './fixtures.mjs';

const SESSION_SECRET = 'e2e-session-secret-0123456789abcdef0123456789';

export default defineConfig({
    testDir: '.',
    testMatch: '*.spec.mjs',
    globalSetup: './global-setup.mjs',
    // Each project's steps share devices and build on each other.
    fullyParallel: false,
    workers: Object.keys(DEVICES).length,
    retries: 0,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    forbidOnly: !!process.env.CI,
    outputDir: '../test-results',
    reporter: [
        ['list'],
        ['html', { outputFolder: '../playwright-report', open: 'never' }],
        ['./summary-reporter.mjs', { outputFolder: '../e2e-report' }],
    ],
    use: {
        locale: 'sk-SK',
        timezoneId: 'Europe/Bratislava',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        // Use the preinstalled Chromium where the environment provides one.
        launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
    },
    projects: [
        {
            name: 'desktop',
            use: { baseURL: `http://localhost:${DEVICES.desktop.port}`, viewport: { width: 1280, height: 860 } },
        },
        {
            name: 'mobile',
            use: {
                baseURL: `http://localhost:${DEVICES.mobile.port}`,
                viewport: { width: 390, height: 844 },
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
            },
        },
    ],
    webServer: Object.entries(DEVICES).map(([device, { port }]) => ({
        command: 'node --import ./e2e/register.mjs e2e/server.mjs',
        cwd: '..',
        url: `http://localhost:${port}/`,
        reuseExistingServer: false,
        stdout: 'pipe',
        env: {
            PORT: String(port),
            E2E_SERVER_DATABASE_URL: databaseUrl(device),
            SESSION_SECRET,
            GOOGLE_CLIENT_ID: 'e2e',
            GOOGLE_CLIENT_SECRET: 'e2e',
            APP_ORIGIN: `http://localhost:${port}`,
        },
    })),
});
