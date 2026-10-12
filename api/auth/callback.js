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
        const userId = rows[0].id;
        // Slack-style auto-join: parishes with join_domain admit anyone whose
        // verified email is exactly @<that domain> (not a subdomain), as
        // join_role (editor or viewer; never admin). An existing membership
        // is left as it is, so this never changes anyone's role.
        const email = claims.email.toLowerCase();
        const domain = email.slice(email.lastIndexOf('@') + 1);
        await sql`
            INSERT INTO parish_members (parish_id, user_id, role)
            SELECT id, ${userId}, join_role FROM parishes WHERE join_domain = ${domain}
            ON CONFLICT (parish_id, user_id) DO NOTHING
        `;
        startSession(res, userId);
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
