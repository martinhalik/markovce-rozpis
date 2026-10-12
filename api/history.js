import { sql } from '@vercel/postgres';
import { requireMember, sendError } from '../lib/auth.js';

const WEEK_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REVISIONS = 50;

// GET /api/history?parish=<slug>&week=<YYYY-MM-DD> → saved versions of one
// week, newest first, each with who saved it and the full payload. Editors
// only: it shows who changed what, and it exists so they can restore one —
// a restore is an ordinary save from the app, so it lands in history too.
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end();
    }
    try {
        const { parish } = await requireMember(req, req.query.parish, 'editor');
        const week = req.query.week;
        if (typeof week !== 'string' || !WEEK_KEY_RE.test(week)) return res.status(400).json({ error: 'bad week' });
        const { rows } = await sql`
            SELECT r.id, r.payload, r.updated_at, r.saved_at, u.name, u.email
            FROM week_revisions r
            LEFT JOIN users u ON u.id = r.user_id
            WHERE r.parish_id = ${parish.id} AND r.week_key = ${week}
            ORDER BY r.id DESC
            LIMIT ${MAX_REVISIONS}
        `;
        return res.status(200).json({
            revisions: rows.map(r => ({
                id: String(r.id),
                savedAt: new Date(r.saved_at).getTime(),
                by: r.email ? { name: r.name, email: r.email } : null,
                payload: r.payload,
            })),
        });
    } catch (e) {
        return sendError(res, e, 'history handler error');
    }
}
