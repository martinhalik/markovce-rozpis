// The app as people use it: several people on several devices, signing in,
// editing, making a mistake, undoing it, restoring from history, plus who
// gets no access and the public calendar. Runs once per project (desktop,
// mobile). Every step attaches a screenshot; the summary reporter turns
// those into e2e-report/index.html.
import { test, expect } from '@playwright/test';
import { SEEDED_SUNDAY_SERVICE, currentWeekKey, withDb } from './fixtures.mjs';

test.describe.configure({ mode: 'serial' });

const WEEK = currentWeekKey();
const ADDED_SERVICE = '18:00 Akatist';

let device1; // wife@krm.sk
let device2; // kolega@krm.sk
let device3; // student@student.krm.sk
let isMobile = false;
let deviceName;

// ── helpers ────────────────────────────────────────────────────────────────
async function openDevice(browser, label) {
    const use = test.info().project.use;
    const context = await browser.newContext({
        baseURL: use.baseURL,
        viewport: use.viewport,
        deviceScaleFactor: use.deviceScaleFactor,
        isMobile: use.isMobile,
        hasTouch: use.hasTouch,
        locale: use.locale,
        timezoneId: use.timezoneId,
    });
    const page = await context.newPage();
    page.label = label;
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    return page;
}

// Screenshot for the report, scrolled so `focus` is in view.
async function snap(page, focus) {
    if (focus) {
        await page.locator(focus).first().scrollIntoViewIfNeeded().catch(() => {});
        if (isMobile) {
            await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (el) window.scrollBy(0, el.getBoundingClientRect().top - 90);
            }, focus);
        }
    }
    await page.waitForTimeout(300);
    await test.info().attach(`${page.label}`, {
        body: await page.screenshot({ type: 'jpeg', quality: 80 }),
        contentType: 'image/jpeg',
    });
    expect(page.errors, `JavaScript errors on ${page.label}`).toEqual([]);
}

async function signIn(page, email) {
    await page.goto('/');
    await page.locator('#accountBtn', { hasText: 'Prihlásiť sa' }).click();
    await page.locator('#email').fill(email);
    await page.locator('#continue').click();
    await page.waitForURL('/');
}

const status = (page) => page.locator('#syncStatus');
const sundayOnScreen = (page) => page.evaluate(() => state.events.sunday.slice());
const serverSunday = () => withDb(deviceName, async (db) => {
    const { rows } = await db.query(
        `SELECT w.payload->'events'->'sunday' AS sunday FROM weeks w
         JOIN parishes p ON p.id = w.parish_id WHERE p.slug = 'markovce' AND w.week_key = $1`, [WEEK]);
    return rows[0] ? rows[0].sunday : null;
});
const pickSunday = (page) => page.locator('.day-btn[data-day="sunday"]').click();

test.beforeAll(async ({ browser }) => {
    deviceName = test.info().project.name;
    isMobile = !!test.info().project.use.isMobile;
    device1 = await openDevice(browser, 'Device 1 · wife@krm.sk');
    device2 = await openDevice(browser, 'Device 2 · kolega@krm.sk');
    device3 = await openDevice(browser, 'Device 3 · student@student.krm.sk');
});

// On failure, show every device as it was, so the report explains itself.
test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    for (const page of [device1, device2, device3]) {
        if (!page || page.isClosed() || page.url() === 'about:blank') continue;
        await testInfo.attach(`${page.label} · at failure`, {
            body: await page.screenshot({ type: 'jpeg', quality: 80 }),
            contentType: 'image/jpeg',
        }).catch(() => {});
    }
});

test.afterAll(async () => {
    for (const page of [device1, device2, device3]) await page?.context().close();
});

// ── walkthrough ────────────────────────────────────────────────────────────
test('01 Signed out: header offers sign-in, orange "not syncing" pill, old ?key= link is dropped', async () => {
    await device1.goto('/?key=old-shared-key');
    await expect(status(device1)).toHaveAttribute('data-status', 'signedout');
    await expect(device1.locator('#accountBtn')).toContainText('Prihlásiť sa');
    expect(device1.url()).not.toContain('key=');
    await snap(device1, 'header');
});

