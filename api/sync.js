import { sql } from '@vercel/postgres';
import { assertSameOrigin, requireMember, sendError } from '../lib/auth.js';

const WEEK_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SETTINGS_KEYS = new Set(['calendarStyle']);
const REVISION_MERGE_WINDOW = '5 minutes';

// GET  /api/sync?parish=<slug> → all weeks + settings of that parish (viewer+).
// POST /api/sync?parish=<slug> → upsert one week or one setting (editor+).
// Every query is scoped by the parish id that requireMember resolved.
export default async function handler(req, res) {
    try {
        if (req.method === 'GET') {
            const { parish } = await requireMember(req, req.query.parish, 'viewer');
            const weeksQ = await sql`SELECT week_key, payload, updated_at FROM weeks WHERE parish_id = ${parish.id}`;
            const settingsQ = await sql`SELECT key, value, updated_at FROM settings WHERE parish_id = ${parish.id}`;
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
            assertSameOrigin(req);
            const { parish, userId } = await requireMember(req, req.query.parish, 'editor');
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            if (body && body.weekKey) {
                const { weekKey, payload, updated_at } = body;
                if (
                    typeof weekKey !== 'string' || !WEEK_KEY_RE.test(weekKey) ||
                    !payload || typeof payload !== 'object' ||
                    !Number.isFinite(updated_at) || updated_at <= 0
                ) {
                    return res.status(400).json({ error: 'bad body' });
                }
                // One statement: save the week and, if the save won and
                // changed what the week says, record it in the version
                // history. (The payload carries its own updatedAt, so that is
                // left out of the comparison.) Saves by the same person within
                // REVISION_MERGE_WINDOW of their previous one update that
                // version instead of adding another, so history reads as one
                // entry per editing session — and the version before the
                // session (someone else's, or older) always stays intact.
                await sql`
                    WITH saved AS (
                        INSERT INTO weeks (parish_id, week_key, payload, updated_at)
                        VALUES (${parish.id}, ${weekKey}, ${JSON.stringify(payload)}::jsonb, ${updated_at})
                        ON CONFLICT (parish_id, week_key) DO UPDATE
                        SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
                        WHERE EXCLUDED.updated_at > weeks.updated_at
                        RETURNING parish_id, week_key, payload, updated_at
                    ), latest AS (
                        SELECT id, user_id, saved_at, payload FROM week_revisions
                        WHERE parish_id = ${parish.id} AND week_key = ${weekKey}
                        ORDER BY id DESC LIMIT 1
                    ), changed AS (
                        SELECT saved.* FROM saved
                        WHERE NOT EXISTS (
                            SELECT 1 FROM latest
                            WHERE (latest.payload - 'updatedAt') = (saved.payload - 'updatedAt')
                        )
                    ), merged AS (
                        UPDATE week_revisions r
                        SET payload = changed.payload, updated_at = changed.updated_at, saved_at = NOW()
                        FROM changed, latest
                        WHERE r.id = latest.id AND latest.user_id = ${userId}
                          AND latest.saved_at > NOW() - ${REVISION_MERGE_WINDOW}::interval
                        RETURNING r.id
                    )
                    INSERT INTO week_revisions (parish_id, week_key, payload, updated_at, user_id)
                    SELECT parish_id, week_key, payload, updated_at, ${userId} FROM changed
                    WHERE NOT EXISTS (SELECT 1 FROM merged)
                `;
                return res.status(200).json({ ok: true });
            }

            if (body && body.settingsKey) {
                const { settingsKey, value, updated_at } = body;
                if (
                    typeof settingsKey !== 'string' || !ALLOWED_SETTINGS_KEYS.has(settingsKey) ||
                    !Number.isFinite(updated_at) || updated_at <= 0
                ) {
                    return res.status(400).json({ error: 'bad body' });
                }
                await sql`
                    INSERT INTO settings (parish_id, key, value, updated_at)
                    VALUES (${parish.id}, ${settingsKey}, ${JSON.stringify(value)}::jsonb, ${updated_at})
                    ON CONFLICT (parish_id, key) DO UPDATE
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
        return sendError(res, e, 'sync handler error');
    }
}
