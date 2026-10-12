// Local stand-in for the Vercel deployment, for the e2e walkthrough: serves
// the static site, applies vercel.json rewrites, and runs the real api/
// handlers with Vercel's req/res helpers. Start with
//   node --import ./e2e/register.mjs e2e/server.mjs
// env: PORT, E2E_SERVER_DATABASE_URL, plus the app's own (SESSION_SECRET, ...).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const REWRITES = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites || [];
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

// vercel.json rewrites: ":name" path segments become query parameters.
function rewrite(url) {
    for (const r of REWRITES) {
        const names = [];
        const pattern = r.source.replace(/\./g, '\\.').replace(/:([a-z]+)/gi, (_, n) => { names.push(n); return '([^/]+)'; });
        const m = url.pathname.match(new RegExp(`^${pattern}$`));
        if (!m) continue;
        let dest = r.destination;
        names.forEach((n, i) => { dest = dest.replace(`:${n}`, encodeURIComponent(m[i + 1])); });
        return new URL(dest, url);
    }
    return url;
}

// The pretend Google account chooser (see shims/google.mjs).
function fakeGoogle(url, res) {
    const state = String(url.searchParams.get('state') || '').replace(/[^a-z0-9]/gi, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta name="viewport" content="width=device-width">
<title>Sign in (e2e)</title>
<body style="font:16px system-ui;max-width:420px;margin:60px auto;padding:0 16px">
<h1 style="font-size:22px">Sign in with Google <small style="color:#888">(e2e stand-in)</small></h1>
<form action="/api/auth/callback">
<input type="hidden" name="state" value="${state}">
<label>Email <input id="email" name="code" type="email" required style="width:100%;padding:8px"></label>
<p><button id="continue" style="padding:8px 16px">Continue</button></p>
</form></body>`);
}

async function runApi(file, url, req, res) {
    const handler = (await import(pathToFileURL(path.join(ROOT, file)).href)).default;
    let body = '';
    for await (const chunk of req) body += chunk;
    req.query = Object.fromEntries(url.searchParams);
    req.body = body && /json/.test(req.headers['content-type'] || '') ? JSON.parse(body) : body || undefined;
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
    res.send = (data) => { res.end(data); return res; };
    await handler(req, res);
}

http.createServer(async (req, res) => {
    try {
        const url = rewrite(new URL(req.url, `http://${req.headers.host}`));
        if (url.pathname === '/__e2e/google') return fakeGoogle(url, res);
        const apiFile = url.pathname.startsWith('/api/') && `${url.pathname}.js`;
        if (apiFile && fs.existsSync(path.join(ROOT, apiFile))) return await runApi(apiFile, url, req, res);

        const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.statusCode = 404;
            return res.end('not found');
        }
        res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
    } catch (e) {
        console.error(e);
        res.statusCode = 500;
        res.end('e2e server error');
    }
}).listen(PORT, () => console.log(`e2e server on http://localhost:${PORT}`));
