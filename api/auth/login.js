import { generateCodeVerifier, generateState } from 'arctic';
import {
    OAUTH_COOKIE, OAUTH_COOKIE_PATH, googleClient, safeReturnTo, sendError, setCookie, signValue,
} from '../../lib/auth.js';

const OAUTH_TTL_S = 10 * 60;

// GET /api/auth/login?returnTo=/path → redirect to Google's consent screen.
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end();
    }
    try {
        const state = generateState();
        const codeVerifier = generateCodeVerifier();
        const url = googleClient(req).createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile']);
        url.searchParams.set('prompt', 'select_account');
        setCookie(res, OAUTH_COOKIE, signValue({
            state,
            codeVerifier,
            returnTo: safeReturnTo(req.query.returnTo),
            exp: Date.now() + OAUTH_TTL_S * 1000,
        }), { maxAge: OAUTH_TTL_S, path: OAUTH_COOKIE_PATH });
        res.setHeader('Location', url.toString());
        return res.status(302).end();
    } catch (e) {
        return sendError(res, e, 'auth login error');
    }
}