test('02 Sign in with an @krm.sk Google account → editor automatically; the existing server schedule loads (old database migrated in place)', async () => {
    await signIn(device1, 'wife@krm.sk');
    await expect(status(device1)).toHaveAttribute('data-status', 'synced');
    await expect(device1.locator('#accountBtn')).toContainText('Odhlásiť');
    await expect.poll(() => sundayOnScreen(device1)).toContain(SEEDED_SUNDAY_SERVICE);
    await snap(device1, 'header');
});

test('03 Preview image is titled with the parish name', async () => {
    if (isMobile) await device1.locator('#viewTabPreview').click();
    await expect(device1.locator('#parishSubtitle')).toContainText('Pravoslávni Markovce');
    await snap(device1, '#previewPanel');
    if (isMobile) await device1.locator('#viewTabEditor').click();
});

test('04 Add a service with "+ Pridať udalosť" → saved to the server', async () => {
    await pickSunday(device1);
    await device1.locator('.add-event-btn').click();
    const input = device1.locator('#eventsList .event-item input').last();
    await input.fill(ADDED_SERVICE);
    await input.press('Enter');
    await device1.locator('#dayFeastName').click(); // blur → change event
    await expect.poll(serverSunday, { timeout: 15_000 }).toContain(ADDED_SERVICE);
    await snap(device1, '#eventsList');
});

test('05 Another @krm.sk person on another device sees the change', async () => {
    await signIn(device2, 'kolega@krm.sk');
    await expect(status(device2)).toHaveAttribute('data-status', 'synced');
    await pickSunday(device2);
    await expect.poll(() => sundayOnScreen(device2)).toContain(ADDED_SERVICE);
    await snap(device2, '#eventsList');
});

test('06 A mistake: "Vymazať všetky udalosti" empties the week, also on the server', async () => {
    await device2.getByText('Vymazať všetky udalosti').click();
    await expect.poll(serverSunday, { timeout: 15_000 }).toEqual([]);
    await snap(device2, '#eventsList');
});

test('07 Undo (↶ Späť) brings the services back, also on the server', async () => {
    await device2.locator('#undoBtn').click();
    expect(await sundayOnScreen(device2)).toContain(ADDED_SERVICE);
    await expect.poll(serverSunday, { timeout: 15_000 }).toContain(ADDED_SERVICE);
    await snap(device2, '.week-label');
});

test('08 Redo (↷ Znova) repeats the deletion (left on the server to demonstrate History)', async () => {
    await device2.locator('#redoBtn').click();
    await expect.poll(serverSunday, { timeout: 15_000 }).toEqual([]);
    await snap(device2, '.week-label');
});

test('09 Device 1 reopens the app and sees the mistake from Device 2', async () => {
    await device1.reload();
    await expect(status(device1)).toHaveAttribute('data-status', 'synced');
    await pickSunday(device1);
    await expect.poll(() => sundayOnScreen(device1)).toEqual([]);
    await snap(device1, '#eventsList');
});

test('10 History lists who saved what and when; the version before the mistake is shown', async () => {
    await device1.locator('#historyBtn').click();
    const items = device1.locator('.history-item');
    await expect(items.first()).toContainText('kolega@krm.sk');
    await expect(items.first()).toContainText('aktuálna');
    await expect(items.filter({ hasText: 'wife@krm.sk' })).toHaveCount(1);
    await expect(items.last()).toContainText('Pôvodné údaje');
    await items.filter({ hasText: 'wife@krm.sk' }).locator('summary').click();
    await snap(device1, '.history-modal-content');
});

test('11 "Obnoviť túto verziu" restores it, also on the server', async () => {
    await device1.locator('.history-item', { hasText: 'wife@krm.sk' }).locator('.history-restore').click();
    await expect(device1.locator('#historyModal')).toBeHidden();
    expect(await sundayOnScreen(device1)).toContain(ADDED_SERVICE);
    await expect.poll(serverSunday, { timeout: 15_000 }).toContain(ADDED_SERVICE);
    await snap(device1, '#eventsList');
});

