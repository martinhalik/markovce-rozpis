import { sql } from '@vercel/postgres';
import { buildICal } from '../lib/ical.js';
import { SLUG_RE } from '../lib/auth.js';
import { ensureSchema } from '../lib/schema.js';

// Public read-only iCalendar feed of one parish's weekly schedules:
//   /p/<slug>/kalendar.ics  (rewritten to /api/calendar?parish=<slug>)
//   /kalendar.ics           (no parish → Markovce, the original feed URL)
// No auth: the schedule is public information (also posted on Facebook), and
// calendar subscribers (iPhone, Google Calendar, ...) cannot send custom headers.
const DEFAULT_PARISH = 'markovce';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end();
    }
    const slug = req.query.parish || DEFAULT_PARISH;
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return res.status(404).json({ error: 'not found' });
    try {
        await ensureSchema();
        const parishQ = await sql`SELECT id, name FROM parishes WHERE slug = ${slug}`;
        const parish = parishQ.rows[0];
        if (!parish) return res.status(404).json({ error: 'not found' });
        const { rows } = await sql`
            SELECT week_key, payload FROM weeks WHERE parish_id = ${parish.id} ORDER BY week_key
        `;
        const weeks = rows.map((r) => ({ weekKey: r.week_key, payload: r.payload }));
        const ics = buildICal(weeks, slug === DEFAULT_PARISH ? {} : {
            name: `Bohoslužby - ${parish.name}`,
            uidDomain: `${slug}.markovce-rozpis`,
        });
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${slug}-bohosluzby.ics"`);
        res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
        return res.status(200).send(ics);
    } catch (e) {
        console.error('calendar feed error', e);
        return res.status(500).json({ error: 'server' });
    }
}
