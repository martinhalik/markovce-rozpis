import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'x'.repeat(40);
const { signValue, verifyValue, safeReturnTo, readCookie, assertSameOrigin, HttpError } = await import('../lib/auth.js');

test('signed values round-trip and reject tampering / expiry', () => {
    const t = signValue({ uid: '7', exp: Date.now() + 60_000 });
    assert.equal(verifyValue(t).uid, '7');

    const [data, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: '1', exp: Date.now() + 60_000 })).toString('base64url');
    assert.equal(verifyValue(`${forged}.${sig}`), null);
    assert.equal(verifyValue(`${data}.${sig.slice(0, -2)}AA`), null);
    assert.equal(verifyValue(`${data}`), null);
    assert.equal(verifyValue(undefined), null);
    assert.equal(verifyValue(signValue({ uid: '7', exp: Date.now() - 1 })), null);
    assert.equal(verifyValue(signValue({ uid: '7' })), null);

    process.env.SESSION_SECRET = 'y'.repeat(40);
    assert.equal(verifyValue(t), null);
    process.env.SESSION_SECRET = 'x'.repeat(40);
});

test('safeReturnTo only allows same-site paths', () => {
    assert.equal(safeReturnTo('/'), '/');
    assert.equal(safeReturnTo('/?a=1'), '/?a=1');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil', '', undefined, ['/x']]) {
        assert.equal(safeReturnTo(bad), '/', String(bad));
    }
});

test('readCookie parses the Cookie header', () => {
    const req = { headers: { cookie: 'a=1; session=abc.def; b=%2Fx' } };
    assert.equal(readCookie(req, 'session'), 'abc.def');
    assert.equal(readCookie(req, 'b'), '/x');
    assert.equal(readCookie(req, 'missing'), null);
    assert.equal(readCookie({ headers: {} }, 'session'), null);
});

test('assertSameOrigin rejects foreign origins', () => {
    const req = (origin) => ({ headers: { host: 'rozpis.test', ...(origin ? { origin } : {}) } });
    assert.doesNotThrow(() => assertSameOrigin(req()));
    assert.doesNotThrow(() => assertSameOrigin(req('https://rozpis.test')));
    assert.throws(() => assertSameOrigin(req('https://evil.test')), HttpError);
    assert.throws(() => assertSameOrigin(req('null')), HttpError);
});
