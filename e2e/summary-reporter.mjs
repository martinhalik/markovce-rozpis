// Playwright reporter → e2e-report/index.html: one self-contained page (all
// screenshots inline) with every walkthrough step as a row and the desktop
// and mobile runs side by side, for a person to check what was tested and
// what it looked like. Also writes e2e-report/summary.md (GitHub job summary).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Playwright errors carry terminal colour codes.
const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, '');

function gitInfo() {
    const sha = process.env.GITHUB_SHA;
    const ref = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
    try {
        return {
            commit: (sha || execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString()).trim().slice(0, 7),
            branch: (ref || execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString()).trim(),
        };
    } catch (_) {
        return { commit: sha ? sha.slice(0, 7) : '?', branch: ref || '?' };
    }
}

export default class SummaryReporter {
    constructor({ outputFolder = 'e2e-report' } = {}) {
        this.outputFolder = outputFolder;
        this.rows = new Map(); // title → { project → result }
        this.projects = [];
    }

    onBegin(config, suite) {
        this.startedAt = new Date();
        // Like Playwright's own reporters: relative to the config file.
        this.dir = path.resolve(path.dirname(config.configFile || '.'), this.outputFolder);
        this.projects = config.projects.map((p) => p.name);
        // Register every test up front so skipped ones still get a row.
        for (const t of suite.allTests()) this.rowFor(t.title);
    }

    rowFor(title) {
        if (!this.rows.has(title)) this.rows.set(title, {});
        return this.rows.get(title);
    }

    onTestEnd(test, result) {
        const project = test.parent.project().name;
        const shots = result.attachments
            .filter((a) => a.contentType && a.contentType.startsWith('image/') && a.name !== 'screenshot')
            .map((a) => ({
                label: a.name,
                data: (a.body || (a.path && fs.existsSync(a.path) ? fs.readFileSync(a.path) : Buffer.alloc(0))).toString('base64'),
                type: a.contentType,
            }))
            .filter((s) => s.data);
        this.rowFor(test.title)[project] = {
            status: result.status,
            duration: result.duration,
            error: result.error ? stripAnsi(result.error.message || result.error.value || '').split('\n').slice(0, 12).join('\n') : '',
            shots,
        };
    }

    onEnd(result) {
        const dir = this.dir;
        fs.mkdirSync(dir, { recursive: true });
        const git = gitInfo();
        const rows = [...this.rows.entries()].sort(([a], [b]) => a.localeCompare(b));
        const counts = Object.fromEntries(this.projects.map((p) => [p, { passed: 0, failed: 0, skipped: 0 }]));
        for (const [, byProject] of rows) {
            for (const p of this.projects) {
                const r = byProject[p];
                const bucket = !r || r.status === 'skipped' ? 'skipped' : r.status === 'passed' ? 'passed' : 'failed';
                counts[p][bucket]++;
            }
        }
        const ok = result.status === 'passed';
        const when = this.startedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
        const minutes = (result.duration / 1000).toFixed(0);

        fs.writeFileSync(path.join(dir, 'index.html'), this.html({ rows, counts, ok, git, when, minutes }));
        fs.writeFileSync(path.join(dir, 'summary.md'), this.markdown({ rows, counts, ok, git, when }));
        console.log(`\nE2E report: ${path.join(dir, 'index.html')}`);
    }

    markdown({ rows, counts, ok, git, when }) {
        const icon = (r) => (!r || r.status === 'skipped' ? '⏭️' : r.status === 'passed' ? '✅' : '❌');
        const lines = [
            `## ${ok ? '✅' : '❌'} E2E walkthrough — ${ok ? 'all steps passed' : 'FAILED'}`,
            '',
            `\`${git.branch}\` @ \`${git.commit}\` · ${when} · ` +
                this.projects.map((p) => `${p}: ${counts[p].passed} passed, ${counts[p].failed} failed, ${counts[p].skipped} skipped`).join(' · '),
            '',
            `| Step | ${this.projects.join(' | ')} |`,
            `|---|${this.projects.map(() => ':-:').join('|')}|`,
            ...rows.map(([title, byProject]) => `| ${title.replace(/\|/g, '\\|')} | ${this.projects.map((p) => icon(byProject[p])).join(' | ')} |`),
            '',
            'Screenshots of every step: download the **e2e-report** artifact and open `index.html`.',
        ];
        return lines.join('\n') + '\n';
    }

