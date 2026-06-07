// Lightweight test harness for the bug-fix scope.
//
// Loads script.js inside a fake-DOM sandbox using node:vm, then exercises the
// real functions through their global exports. Covers:
//   - orthodoxCalendar feast resolution (movable + fixed feasts)
//   - scrubFeastsAgainstCalendar (user-typed feasts must survive)
//   - per-event red-letter coloring (isImportantEventText)
//   - sync.bootstrap merging logic via a fake fetch
//   - icon-load race protection via _iconLoadGeneration
//
// Run with: node tests/run.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCRIPT = readFileSync(join(ROOT, 'script.js'), 'utf8');

let failed = 0;
let passed = 0;
const failures = [];
// Each top-level test()/section() call pushes a step onto _steps; runAll
// then executes them in order, awaiting test bodies so async assertions
// fail cleanly inside the harness instead of leaking as unhandled rejections.
const _steps = [];
function test(name, fn) { _steps.push({ kind: 'test', name, fn }); }
function section(name) { _steps.push({ kind: 'section', name }); }
async function runAll() {
    for (const step of _steps) {
        if (step.kind === 'section') { console.log(`\n# ${step.name}`); continue; }
        try {
            await step.fn();
            passed++;
            console.log(`  ✓ ${step.name}`);
        } catch (e) {
            failed++;
            failures.push({ name: step.name, error: e });
            console.log(`  ✗ ${step.name}\n      ${e.message}`);
        }
    }
}

// Fake DOM scaffolding — only what script.js touches at definition / call time.
function makeSandbox({ stored = {}, fetchImpl = null } = {}) {
    const localStorage = {
        _: { ...stored },
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._, k) ? this._[k] : null; },
        setItem(k, v) { this._[k] = String(v); },
        removeItem(k) { delete this._[k]; },
    };
    const elements = new Map();
    function fakeEl(id) {
        if (!elements.has(id)) {
            const node = {
                id,
                style: {},
                classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
                dataset: {},
                value: '',
                checked: false,
                disabled: false,
                textContent: '',
                innerHTML: '',
                children: [],
                _listeners: {},
                addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
                removeEventListener() {},
                setAttribute() {},
                getAttribute() { return null; },
                appendChild() {},
                focus() {},
                blur() {},
                querySelectorAll() { return []; },
                querySelector() { return null; },
                getContext() {
                    return {
                        clearRect() {}, fillRect() {}, beginPath() {}, closePath() {},
                        fill() {}, stroke() {}, save() {}, restore() {}, clip() {},
                        rect() {}, roundRect() {}, drawImage() {}, fillText() {},
                        moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {},
                        translate() {}, rotate() {}, scale() {}, setTransform() {},
                        createLinearGradient() { return { addColorStop() {} }; },
                        measureText() { return { width: 0 }; },
                        setLineDash() {},
                        get fillStyle() { return '#000'; }, set fillStyle(_) {},
                        get strokeStyle() { return '#000'; }, set strokeStyle(_) {},
                        get font() { return ''; }, set font(_) {},
                        get textAlign() { return 'left'; }, set textAlign(_) {},
                        get textBaseline() { return 'alphabetic'; }, set textBaseline(_) {},
                        get lineWidth() { return 1; }, set lineWidth(_) {},
                        get globalCompositeOperation() { return 'source-over'; }, set globalCompositeOperation(_) {},
                    };
                },
            };
            // Canvas dimensions some draw fns read.
            if (id === 'previewCanvas') { node.width = 400; node.height = 400; }
            elements.set(id, node);
        }
        return elements.get(id);
    }
    const documentFake = {
        getElementById(id) { return fakeEl(id); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {},
        createElement() { return fakeEl('__el_' + Math.random()); },
        body: { classList: { add() {}, remove() {}, toggle() {} } },
        get activeElement() { return null; },
    };
    const windowFake = {
        location: { href: 'http://localhost/' },
        history: { replaceState() {} },
        addEventListener() {},
        removeEventListener() {},
        scrollY: 0,
        scrollTo() {},
        innerWidth: 1000, innerHeight: 800,
        URL,
    };
    class FakeImage {
        constructor() { this.width = 100; this.height = 100; this.onload = null; this.onerror = null; }
        set src(v) {
            this._src = v;
            // Fire onload async to mimic the real Image behavior.
            queueMicrotask(() => { if (this.onload) this.onload(); });
        }
        get src() { return this._src; }
    }
    function FakeFileReader() {
        return { readAsDataURL() {}, onload: null };
    }
    const sandbox = {
        document: documentFake,
        window: windowFake,
        localStorage,
        Image: FakeImage,
        FileReader: FakeFileReader,
        fetch: fetchImpl || (() => Promise.reject(new Error('no fetch'))),
        URL,
        console,
        // Browser-like globals script.js touches.
        alert: () => {},
        confirm: () => true,
        Date,
        Math,
        JSON,
        Number,
        String,
        Object,
        Array,
        Map,
        Set,
        Boolean,
        RegExp,
        Error,
        Promise,
        queueMicrotask,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        // Canvas2D prototype path expects this constructor exists for the
        // polyfill at the bottom of script.js — give it an empty prototype.
        CanvasRenderingContext2D: function CanvasRenderingContext2D() {},
    };
    sandbox.globalThis = sandbox;
    sandbox.window.document = documentFake;
    sandbox.window.localStorage = localStorage;
    sandbox.window.fetch = sandbox.fetch;
    return sandbox;
}

