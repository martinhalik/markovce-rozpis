import { sql } from '@vercel/postgres';

let schemaReady = false;

async function ensureSchema() {
    if (schemaReady) return;
    await sql`
        CREATE TABLE IF NOT EXISTS weeks (
            week_key TEXT PRIMARY KEY,
            payload JSONB NOT NULL,
            updated_at BIGINT NOT NULL
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            updated_at BIGINT NOT NULL
        )
    `;
    schemaReady = true;
}

export default async function handler(req, res) {
    if (!process.env.PARISH_KEY || req.headers['x-parish-key'] !== process.env.PARISH_KEY) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    try {
        await ensureSchema();

        if (req.method === 'GET') {
            const weeksQ = await sql`SELECT week_key, payload, updated_at FROM weeks`;
            const settingsQ = await sql`SELECT key, value, updated_at FROM settings`;
            return res.status(200).json({
                weeks: weeksQ.rows.map(r => ({
                    weekKey: r.week_key,
                    payload: r.payload,
                    updated_at: Number(r.updated_at),
                })),
                settings: Object.fromEntries(
                    settingsQ.rows.map(r => [r.key, { value: r.value, updated_at: Number(r.updated_at) }])
                ),
            });
        }

        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            if (body && body.weekKey) {
                const { weekKey, payload, updated_at } = body;
                if (!weekKey || !payload || typeof updated_at !== 'number') {
                    return res.status(400).json({ error: 'bad body' });
                }
                await sql`
                    INSERT INTO weeks (week_key, payload, updated_at)
                    VALUES (${weekKey}, ${JSON.stringify(payload)}::jsonb, ${updated_at})
                    ON CONFLICT (week_key) DO UPDATE
                    SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
                    WHERE EXCLUDED.updated_at > weeks.updated_at
                `;
                return res.status(200).json({ ok: true });
            }

            if (body && body.settingsKey) {
                const { settingsKey, value, updated_at } = body;
                if (!settingsKey || typeof updated_at !== 'number') {
                    return res.status(400).json({ error: 'bad body' });
                }
                await sql`
                    INSERT INTO settings (key, value, updated_at)
                    VALUES (${settingsKey}, ${JSON.stringify(value)}::jsonb, ${updated_at})
                    ON CONFLICT (key) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
                    WHERE EXCLUDED.updated_at > settings.updated_at
                `;
                return res.status(200).json({ ok: true });
            }

            return res.status(400).json({ error: 'bad body' });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).end();
    } catch (e) {
        console.error('sync handler error', e);
        return res.status(500).json({ error: 'server' });
    }
}
