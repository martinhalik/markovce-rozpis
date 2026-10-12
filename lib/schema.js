import { db, sql } from '@vercel/postgres';

// Schema for users, parishes, memberships, and per-parish weeks/settings.
//
// Every statement is idempotent, so the same list both creates a fresh
// database and migrates the original single-tenant one in place: the legacy
// `weeks`/`settings` tables (no parish_id, PK on week_key/key) already exist,
// so their CREATE TABLE IF NOT EXISTS is skipped and the DO blocks add
// parish_id, backfill it with the Markovce parish, and widen the primary key.
//
// db/init.sql is the same SQL for applying by hand (test/schema.test.js
// checks the two stay identical).
export const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS users (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    google_sub TEXT UNIQUE NOT NULL,
    email      TEXT NOT NULL,
    name       TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
    `CREATE TABLE IF NOT EXISTS parishes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug       TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
    `CREATE TABLE IF NOT EXISTS parish_members (
    parish_id  BIGINT NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parish_id, user_id)
)`,
    `CREATE INDEX IF NOT EXISTS parish_members_user_id_idx ON parish_members (user_id)`,
    // The original tenant. Must exist before the backfill below.
    `INSERT INTO parishes (slug, name) VALUES ('markovce', 'Pravoslávni Markovce')
    ON CONFLICT (slug) DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS weeks (
    parish_id  BIGINT NOT NULL REFERENCES parishes(id),
    week_key   TEXT NOT NULL,
    payload    JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (parish_id, week_key)
)`,
    `CREATE TABLE IF NOT EXISTS settings (
    parish_id  BIGINT NOT NULL REFERENCES parishes(id),
    key        TEXT NOT NULL,
    value      JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (parish_id, key)
)`,
    `DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'weeks' AND column_name = 'parish_id'
    ) THEN
        ALTER TABLE weeks ADD COLUMN parish_id BIGINT REFERENCES parishes(id);
        UPDATE weeks SET parish_id = (SELECT id FROM parishes WHERE slug = 'markovce');
        ALTER TABLE weeks ALTER COLUMN parish_id SET NOT NULL;
        ALTER TABLE weeks DROP CONSTRAINT weeks_pkey;
        ALTER TABLE weeks ADD PRIMARY KEY (parish_id, week_key);
    END IF;
END $$`,
    `DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'settings' AND column_name = 'parish_id'
    ) THEN
        ALTER TABLE settings ADD COLUMN parish_id BIGINT REFERENCES parishes(id);
        UPDATE settings SET parish_id = (SELECT id FROM parishes WHERE slug = 'markovce');
        ALTER TABLE settings ALTER COLUMN parish_id SET NOT NULL;
        ALTER TABLE settings DROP CONSTRAINT settings_pkey;
        ALTER TABLE settings ADD PRIMARY KEY (parish_id, key);
    END IF;
END $$`,
];

// Arbitrary constant; serialises concurrent cold starts running the migration.
const MIGRATION_LOCK_ID = 7_202_610;

// Runs the statements in one transaction under an advisory lock. `client`
// is anything with a pg-style query(text) method.
export async function applySchema(client) {
    await client.query('BEGIN');
    try {
        await client.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`);
        for (const stmt of SCHEMA_STATEMENTS) await client.query(stmt);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    }
}

let schemaReady = false;

// Called by every endpoint before touching the database. After the first
// successful check per warm instance it is free.
export async function ensureSchema() {
    if (schemaReady) return;
    // Fast path: already migrated (the last thing the migration adds). When
    // adding statements later, point this check at the newest change.
    const { rows } = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'settings' AND column_name = 'parish_id'
    `;
    if (!rows.length) {
        const client = await db.connect();
        try {
            await applySchema(client);
        } finally {
            client.release();
        }
    }
    schemaReady = true;
}
