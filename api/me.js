import { sql } from '@vercel/postgres';
import { sendError, sessionUserId } from '../lib/auth.js';
import { ensureSchema } from '../lib/schema.js';

// GET /api/me → { user, parishes: [{ slug, name, role }] }.
// Signed out (or a session for a deleted user) is not an error: { user: null, parishes: [] }.
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end();
    }
    try {
        const userId = sessionUserId(req);
        if (!userId) return res.status(200).json({ user: null, parishes: [] });
        await ensureSchema();
        const userQ = await sql`SELECT email, name, avatar_url FROM users WHERE id = ${userId}`;
        const u = userQ.rows[0];
        if (!u) return res.status(200).json({ user: null, parishes: [] });
        const parishQ = await sql`
            SELECT p.slug, p.name, m.role
            FROM parish_members m
            JOIN parishes p ON p.id = m.parish_id
            WHERE m.user_id = ${userId}
            ORDER BY p.name, p.slug
        `;
        return res.status(200).json({
            user: { email: u.email, name: u.name, avatarUrl: u.avatar_url },
            parishes: parishQ.rows.map(r => ({ slug: r.slug, name: r.name, role: r.role })),
        });
    } catch (e) {
        return sendError(res, e, 'me handler error');
    }
}