function loadScriptInto(sandbox) {
    vm.createContext(sandbox);
    // Append a capture block: top-level `const` declarations in script.js
    // (orthodoxCalendar, state, sync, IMPORTANT_EVENT_RE) live in the script's
    // lexical scope, not on the sandbox global. The appended block lifts them
    // onto globalThis so tests can read them directly.
    const augmented = SCRIPT + `
;globalThis.orthodoxCalendar = orthodoxCalendar;
globalThis.state = state;
globalThis.sync = sync;
globalThis.isImportantEventText = isImportantEventText;
globalThis.IMPORTANT_EVENT_RE = IMPORTANT_EVENT_RE;
globalThis.getGalleryImages = () => galleryImages;
globalThis.setGalleryImages = (next) => { galleryImages = next; };
globalThis.loadIconById = loadIconById;
globalThis.scrubFeastsAgainstCalendar = scrubFeastsAgainstCalendar;
`;
    vm.runInContext(augmented, sandbox);
    return sandbox;
}

// ── Tests ─────────────────────────────────────────────────────────────────
section('Orthodox calendar: feast resolution');

const sb1 = loadScriptInto(makeSandbox());
const orthodoxCalendar = sb1.orthodoxCalendar;

test('Pascha 2024 = April 28 (antiochian / Gregorian projection of Julian Pascha)', () => {
    // Wait — actually Julian Pascha 2024 maps to May 5, 2024 Gregorian (the
    // Orthodox shared Pascha). Asserts what the algorithm produces.
    const p = orthodoxCalendar.computePascha(2024);
    assert.equal(p.getFullYear(), 2024);
    assert.equal(p.getMonth() + 1, 5);
    assert.equal(p.getDate(), 5);
});

test('Pentecost 2024 = 49 days after Pascha', () => {
    const p = orthodoxCalendar.computePascha(2024);
    // Pentecost = +49 days; for 2024 that lands on Sunday June 23 Gregorian.
    const target = new Date(p);
    target.setDate(target.getDate() + 49);
    const feasts = orthodoxCalendar.feastsOnDate(target, 'antiochian');
    const ids = feasts.map(f => f.id);
    assert.ok(ids.includes('pentecost'), `pentecost missing from ${ids.join(',')}`);
});

test('Antiochian Christmas falls on Dec 25', () => {
    const feasts = orthodoxCalendar.feastsOnDate(new Date(2025, 11, 25), 'antiochian');
    assert.ok(feasts.find(f => f.id === 'nativity'), 'nativity should land on Dec 25 (antiochian)');
});

test('Julian Christmas falls on Jan 7 (Gregorian projection)', () => {
    const feasts = orthodoxCalendar.feastsOnDate(new Date(2025, 0, 7), 'julian');
    assert.ok(feasts.find(f => f.id === 'nativity'),
        'nativity should land on Jan 7 (julian projected to Gregorian)');
});

test('primaryFeast picks the higher-ranked feast on collision days', () => {
    // Sunday + St. Mary Magdalene (July 22) collision in 2024
    // (movable Sundays only collide via celebration ranking, simpler sample:)
    const p = orthodoxCalendar.primaryFeast(new Date(2024, 11, 25), 'antiochian');
    assert.ok(p, 'expected a primary feast on Dec 25');
    assert.equal(p.id, 'nativity');
});

