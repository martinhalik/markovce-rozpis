// End-to-end tests of the API handlers against a real Postgres.
// Needs TEST_DATABASE_URL pointing at a scratch database (it is wiped), e.g.
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/rozpis_test npm test
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { makeSqlShim, makeReq, makeRes, cookiesFrom } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';

let pool, sync, calendar, me, login, callback, logout, signValue;
const claims = { sub: 'google-1', email: 'Owner@Example.com', email_verified: true, name: 'Owner', picture: 'https://p/1' };

before(async () => {
    if (skip) return;
    process.env.SESSION_SECRET = 's'.repeat(40);
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'csecret';
    pool = new pg.Pool({ connectionString: url });
    mock.module('@vercel/postgres', { namedExports: makeSqlShim(pool) });
    mock.module('arctic', {
        namedExports: {
            generateState: () => 'st4te',
            generateCodeVerifier: () => 'verif1er',
            decodeIdToken: () => ({ ...claims }),
            Google: class {
                constructor(id, secret, redirectURI) { this.redirectURI = redirectURI; }
                createAuthorizationURL(state) {
                    return new URL(`https://accounts.google.test/auth?state=${state}&redirect_uri=${encodeURIComponent(this.redirectURI)}`);
                }
                async validateAuthorizationCode(code, verifier) {
                    assert.equal(code, 'good-code');
                    assert.equal(verifier, 'verif1er');
                    return { idToken: () => 'id.token' };
                }
            },
        },
    });

    // Start from the original single-tenant schema with live data in it.
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await pool.query(`
        CREATE TABLE weeks (week_key TEXT PRIMARY KEY, payload JSONB NOT NULL, updated_at BIGINT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at BIGINT NOT NULL);
        INSERT INTO weeks VALUES ('2026-10-05', '{"events":{"sunday":["9:00 sv. Liturgia"]}}', 100);
        INSERT INTO settings VALUES ('calendarStyle', '"julian"', 50);
    `);

    ({ default: sync } = await import('../api/sync.js'));
    ({ default: calendar } = await import('../api/calendar.js'));
    ({ default: me } = await import('../api/me.js'));
    ({ default: login } = await import('../api/auth/login.js'));
    ({ default: callback } = await import('../api/auth/callback.js'));
    ({ default: logout } = await import('../api/auth/logout.js'));
    ({ signValue } = await import('../lib/auth.js'));
});

after(async () => { if (pool) await pool.end(); });

const call = async (handler, opts) => { const res = makeRes(); await handler(makeReq(opts), res); return res; };
const sessionFor = (uid) => ({ session: signValue({ uid: String(uid), exp: Date.now() + 60_000 }) });

async function addUser(sub, email) {
    const { rows } = await pool.query(
        'INSERT INTO users (google_sub, email) VALUES ($1, $2) RETURNING id', [sub, email]);
    return rows[0].id;
}
async function grant(slug, userId, role) {
    await pool.query(
        `INSERT INTO parish_members (parish_id, user_id, role) SELECT id, $2, $3 FROM parishes WHERE slug = $1`,
        [slug, userId, role]);
}

let owner, editor, viewer, stranger;

test('public calendar migrates the legacy schema and still serves Markovce at /kalendar.ics', { skip }, async () => {
    const res = await call(calendar, { query: {} });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /SUMMARY:sv\. Liturgia/);
    assert.match(res.body, /UID:2026-10-05-sunday-0@markovce-rozpis/);
    const { rows } = await pool.query('SELECT p.slug, w.week_key FROM weeks w JOIN parishes p ON p.id = w.parish_id');
    assert.deepEqual(rows, [{ slug: 'markovce', week_key: '2026-10-05' }]);
});

