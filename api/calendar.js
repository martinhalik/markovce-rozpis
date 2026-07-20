import { sql } from '@vercel/postgres';
import { buildICal } from '../lib/ical.js';

// Public read-only iCalendar feed of the parish weekly schedules.
// No auth: the schedule is public information (also posted on Facebook), and
// calendar subscribers (iPhone, Google Calendar, ...) cannot send custom headers.
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end();
    }
    try {
        const { rows } = await sql`SELECT week_key, payload FROM weeks ORDER BY week_key`;
        const weeks = rows.map((r) => ({ weekKey: r.week_key, payload: r.payload }));
        const ics = buildICal(weeks);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="markovce-bohosluzby.ics"');
        res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
        return res.status(200).send(ics);
    } catch (e) {
        console.error('calendar feed error', e);
        return res.status(500).json({ error: 'server' });
    }
}