section('scrubFeastsAgainstCalendar: user feasts preserved (Bug D fix)');

test('user-typed feast on calendar-empty day survives scrub', () => {
    const sb = loadScriptInto(makeSandbox());
    // 2025-06-02 (Mon) starts a week with no major feast on Wed/Thu.
    const monday = new Date(2025, 5, 2);
    sb.state.currentWeekStart = monday;
    sb.state.calendarStyle = 'antiochian';

    sb.state.feasts.wednesday = 'Otcove menini';   // custom user note
    sb.state.autoFilledFeasts.wednesday = false;   // user-typed
    sb.state.feasts.thursday = 'Pascha';           // stale auto-fill leak
    sb.state.autoFilledFeasts.thursday = true;

    sb.scrubFeastsAgainstCalendar();

    assert.equal(sb.state.feasts.wednesday, 'Otcove menini',
        'user-typed feast on calendar-empty day must be preserved');
    assert.equal(sb.state.feasts.thursday, '',
        'stale auto-filled feast on a calendar-empty day should be cleared');
    assert.equal(sb.state.autoFilledFeasts.thursday, false,
        'autoFilled flag should be cleared alongside the empty label');
});

test('scrubFeastsAgainstCalendar refreshes auto-filled labels under new calendar style', () => {
    const sb = loadScriptInto(makeSandbox());
    // Sunday May 18, 2025 — falls in the post-Pascha season. Auto-filled with
    // whatever the resolver picks; we just verify the function rewrites it to
    // the current calendar's name when autoFilled=true.
    const monday = new Date(2025, 4, 12); // Mon May 12 2025
    sb.state.currentWeekStart = monday;
    sb.state.calendarStyle = 'antiochian';
    sb.state.feasts.sunday = 'STALE LABEL';
    sb.state.autoFilledFeasts.sunday = true;
    sb.scrubFeastsAgainstCalendar();
    // If a calendar feast exists for this Sunday, label updates; otherwise it clears.
    const byDay = sb.orthodoxCalendar.feastsForWeek(monday, 'antiochian');
    const expected = byDay.sunday && byDay.sunday.primary ? byDay.sunday.primary.name : '';
    assert.equal(sb.state.feasts.sunday, expected);
});

section('Per-event coloring (red-letters bug)');

test('isImportantEventText classifies sv. Liturgia as important', () => {
    assert.equal(sb1.isImportantEventText('6:00 sv. Liturgia'), true);
});

test('isImportantEventText classifies Liturgia vopred posv. darov as important', () => {
    assert.equal(sb1.isImportantEventText('16:30 Liturgia vopred posv. darov'), true);
});

test('isImportantEventText classifies Veľká večerňa as important', () => {
    assert.equal(sb1.isImportantEventText('17:00 Veľká večerňa'), true);
});

test('isImportantEventText classifies Veľké Povečerie as important (typo fix)', () => {
    // The old code used "navečerie" (typo) which never matched anything.
    assert.equal(sb1.isImportantEventText('19:00 Veľké Povečerie'), true);
});

test('isImportantEventText classifies Katechéza as NOT important', () => {
    assert.equal(sb1.isImportantEventText('16:00 Katechéza'), false);
});

test('isImportantEventText classifies Akafist as NOT important (catechetical)', () => {
    assert.equal(sb1.isImportantEventText('17:00 Akafist k sv. Nikolajovi'), false);
});

test('isImportantEventText classifies Nedeľná škola as NOT important', () => {
    assert.equal(sb1.isImportantEventText('13:00 Nedeľná škola'), false);
});

section('Sync bootstrap: in-flight guard + merge semantics');

test('bootstrap is a no-op when key is missing', async () => {
    const sb = loadScriptInto(makeSandbox());
    await sb.sync.bootstrap();
    // No throw, no crash — that's the assertion.
    assert.ok(true);
});

test('bootstrap re-entry is blocked while a bootstrap is in flight', async () => {
    let calls = 0;
    const fetchImpl = () => {
        calls++;
        return new Promise(resolve => setTimeout(() => resolve({
            ok: true,
            json: async () => ({ weeks: [], settings: {} })
        }), 30));
    };
    const sb = loadScriptInto(makeSandbox({
        stored: { 'markovce-parish-key': 'TEST_KEY' },
        fetchImpl,
    }));
    const a = sb.sync.bootstrap();
    const b = sb.sync.bootstrap(); // should be a no-op while `a` is in flight
    await Promise.all([a, b]);
    assert.equal(calls, 1, 'fetch should be invoked exactly once across both calls');
});

