// Test doubles: a minimal Vercel-style req/res pair, and a pg-backed stand-in
// for @vercel/postgres (whose real driver only talks to Neon over websockets).

export function makeSqlShim(pool) {
    const sql = (strings, ...values) => {
        const text = strings.slice(1).reduce((acc, s, i) => `${acc}$${i + 1}${s}`, strings[0]);
        return pool.query(text, values);
    };
    const db = { connect: () => pool.connect() };
    return { sql, db };
}

export function makeReq({ method = 'GET', query = {}, body, cookies = {}, headers = {} } = {}) {
    const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    return {
        method,
        query,
        body,
        headers: { host: 'rozpis.test', ...(cookie ? { cookie } : {}), ...headers },
    };
}

export function makeRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(obj) { this.body = obj; return this; },
        send(data) { this.body = data; return this; },
        end() { return this; },
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        getHeader(k) { return this.headers[k.toLowerCase()]; },
    };
    return res;
}

// Set-Cookie list → { name: value } (cleared cookies come back as '').
export function cookiesFrom(res) {
    const list = [].concat(res.getHeader('Set-Cookie') || []);
    return Object.fromEntries(list.map((c) => {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        return [pair.slice(0, i), decodeURIComponent(pair.slice(i + 1))];
    }));
}
