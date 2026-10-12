// Before every run: (re)create each device's database in the legacy layout.
// The app servers only connect on their first request, so this is safe even
// though Playwright has already started them.
import pg from 'pg';
import { DEVICES, currentWeekKey, databaseUrl, legacySeedSql } from './fixtures.mjs';

export default async function globalSetup() {
    const admin = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
    await admin.connect();
    try {
        for (const device of Object.keys(DEVICES)) {
            const name = new URL(databaseUrl(device)).pathname.slice(1);
            const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
            if (!exists.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
        }
    } finally {
        await admin.end();
    }
    for (const device of Object.keys(DEVICES)) {
        const db = new pg.Client({ connectionString: databaseUrl(device) });
        await db.connect();
        try { await db.query(legacySeedSql(currentWeekKey())); } finally { await db.end(); }
    }
}