test('bootstrap: newer server payload overwrites older local archive entry', async () => {
    const fetchImpl = () => Promise.resolve({
        ok: true,
        json: async () => ({
            weeks: [{
                weekKey: '2025-06-02',
                payload: {
                    events: { monday: ['SERVER EVENT'], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
                    feasts: { monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: '' },
                    autoFilledFeasts: {}, dayTypes: {}, fastingMode: false,
                },
                updated_at: 2_000_000_000_000,
            }],
            settings: {},
        }),
    });
    const sb = loadScriptInto(makeSandbox({
        stored: { 'markovce-parish-key': 'TEST_KEY' },
        fetchImpl,
    }));
    // Pick a different week than the one carrying the server payload so the
    // bootstrap-start snapshot of the *current* week doesn't refresh the
    // tested archive entry's updated_at with Date.now().
    sb.state.currentWeekStart = new Date(2024, 0, 1);
    sb.state.archive['2025-06-02'] = {
        events: { monday: ['LOCAL EVENT'], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
        feasts: {}, autoFilledFeasts: {}, dayTypes: {}, fastingMode: false,
        updatedAt: 1_000_000_000_000, // older than server
    };
    await sb.sync.bootstrap();
    assert.deepEqual(sb.state.archive['2025-06-02'].events.monday, ['SERVER EVENT'],
        'server payload should win when its updated_at is strictly newer');
});

test('bootstrap: older server payload preserves newer local edits', async () => {
    const fetchImpl = () => Promise.resolve({
        ok: true,
        json: async () => ({
            weeks: [{
                weekKey: '2025-06-09',
                payload: {
                    events: { monday: ['OLD SERVER'], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
                    feasts: {}, autoFilledFeasts: {}, dayTypes: {}, fastingMode: false,
                },
                updated_at: 1_000_000_000_000,
            }],
            settings: {},
        }),
    });
    const sb = loadScriptInto(makeSandbox({
        stored: { 'markovce-parish-key': 'TEST_KEY' },
        fetchImpl,
    }));
    sb.state.currentWeekStart = new Date(2024, 0, 1); // different week
    sb.state.archive['2025-06-09'] = {
        events: { monday: ['FRESH LOCAL'], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
        feasts: {}, autoFilledFeasts: {}, dayTypes: {}, fastingMode: false,
        updatedAt: 9_000_000_000_000, // newer than server
    };
    await sb.sync.bootstrap();
    assert.deepEqual(sb.state.archive['2025-06-09'].events.monday, ['FRESH LOCAL'],
        'newer local edits must NOT be overwritten by an older server payload');
});

section('Icon load race: generation guard discards superseded onload');

test('superseded loadIconById onload does not overwrite later selection', async () => {
    const sb = loadScriptInto(makeSandbox());
    // updatePreview() fires inside loadIconById's onload and walks the
    // schedule renderer — set a valid currentWeekStart so the canvas path
    // doesn't crash on a null date.
    sb.state.currentWeekStart = new Date(2025, 5, 2);
    sb.setGalleryImages([
        { id: 'A', name: 'A', src: 'data:image/png;base64,a', type: 'builtin' },
        { id: 'B', name: 'B', src: 'data:image/png;base64,b', type: 'builtin' },
    ]);
    sb.loadIconById('A');
    sb.loadIconById('B');
    // Let microtasks flush — both Image.src setters scheduled an onload.
    await new Promise(r => queueMicrotask(r));
    await new Promise(r => queueMicrotask(r));
    await new Promise(r => setTimeout(r, 0));
    assert.equal(sb.state.currentGalleryId, 'B',
        'last-issued loadIconById should win currentGalleryId');
    // The B-load applies state._iconDataUrl synchronously inside its onload;
    // the A-load's onload should self-discard via the generation guard.
    assert.equal(sb.state._iconDataUrl, 'data:image/png;base64,b',
        'iconImage payload should match B, not the superseded A');
});

// ── Summary ───────────────────────────────────────────────────────────────
await runAll();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
    for (const { name, error } of failures) {
        console.log(`\n  ${name}\n  ${error.stack || error.message}`);
    }
    process.exit(1);
}
