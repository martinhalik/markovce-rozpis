// Layout and accessible-name checks for issues #18, #19, and #20.
// Launches the static app in headless Chrome at the reported viewport widths.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';

const ROOT = new URL('..', import.meta.url);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

let server;
let baseUrl;
let chrome;
let ws;
let send;
let sessionId;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function startStaticServer() {
    return new Promise((resolve) => {
        const srv = createServer((req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            let pathname = decodeURIComponent(url.pathname);
            if (pathname === '/') pathname = '/index.html';
            const fileUrl = new URL('.' + pathname, ROOT);
            // Stay inside the project root.
            if (!fileUrl.pathname.startsWith(new URL('.', ROOT).pathname)) {
                res.writeHead(403);
                res.end('forbidden');
                return;
            }
            try {
                const body = readFileSync(fileUrl);
                const type = pathname.endsWith('.css') ? 'text/css'
                    : pathname.endsWith('.js') ? 'text/javascript'
                    : pathname.endsWith('.html') ? 'text/html'
                    : 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': type });
                res.end(body);
            } catch {
                res.writeHead(404);
                res.end('not found');
            }
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

before(async () => {
    server = await startStaticServer();
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}/`;

    chrome = spawn(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--remote-debugging-port=9333',
        'about:blank'
    ], { stdio: 'ignore' });

    let wsUrl;
    for (let i = 0; i < 50; i++) {
        try {
            const res = await fetch('http://127.0.0.1:9333/json/version');
            const info = await res.json();
            if (info.webSocketDebuggerUrl) {
                wsUrl = info.webSocketDebuggerUrl;
                break;
            }
        } catch {
            // Chrome is still starting.
        }
        await sleep(100);
    }
    if (!wsUrl) throw new Error('Chrome DevTools endpoint did not come up');

    ws = new WebSocket(wsUrl);
    await once(ws, 'open');

    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result);
        }
    });
    send = (method, params = {}, sid) => {
        const msgId = ++id;
        return new Promise((resolve, reject) => {
            pending.set(msgId, { resolve, reject });
            const payload = { id: msgId, method, params };
            if (sid) payload.sessionId = sid;
            ws.send(JSON.stringify(payload));
        });
    };

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Page.navigate', { url: baseUrl }, sessionId);
    await sleep(300);
    // Transitions would otherwise animate font-size across the 768px breakpoint
    // and make pixel assertions depend on timing.
    await send('Runtime.evaluate', {
        expression: `(() => {
            const s = document.createElement('style');
            s.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
            document.documentElement.appendChild(s);
        })()`,
        returnByValue: true
    }, sessionId);
});

after(async () => {
    try { chrome?.kill(); } catch { /* already gone */ }
    if (server) await new Promise((resolve) => server.close(resolve));
    try { ws?.close(); } catch { /* already closed */ }
});

async function setViewport(width, height = 900) {
    await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
    }, sessionId);
    // Device-metrics changes apply on the next frames. Wait so media-query
    // font sizes and layout are the ones we assert on.
    await send('Runtime.evaluate', {
        expression: `document.fonts.ready.then(() => new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        }))`,
        awaitPromise: true,
        returnByValue: true
    }, sessionId);
}

async function measure() {
    const expression = `(() => {
        const root = document.documentElement;
        const box = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                left: r.left, right: r.right, top: r.top,
                width: r.width, height: r.height,
                text: (el.textContent || '').trim()
            };
        };
        const nameOf = (el) => {
            if (!el) return '';
            const fromLabel = el.labels ? [...el.labels].map(l => l.textContent.trim()).filter(Boolean).join(' ') : '';
            return fromLabel || el.getAttribute('aria-label') || '';
        };
        const recs = [...document.querySelectorAll('.rec-btn')].map((btn) => {
            const label = btn.querySelector('.rec-btn-label');
            const b = btn.getBoundingClientRect();
            const l = label ? label.getBoundingClientRect() : b;
            return {
                text: label ? label.textContent.trim() : btn.textContent.trim(),
                button: { left: b.left, right: b.right, top: b.top, width: b.width, height: b.height },
                label: { left: l.left, right: l.right, width: l.width, height: l.height,
                    scrollWidth: label ? label.scrollWidth : 0, clientWidth: label ? label.clientWidth : 0 }
            };
        });
        return {
            clientWidth: root.clientWidth,
            scrollWidth: root.scrollWidth,
            dnes: box(document.querySelector('.today-link')),
            footerLink: box(document.querySelector('.site-footer a')),
            names: {
                recAddInput: nameOf(document.getElementById('recAddInput')),
                dayFeastName: nameOf(document.getElementById('dayFeastName'))
            },
            recFontSize: getComputedStyle(document.querySelector('.rec-btn')).fontSize,
            recs
        };
    })()`;
    const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true
    }, sessionId);
    if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
}

test('visible wording for the reported controls is unchanged', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, />Dnes</);
    assert.match(html, />azbyka\.ru</);
    assert.match(html, /Sviatok pre tento deň:/);
    assert.match(html, /placeholder="napr\. 18:00 Akatist"/);
    assert.match(html, /placeholder="napr\. Prep\. Xénia"/);
    assert.match(html, /Odporúčané služby/);
});

test('#18 inputs expose an accessible name', async () => {
    await setViewport(375);
    const m = await measure();
    assert.equal(m.names.recAddInput, 'Nová odporúčaná služba');
    assert.equal(m.names.dayFeastName, 'Sviatok pre tento deň:');
});

test('#20 no horizontal overflow at 375px and recommendation labels stay inside their buttons', async () => {
    await setViewport(375);
    const m = await measure();
    assert.equal(m.clientWidth, 375);
    assert.ok(m.scrollWidth <= m.clientWidth, `scrollWidth ${m.scrollWidth} > viewport ${m.clientWidth}`);
    // Existing 0.82rem phone size (16px root). The overflow fix does not shrink type.
    assert.equal(m.recFontSize, '13.12px');
    assert.ok(m.recs.length >= 2, 'expected the default recommendation buttons');

    const tops = new Set(m.recs.slice(0, 2).map((r) => Math.round(r.button.top)));
    assert.equal(tops.size, 1, 'the first two recommendations should stay on one row');

    for (const rec of m.recs) {
        assert.ok(rec.button.right <= m.clientWidth + 0.5, `${rec.text} button extends to ${rec.button.right}`);
        assert.ok(rec.button.left >= -0.5, `${rec.text} button starts at ${rec.button.left}`);
        assert.ok(rec.label.right <= rec.button.right + 0.5, `${rec.text} label spills past the button`);
        assert.ok(rec.label.left >= rec.button.left - 0.5, `${rec.text} label spills before the button`);
        assert.ok(rec.label.scrollWidth <= rec.label.clientWidth + 1, `${rec.text} label text is clipped`);
    }
});

test('#20 a long unbreakable recommendation still fits at 375px', async () => {
    await setViewport(375);
    const expression = `(() => {
        const label = document.querySelector('.rec-btn-label');
        label.textContent = 'SupercalifragilisticexpialidociousServiceName';
        const root = document.documentElement;
        const btn = label.closest('.rec-btn').getBoundingClientRect();
        const lab = label.getBoundingClientRect();
        return {
            scrollWidth: root.scrollWidth,
            clientWidth: root.clientWidth,
            labelRight: lab.right,
            buttonRight: btn.right,
            labelScroll: label.scrollWidth,
            labelClient: label.clientWidth
        };
    })()`;
    const result = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    const m = result.result.value;
    assert.ok(m.scrollWidth <= m.clientWidth, `scrollWidth ${m.scrollWidth}`);
    assert.ok(m.labelRight <= m.buttonRight + 0.5);
    assert.ok(m.labelScroll <= m.labelClient + 1);
});

test('#19 Dnes is a 44px hit target and keeps its focus ring at 375px', async () => {
    await setViewport(375);
    const expression = `(() => {
        const el = document.querySelector('.today-link');
        el.focus();
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
            text: el.textContent.trim(),
            width: r.width,
            height: r.height,
            display: cs.display,
            outlineWidth: cs.outlineWidth,
            outlineStyle: cs.outlineStyle,
            outlineColor: cs.outlineColor
        };
    })()`;
    const result = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    const box = result.result.value;
    assert.equal(box.text, 'Dnes');
    // A flex item blockifies inline-flex to flex; the hit box is what matters.
    assert.ok(box.width >= 44, `Dnes width ${box.width}`);
    assert.ok(box.height >= 44, `Dnes height ${box.height}`);
    assert.notEqual(box.outlineStyle, 'none');
    assert.ok(parseFloat(box.outlineWidth) >= 2, `outline ${box.outlineWidth}`);
});

test('footer azbyka.ru stays inline in the sentence at 375px', async () => {
    await setViewport(375);
    const expression = `(() => {
        const a = document.querySelector('.site-footer a');
        const cs = getComputedStyle(a);
        const next = a.nextSibling && a.nextSibling.textContent;
        return {
            text: a.textContent.trim(),
            display: cs.display,
            paddingTop: cs.paddingTop,
            paddingRight: cs.paddingRight,
            paddingBottom: cs.paddingBottom,
            paddingLeft: cs.paddingLeft,
            next: next
        };
    })()`;
    const result = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    const link = result.result.value;
    assert.equal(link.text, 'azbyka.ru');
    assert.equal(link.display, 'inline');
    assert.equal(link.paddingTop, '0px');
    assert.equal(link.paddingRight, '0px');
    assert.equal(link.paddingBottom, '0px');
    assert.equal(link.paddingLeft, '0px');
    assert.match(link.next, /^\./, `expected the period to follow the link, got ${JSON.stringify(link.next)}`);
});

test('#23 the sync pill does not cover day buttons at 375px', async () => {
    await setViewport(375, 800);
    const covered = await dayButtonsCoveredBySyncPill();
    assert.equal(covered.status, 'nokey');
    assert.equal(covered.text, '⚠ Bez synchronizácie – zadať kľúč');
    assert.ok(covered.pill.width >= 24, `pill width ${covered.pill.width}`);
    assert.ok(covered.pill.height >= 24, `pill height ${covered.pill.height}`);
    assert.ok(covered.scrollWidth <= covered.clientWidth, `scrollWidth ${covered.scrollWidth}`);
    for (const day of covered.days) {
        assert.equal(day.covered, false, `${day.day} is covered by ${day.hit}`);
    }
});

test('sync pill stays clear of day buttons at 320px and 1280px', async () => {
    for (const width of [320, 1280]) {
        await setViewport(width, 800);
        const covered = await dayButtonsCoveredBySyncPill();
        assert.ok(covered.scrollWidth <= covered.clientWidth, `${width} scrollWidth ${covered.scrollWidth}`);
        assert.ok(covered.pill.height >= 24, `${width} pill height ${covered.pill.height}`);
        for (const day of covered.days) {
            assert.equal(day.covered, false, `${width} ${day.day} is covered by ${day.hit}`);
        }
    }
});

async function dayButtonsCoveredBySyncPill() {
    const expression = `(() => {
        const pill = document.getElementById('syncStatus');
        const days = [...document.querySelectorAll('.day-btn')].map((btn) => {
            btn.scrollIntoView({ block: 'center', inline: 'nearest' });
            const r = btn.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            const covered = !!hit && (hit === pill || pill.contains(hit) || hit.id === 'syncStatus');
            return { day: btn.dataset.day, covered, hit: hit ? (hit.id || hit.className || hit.tagName) : null };
        });
        const pr = pill.getBoundingClientRect();
        return {
            status: pill.dataset.status,
            text: pill.textContent.trim(),
            pill: { width: pr.width, height: pr.height },
            days,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
        };
    })()`;
    const result = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
}

test('1280px layout does not gain a horizontal scrollbar', async () => {
    await setViewport(1280);
    const m = await measure();
    assert.equal(m.clientWidth, 1280);
    assert.ok(m.scrollWidth <= m.clientWidth, `scrollWidth ${m.scrollWidth}`);
    assert.ok(m.recs.length >= 2);
    const tops = new Set(m.recs.slice(0, 2).map((r) => Math.round(r.button.top)));
    assert.equal(tops.size, 1, 'recommendations stay in two columns on desktop');
    for (const rec of m.recs) {
        assert.ok(rec.button.right <= m.clientWidth + 0.5, `${rec.text} button extends to ${rec.button.right}`);
        assert.ok(rec.label.scrollWidth <= rec.label.clientWidth + 1, `${rec.text} label text is clipped`);
    }
});
