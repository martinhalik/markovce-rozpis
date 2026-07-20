// Build an iCalendar (RFC 5545) feed from the parish weekly schedules.
// Each week payload is { events: { monday:[...], ..., sunday:[...] }, ... },
// keyed by the Monday date (YYYY-MM-DD). Each service line may start with a
// time ("7:00 sv. Liturgia"); timed lines become timed events, the rest all-day.

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const VTIMEZONE = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Bratislava',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
];

const pad = (n) => String(n).padStart(2, '0');

// weekKey + offset -> YYYYMMDD (calendar-local date; DST handled by the TZID on the time).
function dateAfter(weekKey, offset) {
    const [y, m, d] = weekKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + offset);
    return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

function esc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545: fold content lines longer than 75 octets; continuation lines start with a space.
function fold(line) {
    if (Buffer.byteLength(line, 'utf8') <= 75) return line;
    const parts = [];
    let cur = '';
    let curBytes = 0;
    for (const ch of line) {
        const chBytes = Buffer.byteLength(ch, 'utf8');
        const limit = parts.length === 0 ? 75 : 74;
        if (curBytes + chBytes > limit) { parts.push(cur); cur = ''; curBytes = 0; }
        cur += ch; curBytes += chBytes;
    }
    if (cur) parts.push(cur);
    return parts.map((p, i) => (i === 0 ? p : ' ' + p)).join('\r\n');
}

export function buildICal(weeks, opts = {}) {
    const name = opts.name || 'Bohoslužby - Pravoslávna cirkevná obec Markovce';
    const prodId = opts.prodId || '-//markovce-rozpis//Rozpis bohosluzieb//SK';
    const stamp = (opts.now ? new Date(opts.now) : new Date())
        .toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:${prodId}`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${esc(name)}`,
        'X-WR-TIMEZONE:Europe/Bratislava',
        `X-WR-CALDESC:${esc('Týždenný rozpis bohoslužieb - automaticky synchronizované.')}`,
        ...VTIMEZONE,
    ];

    for (const w of weeks) {
        const weekKey = w.weekKey || w.week_key;
        if (!weekKey || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) continue;
        const events = (w.payload && w.payload.events) || {};
        DAYS.forEach((day, offset) => {
            const list = Array.isArray(events[day]) ? events[day] : [];
            const dateY = dateAfter(weekKey, offset);
            let idx = 0;
            for (const rawLine of list) {
                const segs = String(rawLine).split(/\s+·\s+|\r?\n+/).map((s) => s.trim()).filter(Boolean);
                for (const seg of segs) {
                    const m = seg.match(/^(\d{1,2})[.:](\d{2})\s+(.+)$/);
                    const uid = `${weekKey}-${day}-${idx}@markovce-rozpis`;
                    idx++;
                    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`);
                    if (m) {
                        const hh = pad(Number(m[1]));
                        lines.push(`DTSTART;TZID=Europe/Bratislava:${dateY}T${hh}${m[2]}00`);
                        lines.push('DURATION:PT1H30M');
                        lines.push(`SUMMARY:${esc(m[3])}`);
                    } else {
                        lines.push(`DTSTART;VALUE=DATE:${dateY}`);
                        lines.push(`SUMMARY:${esc(seg)}`);
                    }
                    lines.push('END:VEVENT');
                }
            }
        });
    }

    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
}
