import crypto from 'node:crypto';
import { sql } from '@vercel/postgres';
import { Google } from 'arctic';
import { ensureSchema } from './schema.js';

// ── Errors ────────────────────────────────────────────────────────────────
export class HttpError extends Error {
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

export function sendError(res, e, label) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.code });
    console.error(label, e);
    return res.status(500).json({ error: 'server' });
}

// ── Cookies ───────────────────────────────────────────────────────────────
export function readCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i < 0) continue;
        if (part.slice(0, i).trim() === name) {
            try { return decodeURIComponent(part.slice(i + 1).trim()); } catch (_) { return null; }
        }
    }
    return null;
}

// Appends (rather than replaces) Set-Cookie so a handler can set several.
export function setCookie(res, name, value, { maxAge, path = '/' } = {}) {
    const parts = [
        `${name}=${encodeURIComponent(value)}`,
        `Path=${path}`,
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
    ];
    if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
    const prev = res.getHeader('Set-Cookie');
    const list = prev ? (Array.isArray(prev) ? prev : [String(prev)]) : [];
    res.setHeader('Set-Cookie', [...list, parts.join('; ')]);
}

export function clearCookie(res, name, path = '/') {
    setCookie(res, name, '', { maxAge: 0, path });
}

// ── Signed values ─────────────────────────────────────────────────────────
// `base64url(json).base64url(hmac)`, keyed by SESSION_SECRET. Used for the
// session cookie and the short-lived OAuth state cookie. Stateless: removing
// a member from parish_members still takes effect at once, because every
// request re-reads the membership.
function secret() {
    const s = process.env.SESSION_SECRET;
    if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ chars)');
    return s;
}

function mac(data) {
    return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

export function signValue(obj) {
    const data = Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${data}.${mac(data)}`;
}

export function verifyValue(token) {
    if (typeof token !== 'string') return null;
    const dot = token.indexOf('.');
    if (dot < 0) return null;
    const data = token.slice(0, dot);
    const given = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(mac(data));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    let obj;
    try { obj = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); } catch (_) { return null; }
    if (!obj || typeof obj !== 'object' || !(obj.exp > Date.now())) return null;
    return obj;
}

// ── Session ───────────────────────────────────────────────────────────────
const SESSION_COOKIE = 'session';
const SESSION_TTL_S = 60 * 60 * 24 * 60; // 60 days

export function startSession(res, userId) {
    const token = signValue({ uid: String(userId), exp: Date.now() + SESSION_TTL_S * 1000 });
    setCookie(res, SESSION_COOKIE, token, { maxAge: SESSION_TTL_S });
}

export function endSession(res) {
    clearCookie(res, SESSION_COOKIE);
}

export function sessionUserId(req) {
    const s = verifyValue(readCookie(req, SESSION_COOKIE));
    return s && /^\d+$/.test(s.uid) ? s.uid : null;
}

// ── Request guards ────────────────────────────────────────────────────────
// Mutating requests must come from our own pages. SameSite=Lax already keeps
// the session cookie off cross-site POSTs; this is the belt to those braces.
export function assertSameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return;
    let host;
    try { host = new URL(origin).host; } catch (_) { throw new HttpError(403, 'bad origin'); }
    if (host !== req.headers.host) throw new HttpError(403, 'bad origin');
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };

// The one permission check every parish-scoped endpoint goes through.
// Resolves the signed-in user's membership of `parishSlug` and requires at
// least `minRole`. Returns { userId, parish: { id, slug, name }, role }.
// Throws 401 (not signed in) or 403 (not a member / role too low / no such
// parish — deliberately indistinguishable, so slugs can't be probed).
export async function requireMember(req, parishSlug, minRole = 'viewer') {
    if (!ROLE_RANK[minRole]) throw new Error(`unknown role ${minRole}`);
    const userId = sessionUserId(req);
    if (!userId) throw new HttpError(401, 'unauthorized');
    if (typeof parishSlug !== 'string' || !SLUG_RE.test(parishSlug)) throw new HttpError(400, 'bad parish');
    await ensureSchema();
    const { rows } = await sql`
        SELECT p.id, p.slug, p.name, m.role
        FROM parish_members m
        JOIN parishes p ON p.id = m.parish_id
        WHERE m.user_id = ${userId} AND p.slug = ${parishSlug}
    `;
    const row = rows[0];
    if (!row || (ROLE_RANK[row.role] || 0) < ROLE_RANK[minRole]) throw new HttpError(403, 'forbidden');
    return { userId, parish: { id: row.id, slug: row.slug, name: row.name }, role: row.role };
}

// ── Google OAuth ──────────────────────────────────────────────────────────
// Short-lived signed cookie carrying PKCE verifier, CSRF state and return path
// from /api/auth/login to /api/auth/callback.
export const OAUTH_COOKIE = 'oauth';
export const OAUTH_COOKIE_PATH = '/api/auth';

// Redirect URI is <origin>/api/auth/callback. APP_ORIGIN pins the origin
// (production); without it the request's own host is used, so `vercel dev`
// and preview deployments work as long as their callback URL is registered
// in the Google Cloud console.
export function appOrigin(req) {
    if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/+$/, '');
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return `${proto}://${req.headers.host}`;
}

export function googleClient(req) {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set');
    return new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${appOrigin(req)}/api/auth/callback`);
}

// Only same-site paths, so the login flow can't be turned into an open redirect.
export function safeReturnTo(value) {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
        ? value
        : '/';
}