test('12 Device 2 reopens the app and sees the restored schedule', async () => {
    await device2.reload();
    await pickSunday(device2);
    await expect.poll(() => sundayOnScreen(device2)).toContain(ADDED_SERVICE);
    await snap(device2, '#eventsList');
});

test('13 An address outside @krm.sk (student.krm.sk) gets no access and nothing syncs', async () => {
    await signIn(device3, 'student@student.krm.sk');
    await expect(status(device3)).toHaveAttribute('data-status', 'nomember');
    await expect(device3.locator('#historyBtn')).toBeHidden();
    await snap(device3, 'header');
});

test('14 A member of two parishes gets a parish picker in the header', async () => {
    await withDb(deviceName, async (db) => {
        await db.query(`INSERT INTO parishes (slug, name) VALUES ('presov', 'Pravoslávni Prešov') ON CONFLICT DO NOTHING`);
        await db.query(`INSERT INTO parish_members (parish_id, user_id, role)
            SELECT p.id, u.id, 'viewer' FROM parishes p, users u
            WHERE p.slug = 'presov' AND u.email = 'wife@krm.sk' ON CONFLICT DO NOTHING`);
    });
    await device1.reload();
    await expect(device1.locator('#parishSelect')).toBeVisible();
    await snap(device1, 'header');
});

test('15 View-only parish: lock banner, undo/redo off, History hidden', async () => {
    await device1.locator('#parishSelect').selectOption('presov');
    await expect(status(device1)).toHaveAttribute('data-status', 'readonly');
    await expect(device1.locator('#weekLockBanner')).toContainText('len na čítanie');
    await expect(device1.locator('#undoBtn')).toBeDisabled();
    await expect(device1.locator('#historyBtn')).toBeHidden();
    await snap(device1, '.controls-panel');
});

test('16 Switching back to Markovce shows its own data, editable', async () => {
    await device1.locator('#parishSelect').selectOption('markovce');
    await expect(status(device1)).toHaveAttribute('data-status', 'synced');
    await pickSunday(device1);
    await expect.poll(() => sundayOnScreen(device1)).toContain(ADDED_SERVICE);
    await snap(device1, 'header');
});

test('17 Public calendar works without signing in: /kalendar.ics and /p/<parish>/kalendar.ics; unknown parish → 404', async () => {
    const anon = await openDevice(device1.context().browser(), 'Anyone · no sign-in');
    try {
        const ics = await anon.request.get('/kalendar.ics');
        const presov = await anon.request.get('/p/presov/kalendar.ics');
        const missing = await anon.request.get('/p/neexistuje/kalendar.ics');
        expect(ics.status()).toBe(200);
        expect(presov.status()).toBe(200);
        expect(missing.status()).toBe(404);
        const text = await ics.text();
        expect(text).toContain('SUMMARY:Akatist');
        const excerpt = text.split('\r\n').filter((l) => /^(X-WR-CALNAME|SUMMARY|DTSTART)/.test(l)).slice(0, 24).join('\n');
        await anon.setContent(`<body style="background:#fff;font:14px/1.45 monospace;padding:16px;white-space:pre-wrap">`
            + `<b>GET /kalendar.ics → ${ics.status()}\nGET /p/presov/kalendar.ics → ${presov.status()}\n`
            + `GET /p/neexistuje/kalendar.ics → ${missing.status()}</b>\n\n${excerpt.replace(/</g, '&lt;')}</body>`);
        await snap(anon);
    } finally {
        await anon.context().close();
    }
});

test('18 Sign out: back to "Prihlásiť sa"; the schedule stays on the device', async () => {
    await device1.locator('#accountBtn').click();
    await expect(status(device1)).toHaveAttribute('data-status', 'signedout');
    await expect(device1.locator('#accountBtn')).toContainText('Prihlásiť sa');
    await pickSunday(device1);
    expect(await sundayOnScreen(device1)).toContain(ADDED_SERVICE);
    await snap(device1, 'header');
});