test('sign-in flow creates the user and a session', { skip }, async () => {
    const start = await call(login, { query: { returnTo: '/?x=1' } });
    assert.equal(start.statusCode, 302);
    assert.match(start.getHeader('Location'), /redirect_uri=https%3A%2F%2Frozpis\.test%2Fapi%2Fauth%2Fcallback/);
    const { oauth } = cookiesFrom(start);
    assert.ok(oauth);

    // Wrong state (CSRF) is refused and starts no session.
    const bad = await call(callback, { query: { code: 'good-code', state: 'other' }, cookies: { oauth } });
    assert.equal(bad.getHeader('Location'), '/?auth_error=state');
    assert.equal(cookiesFrom(bad).session, undefined);

    const done = await call(callback, { query: { code: 'good-code', state: 'st4te' }, cookies: { oauth } });
    assert.equal(done.statusCode, 302);
    assert.equal(done.getHeader('Location'), '/?x=1');
    const { session } = cookiesFrom(done);
    assert.ok(session);
    assert.equal(cookiesFrom(done).oauth, '');

    const { rows } = await pool.query('SELECT id, email FROM users WHERE google_sub = $1', ['google-1']);
    assert.equal(rows[0].email, 'owner@example.com');
    owner = rows[0].id;

    // Signed in, but not a member of anything yet.
    const who = await call(me, { cookies: { session } });
    assert.equal(who.body.user.email, 'owner@example.com');
    assert.deepEqual(who.body.parishes, []);
    const denied = await call(sync, { query: { parish: 'markovce' }, cookies: { session } });
    assert.equal(denied.statusCode, 403);
});

test('unverified Google email is refused', { skip }, async () => {
    const start = await call(login, { query: {} });
    claims.email_verified = false;
    try {
        const res = await call(callback, { query: { code: 'good-code', state: 'st4te' }, cookies: cookiesFrom(start) });
        assert.equal(res.getHeader('Location'), '/?auth_error=email');
        assert.equal(cookiesFrom(res).session, undefined);
    } finally {
        claims.email_verified = true;
    }
});

test('members see their parishes; roles gate reads and writes', { skip }, async () => {
    await pool.query(`INSERT INTO parishes (slug, name) VALUES ('presov', 'Prešov')`);
    await grant('markovce', owner, 'admin');
    await grant('presov', owner, 'viewer');
    editor = await addUser('google-2', 'editor@example.com');
    viewer = await addUser('google-3', 'viewer@example.com');
    stranger = await addUser('google-4', 'stranger@example.com');
    await grant('markovce', editor, 'editor');
    await grant('markovce', viewer, 'viewer');
    await grant('presov', stranger, 'editor');

    const who = await call(me, { cookies: sessionFor(owner) });
    assert.deepEqual(who.body.parishes, [
        { slug: 'markovce', name: 'Pravoslávni Markovce', role: 'admin' },
        { slug: 'presov', name: 'Prešov', role: 'viewer' },
    ]);

    const got = await call(sync, { query: { parish: 'markovce' }, cookies: sessionFor(viewer) });
    assert.equal(got.statusCode, 200);
    assert.equal(got.body.weeks.length, 1);
    assert.deepEqual(got.body.settings.calendarStyle, { value: 'julian', updated_at: 50 });

    const week = { weekKey: '2026-10-12', payload: { events: { monday: ['8:00 Utiereň'] } }, updated_at: 200 };
    const post = (uid, parish, body = week, headers) =>
        call(sync, { method: 'POST', query: { parish }, body, cookies: sessionFor(uid), headers });

    assert.equal((await post(viewer, 'markovce')).statusCode, 403);
    assert.equal((await post(editor, 'presov')).statusCode, 403);
    assert.equal((await post(editor, 'nonexistent')).statusCode, 403);
    assert.equal((await post(editor, 'Bad Slug!')).statusCode, 400);
    assert.equal((await post(editor, 'markovce', week, { origin: 'https://evil.test' })).statusCode, 403);
    assert.equal((await post(editor, 'markovce', week, { origin: 'https://rozpis.test' })).statusCode, 200);
    assert.equal((await post(owner, 'markovce', { settingsKey: 'calendarStyle', value: 'antiochian', updated_at: 60 })).statusCode, 200);

    // Same week key in another parish is a separate row.
    const other = { ...week, payload: { events: { monday: ['10:00 Moleben'] } } };
    assert.equal((await post(stranger, 'presov', other)).statusCode, 200);

    const mk = await call(sync, { query: { parish: 'markovce' }, cookies: sessionFor(editor) });
    assert.deepEqual(mk.body.weeks.map((w) => w.weekKey).sort(), ['2026-10-05', '2026-10-12']);
    assert.deepEqual(mk.body.weeks.find((w) => w.weekKey === '2026-10-12').payload, week.payload);
    assert.equal(mk.body.settings.calendarStyle.value, 'antiochian');

    const pr = await call(sync, { query: { parish: 'presov' }, cookies: sessionFor(stranger) });
    assert.deepEqual(pr.body.weeks.map((w) => w.payload), [other.payload]);
    assert.deepEqual(pr.body.settings, {});
    assert.equal((await call(sync, { query: { parish: 'markovce' }, cookies: sessionFor(stranger) })).statusCode, 403);

    // Older write loses (last-writer-wins by timestamp, per parish).
    await post(editor, 'markovce', { ...week, payload: { events: {} }, updated_at: 150 });
    const again = await call(sync, { query: { parish: 'markovce' }, cookies: sessionFor(editor) });
    assert.deepEqual(again.body.weeks.find((w) => w.weekKey === '2026-10-12').payload, week.payload);
});

