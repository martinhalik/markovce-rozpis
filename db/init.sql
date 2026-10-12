-- Schema for markovce-rozpis: users, parishes, memberships, per-parish weeks/settings.
--
-- Idempotent: creates a fresh database, or migrates the original single-tenant
-- weeks/settings tables in place (adds parish_id, backfills the Markovce
-- parish, widens the primary keys). The API applies the same statements
-- automatically on first request (lib/schema.js); keep the two identical.
--
-- Apply by hand with:  psql "$POSTGRES_URL" -f db/init.sql

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    google_sub TEXT UNIQUE NOT NULL,
    email      TEXT NOT NULL,
    name       TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parishes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    join_domain TEXT,
    join_role   TEXT NOT NULL DEFAULT 'viewer' CHECK (join_role IN ('editor', 'viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parish_members (
    parish_id  BIGINT NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parish_id, user_id)
);

CREATE INDEX IF NOT EXISTS parish_members_user_id_idx ON parish_members (user_id);

INSERT INTO parishes (slug, name, join_domain, join_role)
    VALUES ('markovce', 'Pravoslávni Markovce', 'krm.sk', 'editor')
    ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS weeks (
    parish_id  BIGINT NOT NULL REFERENCES parishes(id),
    week_key   TEXT NOT NULL,
    payload    JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (parish_id, week_key)
);

CREATE TABLE IF NOT EXISTS settings (
    parish_id  BIGINT NOT NULL REFERENCES parishes(id),
    key        TEXT NOT NULL,
    value      JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (parish_id, key)
);

DO $$ BEGIN
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
END $$;

DO $$ BEGIN
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
END $$;

CREATE TABLE IF NOT EXISTS week_revisions (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parish_id  BIGINT NOT NULL REFERENCES parishes(id) ON DELETE CASCADE,
    week_key   TEXT NOT NULL,
    payload    JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS week_revisions_week_idx ON week_revisions (parish_id, week_key, id DESC);

INSERT INTO week_revisions (parish_id, week_key, payload, updated_at)
SELECT w.parish_id, w.week_key, w.payload, w.updated_at FROM weeks w
WHERE NOT EXISTS (
    SELECT 1 FROM week_revisions r WHERE r.parish_id = w.parish_id AND r.week_key = w.week_key
);

COMMIT;

-- After the owner signs in once with Google (which creates their users row),
-- make them admin of the Markovce parish:
--
--   INSERT INTO parish_members (parish_id, user_id, role)
--   SELECT p.id, u.id, 'admin' FROM parishes p, users u
--   WHERE p.slug = 'markovce' AND u.email = 'martin@mh1.cz'
--   ON CONFLICT (parish_id, user_id) DO UPDATE SET role = EXCLUDED.role;
