// Shared by the e2e setup and walkthrough: databases, the seeded week, helpers.
import pg from 'pg';

// Two app servers, each with its own database, so the desktop and mobile
// walkthroughs can run side by side without seeing each other's data.
export const DEVICES = {
    desktop: { port: 8787 },
    mobile: { port: 8788 },
};

// E2E_DATABASE_URL points at a Postgres the run may create databases in;
// each device gets "<that database>_<device>", wiped at the start of a run.
export function databaseUrl(device) {
    const base = process.env.E2E_DATABASE_URL;
    if (!base) throw new Error('E2E_DATABASE_URL is not set (see CLAUDE.md, "Testing")');
    const url = new URL(base);
    url.pathname = `${url.pathname.replace(/^\//, '') || 'rozpis'}_e2e_${device}`;
    return url.toString();
}

// Monday of the current week in the parish's time zone — the week the app
// opens on.
export function currentWeekKey() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bratislava' }));
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// What production looked like before multi-parish support: no parish_id, one
// shared schedule. The walkthrough starts from this, so every run also
// exercises the in-place migration.
export function legacySeedSql(weekKey) {
    const week = {
        events: {
            monday: [], tuesday: ['16:00 Katechéza'], wednesday: ['6:00 sv. Liturgia'],
            thursday: ['7:00 sv. Liturgia'], friday: ['7:00 sv. Liturgia'],
            saturday: ['8:00 sv. Liturgia', '17:00 Večerňa a spoveď'],
            sunday: ['10:00 Archijerejská sv. Liturgia', '13:00 Nedeľná škola'],
        },
        feasts: { monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: '' },
        dayTypes: {
            monday: 'non-fasting', tuesday: 'non-fasting', wednesday: 'fasting', thursday: 'non-fasting',
            friday: 'fasting', saturday: 'non-fasting', sunday: 'celebration',
        },
        fastingMode: false, iconGalleryId: null, iconManual: false,
        iconTransform: { scale: 1, offsetX: 0, offsetY: 0 },
    };
    // A real, older edit time: newer than a fresh device's passive copy, older than any new edit.
    const updatedAt = Date.now() - 3 * 24 * 3600 * 1000;
    return `
        DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;
        CREATE TABLE weeks (week_key TEXT PRIMARY KEY, payload JSONB NOT NULL, updated_at BIGINT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at BIGINT NOT NULL);
        INSERT INTO weeks VALUES ('${weekKey}', '${JSON.stringify(week).replace(/'/g, "''")}', ${updatedAt});
        INSERT INTO settings VALUES ('calendarStyle', '"antiochian"', ${updatedAt});
    `;
}

export const SEEDED_SUNDAY_SERVICE = '10:00 Archijerejská sv. Liturgia';

export async function withDb(device, fn) {
    const client = new pg.Client({ connectionString: databaseUrl(device) });
    await client.connect();
    try { return await fn(client); } finally { await client.end(); }
}
