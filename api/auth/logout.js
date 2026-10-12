import { assertSameOrigin, endSession, sendError } from '../../lib/auth.js';

// POST /api/auth/logout — drops the session cookie.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end();
    }
    try {
        assertSameOrigin(req);
        endSession(res);
        return res.status(200).json({ ok: true });
    } catch (e) {
        return sendError(res, e, 'auth logout error');
    }
}