    html({ rows, counts, ok, git, when, minutes }) {
        const cell = (r) => {
            if (!r) return '<td class="cell skipped"><span class="pill skipped">not run</span></td>';
            const cls = r.status === 'passed' ? 'passed' : r.status === 'skipped' ? 'skipped' : 'failed';
            const label = { passed: 'PASS', failed: 'FAIL', skipped: 'SKIPPED' }[cls];
            return `<td class="cell ${cls}">
                <div class="meta"><span class="pill ${cls}">${label}</span><span class="dur">${(r.duration / 1000).toFixed(1)} s</span></div>
                ${r.error ? `<pre class="error">${esc(r.error)}</pre>` : ''}
                ${r.shots.map((s) => `<figure><img loading="lazy" src="data:${s.type};base64,${s.data}" alt="${esc(s.label)}"><figcaption>${esc(s.label)}</figcaption></figure>`).join('')}
            </td>`;
        };
        const summary = this.projects.map((p) =>
            `<span class="count"><b>${esc(p)}</b> ${counts[p].passed} passed${counts[p].failed ? `, <span class="bad">${counts[p].failed} failed</span>` : ''}${counts[p].skipped ? `, ${counts[p].skipped} skipped` : ''}</span>`).join('');
        return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>E2E Report</title>
<style>
:root { --bg:#f6f7fb; --card:#fff; --text:#1d2433; --muted:#667085; --line:#e4e7ec; --pass:#12805c; --pass-bg:#e7f6ef; --fail:#c0362c; --fail-bg:#fdecea; --skip:#667085; --skip-bg:#eef0f3; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f1420; --card:#171d2b; --text:#e6e9ef; --muted:#98a2b3; --line:#2a3242; --pass:#4ade80; --pass-bg:#173326; --fail:#f87171; --fail-bg:#3a1a1a; --skip:#98a2b3; --skip-bg:#232a38; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
header { padding:24px 16px; max-width:1400px; margin:auto; }
h1 { margin:0 0 6px; font-size:22px; }
.banner { display:inline-block; padding:6px 12px; border-radius:8px; font-weight:700; margin:8px 0; }
.banner.ok { background:var(--pass-bg); color:var(--pass); } .banner.bad { background:var(--fail-bg); color:var(--fail); }
.sub { color:var(--muted); } .count { margin-right:18px; } .bad { color:var(--fail); font-weight:700; }
main { max-width:1400px; margin:auto; padding:0 16px 40px; }
table { width:100%; border-collapse:separate; border-spacing:0 10px; table-layout:fixed; }
th { text-align:left; color:var(--muted); font-weight:600; padding:0 10px; }
td { vertical-align:top; background:var(--card); padding:12px; }
td:first-child { border-radius:10px 0 0 10px; width:24%; font-weight:600; } td:last-child { border-radius:0 10px 10px 0; }
.meta { display:flex; gap:10px; align-items:center; margin-bottom:8px; }
.pill { padding:2px 8px; border-radius:999px; font-size:12px; font-weight:800; letter-spacing:.03em; }
.pill.passed { background:var(--pass-bg); color:var(--pass); } .pill.failed { background:var(--fail-bg); color:var(--fail); } .pill.skipped { background:var(--skip-bg); color:var(--skip); }
.dur { color:var(--muted); font-size:13px; }
.error { white-space:pre-wrap; background:var(--fail-bg); color:var(--fail); padding:8px; border-radius:6px; font-size:12px; overflow:auto; }
figure { margin:0 0 8px; } figcaption { color:var(--muted); font-size:12px; }
img { max-width:100%; max-height:520px; border:1px solid var(--line); border-radius:6px; cursor:zoom-in; display:block; }
#zoom { position:fixed; inset:0; background:rgba(0,0,0,.85); display:none; align-items:center; justify-content:center; padding:16px; cursor:zoom-out; }
#zoom img { max-height:100%; max-width:100%; cursor:zoom-out; }
@media (max-width:760px) { table, tbody, tr, td { display:block; width:100% !important; } thead { display:none; } td { border-radius:0 !important; } td:first-child { border-radius:10px 10px 0 0 !important; } td:last-child { border-radius:0 0 10px 10px !important; } .cell::before { content:attr(data-project); display:block; color:var(--muted); font-size:12px; margin-bottom:4px; } }
</style></head><body>
<header>
<h1>E2E walkthrough · markovce-rozpis</h1>
<div class="banner ${ok ? 'ok' : 'bad'}">${ok ? 'All steps passed' : 'Some steps FAILED'}</div>
<div class="sub">Branch <b>${esc(git.branch)}</b> · commit <b>${esc(git.commit)}</b> · ${esc(when)} · ${esc(minutes)} s</div>
<div class="sub">${summary}</div>
<p class="sub">Real Chromium against the real API handlers and a Postgres seeded in the pre-migration layout. Only Google's own consent screen is a local stand-in. Click a screenshot to enlarge it.</p>
</header>
<main><table>
<thead><tr><th>Step</th>${this.projects.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead>
<tbody>
${rows.map(([title, byProject]) => `<tr><td>${esc(title)}</td>${this.projects.map((p) => cell(byProject[p]).replace('<td class="cell', `<td data-project="${esc(p)}" class="cell`)).join('')}</tr>`).join('\n')}
</tbody></table></main>
<div id="zoom"><img alt=""></div>
<script>
const zoom = document.getElementById('zoom');
document.addEventListener('click', (e) => {
  if (e.target.closest('#zoom')) { zoom.style.display = 'none'; return; }
  if (e.target.tagName === 'IMG') { zoom.querySelector('img').src = e.target.src; zoom.style.display = 'flex'; }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') zoom.style.display = 'none'; });
</script>
</body></html>`;
    }
}