test('missing, forged or revoked sessions get nothing', { skip }, async () => {
    assert.equal((await call(sync, { query: { parish: 'markovce' } })).statusCode, 401);
    const forged = { session: `${Buffer.from(JSON.stringify({ uid: String(owner), exp: Date.now() + 1e6 })).toString('base64url')}.AAAA` };
    assert.equal((await call(sync, { query: { parish: 'markovce' }, cookies: forged })).statusCode, 401);
    assert.deepEqual((await call(me, { cookies: forged })).body, { user: null, parishes: [] });

    // Removing the membership takes effect on the very next request.
    await pool.query('DELETE FROM parish_members WHERE user_id = $1', [viewer]);
    assert.equal((await call(sync, { query: { parish: 'markovce' }, cookies: sessionFor(viewer) })).statusCode, 403);

    const out = await call(logout, { method: 'POST', cookies: sessionFor(owner) });
    assert.equal(out.statusCode, 200);
    assert.equal(cookiesFrom(out).session, '');
});

test('per-parish public calendars', { skip }, async () => {
    const pr = await call(calendar, { query: { parish: 'presov' } });
    assert.equal(pr.statusCode, 200);
    assert.match(pr.body, /X-WR-CALNAME:Bohoslužby - Prešov/);
    assert.match(pr.body, /SUMMARY:Moleben/);
    assert.doesNotMatch(pr.body, /Utiereň|Liturgia/);
    assert.match(pr.body, /@presov\.markovce-rozpis/);

    const mk = await call(calendar, { query: { parish: 'markovce' } });
    assert.match(mk.body, /Utiereň/);
    assert.doesNotMatch(mk.body, /Moleben/);

    assert.equal((await call(calendar, { query: { parish: 'nope' } })).statusCode, 404);
    assert.equal((await call(calendar, { query: { parish: '../x' } })).statusCode, 404);
});

test('verified @krm.sk accounts join Markovce as editors; nothing else does', { skip }, async () => {
    const saved = { ...claims };
    const signIn = async (sub, email) => {
        Object.assign(claims, { sub, email });
        const start = await call(login, { query: {} });
        const done = await call(callback, { query: { code: 'good-code', state: 'st4te' }, cookies: cookiesFrom(start) });
        return { session: cookiesFrom(done).session };
    };
    const parishesOf = async (cookies) => (await call(me, { cookies })).body.parishes;
    try {
        const member = await signIn('krm-1', 'Someone@KRM.sk');
        assert.deepEqual(await parishesOf(member), [{ slug: 'markovce', name: 'Pravoslávni Markovce', role: 'editor' }]);
        const week = { weekKey: '2026-11-02', payload: { events: {} }, updated_at: 10 };
        const res = await call(sync, { method: 'POST', query: { parish: 'markovce' }, body: week, cookies: member });
        assert.equal(res.statusCode, 200);

        for (const [sub, email] of [
            ['krm-2', 'kid@student.krm.sk'],
            ['krm-3', 'someone@notkrm.sk'],
            ['krm-4', 'someone@krm.sk.evil.test'],
        ]) {
            assert.deepEqual(await parishesOf(await signIn(sub, email)), [], email);
        }

        // An existing role is never changed by signing in again.
        await pool.query(`UPDATE parish_members SET role = 'admin'
            WHERE user_id = (SELECT id FROM users WHERE google_sub = 'krm-1')`);
        assert.equal((await parishesOf(await signIn('krm-1', 'someone@krm.sk')))[0].role, 'admin');
    } finally {
        Object.assign(claims, saved);
    }
});
