import { decodeIdToken } from 'arctic';
import { sql } from '@vercel/postgres';
import {
    OAUTH_COOKIE, OAUTH_COOKIE_PATH, clearCookie, googleClient, readCookie, safeReturnTo, startSession, verifyValue,
} from '../../lib/auth.js';
import { ensureSchema } from '../../lib/schema.js';

// GET /api/auth/callback?code=…&state=… — Google redirects here after consent.
// Exchanges the code, upserts the user by Google's stable `sub`, starts a
// session and sends the browser back to where it started. Failures land on
// /?auth_error=<reason>, which the app shows to the user.
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end();
    }
    clearCookie(res, OAUTH_COOKIE, OAUTH_COOKIE_PATH);
    try {
        const saved = verifyValue(readCookie(req, OAUTH_COOKIE));
        const { code, state, error } = req.query;
        // User pressed "Cancel" on Google's screen.
        if (error) return redirect(res, saved ? saved.returnTo : '/');
        if (!saved || typeof code !== 'string' || typeof state !== 'string' || state !== saved.state) {
            return redirect(res, '/?auth_error=state');
        }

        const tokens = await googleClient(req).validateAuthorizationCode(code, saved.codeVerifier);
        // The ID token comes straight from Google's token endpoint over TLS,
        // so its claims can be read without re-verifying the signature
        // (OpenID Connect Core §3.1.3.7).
        const claims = decodeIdToken(tokens.idToken());
        if (!claims.sub || !claims.email || claims.email_verified !== true) {
            return redirect(res, '/?auth_error=email');
        }

        await ensureSchema();
        const { rows } = await sql`
            INSERT INTO users (google_sub, email, name, avatar_url)
            VALUES (${claims.sub}, ${claims.email.toLowerCase()}, ${claims.name || null}, ${claims.picture || null})
            ON CONFLICT (google_sub) DO UPDATE
            SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
            RETURNING id
        `;
        startSession(res, rows[0].id);
        return redirect(res, saved.returnTo);
    } catch (e) {
        console.error('auth callback error', e);
        return redirect(res, '/?auth_error=server');
    }
}

function redirect(res, to) {
    res.setHeader('Location', safeReturnTo(to));
    return res.status(302).end();
}
