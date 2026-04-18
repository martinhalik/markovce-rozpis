// ── Orthodox liturgical calendar ───────────────────────────────────────────
// All Orthodox churches (Julian "starý" and Antiochian "nový") share the same
// Paschalion (Pascha computed on the Julian calendar). The calendar style only
// affects fixed-date feasts: Antiochian uses Gregorian civil dates, Julian uses
// Julian civil dates — 13 days behind Gregorian in the 20th–21st century.
const orthodoxCalendar = (function () {
    // Days to add to a Julian-calendar date to get the same day on the Gregorian
    // civil calendar. Depends on the century: 13 from 1900-03-01 to 2100-02-28,
    // 14 from 2100-03-01 to 2200-02-28, etc. Formula: floor(y/100) - floor(y/400) - 2.
    // Note: exact around the Feb 28 / Mar 1 boundary we approximate using the
    // year of the given date — good enough for liturgical feast mapping, where
    // Pascha is always April-ish and fixed-feast shifts are year-stable.
    function julianOffsetDays(year) {
        return Math.floor(year / 100) - Math.floor(year / 400) - 2;
    }

    // Meeus' algorithm for Julian (Orthodox) Pascha — returns a Gregorian Date
    // at local midnight for the given year.
    function computePascha(year) {
        const a = year % 4;
        const b = year % 7;
        const c = year % 19;
        const d = (19 * c + 15) % 30;
        const e = (2 * a + 4 * b - d + 34) % 7;
        const month = Math.floor((d + e + 114) / 31); // 3 = March, 4 = April (Julian)
        const day = ((d + e + 114) % 31) + 1;
        // Julian calendar → Gregorian: add century-dependent offset.
        const julianDate = new Date(year, month - 1, day);
        julianDate.setDate(julianDate.getDate() + julianOffsetDays(year));
        julianDate.setHours(0, 0, 0, 0);
        return julianDate;
    }

    function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    // Movable feasts — offsets in days from Pascha. Negative = before Pascha.
    // id → { offset, slovak name, class ('celebration'|'fasting'|'non-fasting'), feastId (for icon match) }
    const MOVABLE = [
        { id: 'sunday-publican-pharisee', offset: -70, name: 'Nedeľa o mýtnikovi a farizejovi', dayType: 'celebration' },
        { id: 'sunday-prodigal-son',      offset: -63, name: 'Nedeľa o márnotratnom synovi',    dayType: 'celebration' },
        { id: 'sunday-meatfare',          offset: -56, name: 'Mäsopôstna nedeľa (o poslednom súde)', dayType: 'celebration' },
        { id: 'sunday-cheesefare',        offset: -49, name: 'Syropôstna nedeľa (odpustenia)',  dayType: 'celebration' },
        { id: 'sunday-orthodoxy',         offset: -42, name: 'Nedeľa Pravoslávia',              dayType: 'celebration' },
        { id: 'sunday-gregory-palamas',   offset: -35, name: 'Nedeľa sv. Gregora Palamu',       dayType: 'celebration' },
        { id: 'sunday-cross',             offset: -28, name: 'Krestopoklonná nedeľa (Kríža)',   dayType: 'celebration' },
        { id: 'sunday-john-climacus',     offset: -21, name: 'Nedeľa sv. Jána Klimaka',         dayType: 'celebration' },
        { id: 'sunday-mary-egypt',        offset: -14, name: 'Nedeľa sv. Márie Egyptskej',      dayType: 'celebration' },
        { id: 'lazarus-saturday',         offset:  -8, name: 'Lazárova sobota',                 dayType: 'celebration' },
        { id: 'palm-sunday',              offset:  -7, name: 'Kvetná nedeľa (Vchod do Jeruzalema)', dayType: 'celebration' },
        { id: 'holy-friday',              offset:  -2, name: 'Veľký piatok',                    dayType: 'fasting' },
        { id: 'holy-saturday',            offset:  -1, name: 'Veľká sobota',                    dayType: 'celebration' },
        { id: 'pascha',                   offset:   0, name: 'Pascha – Svetlé Kristovo Vzkriesenie', dayType: 'celebration' },
        { id: 'thomas-sunday',            offset:   7, name: 'Tomášova nedeľa (Antipascha)',    dayType: 'celebration' },
        { id: 'sunday-myrrhbearers',      offset:  14, name: 'Nedeľa myronosičiek',             dayType: 'celebration' },
        { id: 'sunday-paralytic',         offset:  21, name: 'Nedeľa o uzdravení ochrnutého',   dayType: 'celebration' },
        { id: 'mid-pentecost',            offset:  24, name: 'Prepolovenie Päťdesiatnice',      dayType: 'celebration' },
        { id: 'sunday-samaritan',         offset:  28, name: 'Nedeľa o Samaritánke',            dayType: 'celebration' },
        { id: 'sunday-blind-man',         offset:  35, name: 'Nedeľa o slepom',                 dayType: 'celebration' },
        { id: 'ascension',                offset:  39, name: 'Nanebovstúpenie Pána',            dayType: 'celebration' },
        { id: 'sunday-fathers-council',   offset:  42, name: 'Nedeľa sv. otcov I. snemu',       dayType: 'celebration' },
        { id: 'pentecost',                offset:  49, name: 'Päťdesiatnica – Zoslanie Sv. Ducha', dayType: 'celebration' },
        { id: 'sunday-all-saints',        offset:  56, name: 'Nedeľa všetkých svätých',         dayType: 'celebration' },
        { id: 'sunday-russian-saints',    offset:  63, name: 'Nedeľa všetkých ruských svätých', dayType: 'celebration' }
    ];

    // Fixed-date feasts — month (1-12), day (1-31). `name` Slovak, `dayType` used
    // to color the day. Civil date = liturgical date for Antiochian; +13 days for Julian.
    const FIXED = [
        { id: 'st-basil',              month:  1, day:  1, name: 'Sv. Bazil Veľký, Obrezanie Pána', dayType: 'celebration' },
        { id: 'st-seraphim',           month:  1, day:  2, name: 'Sv. Serafim Sarovský',           dayType: 'non-fasting' },
        { id: 'theophany',             month:  1, day:  6, name: 'Zjavenie Pána (Bohozjavenie)',   dayType: 'celebration' },
        { id: 'synaxis-john-baptist',  month:  1, day:  7, name: 'Zbor sv. Jána Krstiteľa',        dayType: 'celebration' },
        { id: 'three-hierarchs',       month:  1, day: 30, name: 'Traja svätí svätitelia',         dayType: 'celebration' },
        { id: 'meeting-of-lord',       month:  2, day:  2, name: 'Stretnutie Pána (Hromnice)',     dayType: 'celebration' },
        { id: 'st-john-chrysostom-jan',month:  1, day: 27, name: 'Prenesenie ostatkov sv. Jána Zlatoústeho', dayType: 'non-fasting' },
        { id: 'annunciation',          month:  3, day: 25, name: 'Zvestovanie Presv. Bohorodičke', dayType: 'celebration' },
        { id: 'st-george',             month:  4, day: 23, name: 'Sv. veľkomučeník Juraj',         dayType: 'celebration' },
        { id: 'st-mark-evangelist',    month:  4, day: 25, name: 'Sv. apoštol a evanjelista Marek',dayType: 'non-fasting' },
        { id: 'st-james-alphaeus',     month: 10, day:  9, name: 'Sv. apoštol Jakub, syn Alfejov', dayType: 'celebration' },
        { id: 'ss-cyril-methodius',    month:  5, day: 11, name: 'Sv. Cyril a Metod',              dayType: 'celebration' },
        { id: 'ss-constantine-helen',  month:  5, day: 21, name: 'Sv. Konštantín a Helena',        dayType: 'celebration' },
        { id: 'st-john-theologian',    month:  5, day:  8, name: 'Sv. apoštol a evanjelista Ján Teológ', dayType: 'celebration' },
        { id: 'ss-peter-paul',         month:  6, day: 29, name: 'Sv. vrchní apoštoli Peter a Pavol', dayType: 'celebration' },
        { id: 'st-john-baptist-birth', month:  6, day: 24, name: 'Narodenie sv. Jána Krstiteľa',   dayType: 'celebration' },
        { id: 'prophet-elijah',        month:  7, day: 20, name: 'Sv. prorok Eliáš',               dayType: 'celebration' },
        { id: 'st-mary-magdalene',     month:  7, day: 22, name: 'Sv. Mária Magdaléna',            dayType: 'non-fasting' },
        { id: 'st-panteleimon',        month:  7, day: 27, name: 'Sv. veľkomučeník Panteleimon',   dayType: 'non-fasting' },
        { id: 'transfiguration',       month:  8, day:  6, name: 'Premenenie Pána',                dayType: 'celebration' },
        { id: 'dormition',             month:  8, day: 15, name: 'Usnutie Presv. Bohorodičky',     dayType: 'celebration' },
        { id: 'beheading-john-baptist',month:  8, day: 29, name: 'Sťatie hlavy sv. Jána Krstiteľa',dayType: 'fasting' },
        { id: 'nativity-theotokos',    month:  9, day:  8, name: 'Narodenie Presv. Bohorodičky',   dayType: 'celebration' },
        { id: 'exaltation-cross',      month:  9, day: 14, name: 'Vozdviženie sv. Kríža',          dayType: 'fasting' },
        { id: 'st-john-theologian-fall',month: 9, day: 26, name: 'Zosnutie sv. apoštola Jána Teológa', dayType: 'celebration' },
        { id: 'pokrov',                month: 10, day:  1, name: 'Pokrov Presv. Bohorodičky',      dayType: 'celebration' },
        { id: 'st-luke',               month: 10, day: 18, name: 'Sv. apoštol a evanjelista Lukáš',dayType: 'celebration' },
        { id: 'st-demetrios',          month: 10, day: 26, name: 'Sv. veľkomuč. Dimitrij Solúnsky',dayType: 'celebration' },
        { id: 'synaxis-archangels',    month: 11, day:  8, name: 'Zbor sv. archanjela Michala',    dayType: 'celebration' },
        { id: 'entry-theotokos',       month: 11, day: 21, name: 'Vchod Presv. Bohorodičky do chrámu', dayType: 'celebration' },
        { id: 'st-andrew-apostle',     month: 11, day: 30, name: 'Sv. apoštol Andrej Prvopovolaný',dayType: 'celebration' },
        { id: 'st-nicholas',           month: 12, day:  6, name: 'Sv. Mikuláš',                    dayType: 'celebration' },
        { id: 'st-daniel',             month: 12, day: 17, name: 'Sv. prorok Daniel',              dayType: 'non-fasting' },
        { id: 'st-lucy',               month: 12, day: 13, name: 'Sv. Lucia',                      dayType: 'non-fasting' },
        { id: 'nativity',              month: 12, day: 25, name: 'Narodenie Pána (Vianoce)',       dayType: 'celebration' },
        { id: 'synaxis-theotokos',     month: 12, day: 26, name: 'Zbor Presv. Bohorodičky',        dayType: 'celebration' },
        { id: 'st-patrick',            month:  3, day: 17, name: 'Sv. Patrik',                     dayType: 'non-fasting' },
        { id: 'st-wenceslas',          month:  9, day: 28, name: 'Sv. Václav',                     dayType: 'celebration' },
        { id: 'st-rostislav',          month:  5, day: 14, name: 'Sv. Rostislav Veľkomoravský',    dayType: 'celebration' },
        { id: 'st-xenia',              month:  1, day: 24, name: 'Sv. Xénia Peterburská',          dayType: 'non-fasting' },
        { id: 'st-maxim-sandovic',     month:  9, day:  6, name: 'Sv. Maxim Sandovič',             dayType: 'celebration' },
        { id: 'st-john-merciful',      month: 11, day: 12, name: 'Sv. Ján Milosrdný',              dayType: 'non-fasting' },
        { id: 'st-symeon-new-theologian', month: 3, day: 12, name: 'Sv. Simeon Nový Teológ',       dayType: 'non-fasting' },
        { id: 'st-andrew-of-crete',    month:  7, day:  4, name: 'Sv. Andrej Krétsky',             dayType: 'non-fasting' },
        { id: 'st-theodore-stratilates', month: 2, day:  8, name: 'Sv. veľkomuč. Teodor Stratilates', dayType: 'non-fasting' }
    ];

    // Return the civil-calendar (Gregorian) date for a fixed feast under the
    // currently-active liturgical calendar. Julian adds 13 days.
    function civilDateForFixed(year, feastMonth, feastDay, calendarStyle) {
        const d = new Date(year, feastMonth - 1, feastDay);
        if (calendarStyle === 'julian') d.setDate(d.getDate() + julianOffsetDays(year));
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // Return all feasts that fall on `date` (a Date), given the calendar style.
    // Includes movable (shared) + fixed (shifted for Julian). Returns array of
    // { id, name, dayType, source:'movable'|'fixed' }.
    function feastsOnDate(date, calendarStyle) {
        const out = [];
        const year = date.getFullYear();
        const pascha = computePascha(year);
        // Also consider pascha from previous/next year for offsets that span year boundaries
        for (const yearOffset of [-1, 0, 1]) {
            const p = computePascha(year + yearOffset);
            for (const f of MOVABLE) {
                const feastDate = addDays(p, f.offset);
                if (sameDay(feastDate, date)) {
                    out.push({ id: f.id, name: f.name, dayType: f.dayType, source: 'movable' });
                }
            }
        }
        // Fixed: try current and adjacent years because Julian shift can cross year boundary
        for (const yearOffset of [-1, 0, 1]) {
            for (const f of FIXED) {
                const feastDate = civilDateForFixed(year + yearOffset, f.month, f.day, calendarStyle);
                if (sameDay(feastDate, date)) {
                    out.push({ id: f.id, name: f.name, dayType: f.dayType, source: 'fixed' });
                }
            }
        }
        return out;
    }

    // Rank feasts loosely by liturgical rank so the "primary" feast of the day
    // wins when the day has several. Celebrations > fasting commemorations >
    // regular commemorations. Movable great feasts outrank fixed minor saints.
    const MAJOR_MOVABLE = new Set([
        'pascha', 'palm-sunday', 'lazarus-saturday', 'holy-friday', 'holy-saturday',
        'thomas-sunday', 'sunday-myrrhbearers', 'sunday-paralytic', 'sunday-samaritan',
        'sunday-blind-man', 'ascension', 'sunday-fathers-council', 'pentecost',
        'sunday-all-saints', 'sunday-publican-pharisee', 'sunday-prodigal-son',
        'sunday-meatfare', 'sunday-cheesefare', 'sunday-orthodoxy',
        'sunday-gregory-palamas', 'sunday-cross', 'sunday-john-climacus',
        'sunday-mary-egypt', 'mid-pentecost', 'sunday-russian-saints'
    ]);
    const TWELVE_GREAT_FIXED = new Set([
        'nativity', 'theophany', 'meeting-of-lord', 'annunciation', 'transfiguration',
        'dormition', 'nativity-theotokos', 'exaltation-cross', 'entry-theotokos', 'pokrov'
    ]);

    function feastRank(feast) {
        if (MAJOR_MOVABLE.has(feast.id)) return 100;
        if (TWELVE_GREAT_FIXED.has(feast.id)) return 90;
        if (feast.dayType === 'celebration') return 70;
        if (feast.dayType === 'fasting') return 40;
        return 20;
    }

    // Pick the "primary" feast for a date (highest rank), or null.
    function primaryFeast(date, calendarStyle) {
        const all = feastsOnDate(date, calendarStyle);
        if (!all.length) return null;
        return all.slice().sort((a, b) => feastRank(b) - feastRank(a))[0];
    }

    // For a week starting Monday, return a map day→{ feast, all } so UI can
    // auto-fill feast names and surface descriptions.
    function feastsForWeek(weekStartMonday, calendarStyle) {
        const map = {};
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        days.forEach((day, i) => {
            const d = addDays(weekStartMonday, i);
            const all = feastsOnDate(d, calendarStyle);
            map[day] = {
                date: d,
                all,
                primary: all.length ? all.slice().sort((a, b) => feastRank(b) - feastRank(a))[0] : null
            };
        });
        return map;
    }

    return {
        computePascha,
        feastsOnDate,
        feastsForWeek,
        primaryFeast,
        feastRank,
        MAJOR_MOVABLE,
        TWELVE_GREAT_FIXED,
        MOVABLE,
        FIXED
    };
})();

// State management
const state = {
    currentDay: 'sunday',
    iconImage: null,
    currentGalleryId: null,
    currentWeekStart: null,
    // Which liturgical calendar is active: 'antiochian' (nový, default for Markovce)
    // or 'julian' (starý). Affects fixed-date feast mappings in orthodoxCalendar.
    calendarStyle: 'antiochian',
    // Per-week icon transform (pan/zoom) applied in drawIcon. Scale is a multiplier
    // on the fitted draw size; offsetX/Y shift the image inside the icon region.
    iconTransform: { scale: 1, offsetX: 0, offsetY: 0 },
    // Track whether the current week's icon was chosen manually vs auto-preselected.
    // Manual selections survive calendar-style changes; auto selections refresh.
    iconManual: false,
    events: {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: []
    },
    feasts: {
        monday: '',
        tuesday: '',
        wednesday: '',
        thursday: '',
        friday: '',
        saturday: '',
        sunday: ''
    },
    // Per-day flag: did the last auto-fill put this feast name there? Cleared
    // as soon as the user types in the feast input, so user edits are never
    // overwritten by subsequent auto-fills (week change, calendar-style change).
    autoFilledFeasts: {
        monday: false, tuesday: false, wednesday: false, thursday: false,
        friday: false, saturday: false, sunday: false
    },
    dayTypes: {
        monday: 'non-fasting',
        tuesday: 'non-fasting',
        wednesday: 'fasting',
        thursday: 'non-fasting',
        friday: 'fasting',
        saturday: 'non-fasting',
        sunday: 'celebration'
    },
    fastingMode: false,
    // Per-week archive: { "YYYY-MM-DD": { events, feasts, dayTypes, fastingMode, updatedAt } }
    // keyed by the Monday (week start) date of that week. Every edit auto-saves
    // an entry under the current week's key — every archived week counts in stats.
    archive: {}
};

// Stats modal state (view-only, not persisted)
let statsYear = new Date().getFullYear();
// Which category groups are currently expanded in the stats modal. Liturgies
// opens by default; other groups start collapsed. Persists across re-renders
// (year changes) within the same session.
const expandedStatsGroups = new Set(['liturgies']);

// ── Week archive helpers ───────────────────────────────────────────────────
function getWeekKey(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function parseWeekKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function currentWeekKey() {
    return getWeekKey(state.currentWeekStart);
}

function snapshotCurrentWeekToArchive() {
    if (!state.currentWeekStart) return;
    const key = currentWeekKey();
    state.archive[key] = {
        events: JSON.parse(JSON.stringify(state.events)),
        feasts: { ...state.feasts },
        autoFilledFeasts: { ...state.autoFilledFeasts },
        dayTypes: { ...state.dayTypes },
        fastingMode: state.fastingMode,
        // Icon selection is per-week so every week can show its own feast icon
        // even when navigating back through history.
        iconGalleryId: state.currentGalleryId || null,
        iconManual: !!state.iconManual,
        iconTransform: { ...state.iconTransform },
        updatedAt: Date.now()
    };
}

function hasArchiveEntry(weekKey) {
    return Object.prototype.hasOwnProperty.call(state.archive, weekKey);
}

function loadWeekFromArchive(weekKey) {
    const entry = state.archive[weekKey];
    if (!entry) return false;
    const emptyEvents = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
    const emptyFeasts = { monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: '' };
    const defaultTypes = { monday: 'non-fasting', tuesday: 'non-fasting', wednesday: 'fasting', thursday: 'non-fasting', friday: 'fasting', saturday: 'non-fasting', sunday: 'celebration' };
    state.events = { ...emptyEvents, ...JSON.parse(JSON.stringify(entry.events || {})) };
    state.feasts = { ...emptyFeasts, ...(entry.feasts || {}) };
    const emptyAuto = { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false };
    state.autoFilledFeasts = { ...emptyAuto, ...(entry.autoFilledFeasts || {}) };
    state.dayTypes = { ...defaultTypes, ...(entry.dayTypes || {}) };
    state.fastingMode = !!entry.fastingMode;
    state.iconManual = !!entry.iconManual;
    state.iconTransform = entry.iconTransform && typeof entry.iconTransform === 'object'
        ? { scale: 1, offsetX: 0, offsetY: 0, ...entry.iconTransform }
        : { scale: 1, offsetX: 0, offsetY: 0 };
    // Restore the per-week icon selection if the stored gallery item still exists;
    // loadIconById is defined later and handles the actual image loading.
    if (entry.iconGalleryId) {
        loadIconById(entry.iconGalleryId);
    } else {
        state.currentGalleryId = null;
        state.iconImage = null;
        state._iconDataUrl = null;
    }
    return true;
}

// ── Auto-save toast ────────────────────────────────────────────────────────
// Shown briefly after every persisted edit so the user has visual confirmation
// that the current week's program is safe. Suppressed during bootstrap so the
// user doesn't see a phantom "Uložené" when the page first loads.
let _appReady = false;

function showSavedToast() {
    if (!_appReady) return;
    const toast = document.getElementById('savedToast');
    if (!toast) return;
    toast.classList.add('visible');
    if (toast._hideTimer) clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.classList.remove('visible');
        toast._hideTimer = null;
    }, 1500);
}
// ───────────────────────────────────────────────────────────────────────────

// ── Gallery ────────────────────────────────────────────────────────────────
let galleryImages = [];
// Gallery modal search term (lowercased). Filters both name and feast keywords.
let gallerySearch = '';

// loadGallery is async so bootstrap can wait for the manifest before it tries to
// auto-preselect an icon (which needs the feast→icon mapping).
async function loadGallery() {
    try {
        const saved = localStorage.getItem('markovce-icons-gallery');
        if (saved) galleryImages = JSON.parse(saved);
    } catch (e) {
        galleryImages = [];
    }
    try {
        const response = await fetch('icons/manifest.json');
        const manifest = await response.json();
        const existingIds = new Set(galleryImages.map(i => i.id));
        const builtins = (manifest.icons || [])
            .filter(icon => !existingIds.has(icon.id))
            .map(icon => ({
                id: icon.id,
                name: icon.name,
                src: 'icons/' + icon.file,
                type: 'builtin',
                feasts: Array.isArray(icon.feasts) ? icon.feasts : [],
                description: icon.description || ''
            }));
        if (builtins.length) {
            galleryImages = [...builtins, ...galleryImages];
        }
    } catch (e) {
        // No manifest, or failed to parse — proceed with whatever's in localStorage.
    }
}

// Return gallery items whose `feasts` array includes feastId. Sorted so major
// matches come first (purely by manifest order for now — stable and predictable).
function iconsForFeast(feastId) {
    if (!feastId) return [];
    return galleryImages.filter(img => Array.isArray(img.feasts) && img.feasts.includes(feastId));
}

// Collect all feasts occurring during the week (any day) with their icons, in
// rank order. Used for the "recommended" section in the gallery modal and for
// the weekly feast description box.
function weekFeastRecommendations() {
    if (!state.currentWeekStart) return { byDay: {}, all: [] };
    const byDay = orthodoxCalendar.feastsForWeek(state.currentWeekStart, state.calendarStyle);
    const all = [];
    const seen = new Set();
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
        const entry = byDay[day];
        if (!entry || !entry.all) return;
        entry.all.forEach(f => {
            if (seen.has(f.id)) return;
            seen.add(f.id);
            const icons = iconsForFeast(f.id);
            all.push({ ...f, day, date: entry.date, icons });
        });
    });
    all.sort((a, b) => orthodoxCalendar.feastRank(b) - orthodoxCalendar.feastRank(a));
    return { byDay, all };
}

// The primary feast used for auto-icon-preselection. Prefers Sunday's feast
// (the "nedeľa" is the anchor of the week), falls back to the highest-rank
// feast of the week.
function primaryWeekFeast() {
    if (!state.currentWeekStart) return null;
    const byDay = orthodoxCalendar.feastsForWeek(state.currentWeekStart, state.calendarStyle);
    const sunday = byDay.sunday && byDay.sunday.primary;
    if (sunday) return { ...sunday, day: 'sunday', date: byDay.sunday.date };
    // Fall back to highest-ranked feast in the week
    let best = null;
    let bestDay = null;
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].forEach(day => {
        const p = byDay[day] && byDay[day].primary;
        if (!p) return;
        if (!best || orthodoxCalendar.feastRank(p) > orthodoxCalendar.feastRank(best)) {
            best = p;
            bestDay = day;
        }
    });
    return best ? { ...best, day: bestDay, date: byDay[bestDay].date } : null;
}

// Auto-fill empty (or previously auto-filled) feast names for the current
// week based on the active calendar. User-edited names (flag cleared in the
// feast input handler) are NEVER overwritten. A day is treated as "empty" for
// this purpose when it's literally blank OR was auto-filled last time — so
// switching calendar or week replaces the stale auto name with the new one.
function autofillFeastNames() {
    if (!state.currentWeekStart) return;
    const byDay = orthodoxCalendar.feastsForWeek(state.currentWeekStart, state.calendarStyle);
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
        const entry = byDay[day];
        const current = state.feasts[day];
        const wasAuto = !!state.autoFilledFeasts[day];
        // If the user typed something, leave it alone.
        if (current && !wasAuto) return;
        if (entry && entry.primary) {
            state.feasts[day] = entry.primary.name;
            state.autoFilledFeasts[day] = true;
        } else if (wasAuto) {
            // Previously auto-filled but the new calendar/week has no feast
            // for this day — clear the stale auto text instead of stranding it.
            state.feasts[day] = '';
            state.autoFilledFeasts[day] = false;
        }
    });
}

// Pick and load an icon for the primary feast of the week, unless the user
// already picked one manually (iconManual). `force` bypasses the manual flag
// for explicit "re-recommend" intents.
function autoPickWeekIcon({ force = false } = {}) {
    if (!state.currentWeekStart) return;
    if (state.iconManual && !force) return;
    const primary = primaryWeekFeast();
    if (!primary) return;
    const icons = iconsForFeast(primary.id);
    if (!icons.length) return;
    const chosen = icons[0];
    if (state.currentGalleryId === chosen.id && state.iconImage) return;
    loadIconById(chosen.id);
}

// Combined entry point — autofill text + pick icon. Kept as one function for
// call-site ergonomics; callers that only need one can use the split helpers.
function applyAutoIconPreselection({ force = false } = {}) {
    autofillFeastNames();
    autoPickWeekIcon({ force });
}

function saveGallery() {
    try {
        const toSave = galleryImages.filter(i => i.type === 'uploaded');
        localStorage.setItem('markovce-icons-gallery', JSON.stringify(toSave));
    } catch (e) {
        console.error('Gallery save error:', e);
    }
}

function addToGallery(src, suggestedName) {
    const id = 'icon_' + Date.now();
    const uploadCount = galleryImages.filter(i => i.type === 'uploaded').length + 1;
    galleryImages.push({
        id,
        name: suggestedName || ('Ikona ' + uploadCount),
        src,
        type: 'uploaded',
        addedAt: Date.now()
    });
    saveGallery();
    return id;
}

function openGallery() {
    // Reset search so the user doesn't land on a stale filter from a prior open.
    gallerySearch = '';
    const searchInput = document.getElementById('gallerySearch');
    if (searchInput) searchInput.value = '';
    renderGallery();
    document.getElementById('galleryModal').style.display = 'flex';
    if (searchInput) searchInput.focus();
}

function closeGallery() {
    document.getElementById('galleryModal').style.display = 'none';
}

function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!galleryImages.length) {
        grid.innerHTML = '<p class="gallery-empty">Galéria je prázdna. Nahrajte prvú ikonu pomocou tlačidla vyššie.</p>';
        return;
    }

    // Compute recommended icon IDs for the current week so we can show them in
    // a dedicated section above the general grid.
    const { all: weekFeasts } = weekFeastRecommendations();
    const recommendedIds = [];
    const recommendedMeta = new Map(); // id → which feasts it was recommended for
    weekFeasts.forEach(f => {
        f.icons.forEach(icon => {
            if (!recommendedIds.includes(icon.id)) recommendedIds.push(icon.id);
            const meta = recommendedMeta.get(icon.id) || [];
            meta.push(f);
            recommendedMeta.set(icon.id, meta);
        });
    });

    // Apply text filter. Diacritic-insensitive so "post" matches "pôst" and
    // "juraj" matches "Juraj". Matches against name, description, and feast IDs.
    const q = foldText(gallerySearch);
    const matches = (img) => {
        if (!q) return true;
        if (img.name && foldText(img.name).includes(q)) return true;
        if (img.description && foldText(img.description).includes(q)) return true;
        if (Array.isArray(img.feasts) && img.feasts.some(f => foldText(f).includes(q))) return true;
        return false;
    };

    const recommended = recommendedIds
        .map(id => galleryImages.find(i => i.id === id))
        .filter(Boolean)
        .filter(matches);
    const recIdSet = new Set(recommended.map(i => i.id));
    const others = galleryImages.filter(img => !recIdSet.has(img.id)).filter(matches);

    // We render via innerHTML for simplicity but avoid inline onclick(id) —
    // the id would need to be safely embeddable inside a single-quoted string
    // literal, which escapeHtml only partially guarantees. Instead, render a
    // data-icon-id attribute and handle clicks via delegation (bound once in
    // initializeEventListeners).
    const renderItem = (img, { recommendedFor } = {}) => {
        const safeName = escapeHtml(img.name);
        const safeId = escapeHtml(img.id);
        const safeSrc = escapeHtml(img.src);
        const safeDesc = img.description ? escapeHtml(img.description) : '';
        const title = safeDesc ? ` title="${safeDesc}"` : '';
        const recommendedBadge = recommendedFor && recommendedFor.length
            ? `<div class="gallery-item-badge" title="${escapeHtml(recommendedFor.map(f => f.name).join(' · '))}">★ Odporúčané</div>`
            : '';
        return `
            <div class="gallery-item${state.currentGalleryId === img.id ? ' selected' : ''}${recommendedFor ? ' recommended' : ''}"
                 data-icon-id="${safeId}"${title}>
                ${recommendedBadge}
                <img src="${safeSrc}" alt="${safeName}" loading="lazy">
                <div class="gallery-item-name">${safeName}</div>
                ${img.type === 'uploaded'
                    ? `<button class="gallery-item-delete" data-icon-id="${safeId}" aria-label="Zmazať ikonu">✕</button>`
                    : ''}
            </div>
        `;
    };

    let html = '';
    if (recommended.length) {
        const feastListHtml = weekFeasts.slice(0, 4).map(f => {
            const dayLabel = {
                monday: 'Pondelok', tuesday: 'Utorok', wednesday: 'Streda',
                thursday: 'Štvrtok', friday: 'Piatok', saturday: 'Sobota', sunday: 'Nedeľa'
            }[f.day] || '';
            return `<li><strong>${escapeHtml(dayLabel)}:</strong> ${escapeHtml(f.name)}</li>`;
        }).join('');
        html += `
            <div class="gallery-section gallery-section-recommended">
                <div class="gallery-section-header">
                    <h3>★ Odporúčané pre tento týždeň</h3>
                    ${feastListHtml ? `<ul class="gallery-week-feasts">${feastListHtml}</ul>` : ''}
                </div>
                <div class="gallery-grid-inner">
                    ${recommended.map(img => renderItem(img, { recommendedFor: recommendedMeta.get(img.id) })).join('')}
                </div>
            </div>
        `;
    }
    if (others.length) {
        html += `
            <div class="gallery-section">
                <div class="gallery-section-header">
                    <h3>Všetky ikony${q ? ` — výsledky hľadania (${others.length + recommended.length})` : ''}</h3>
                </div>
                <div class="gallery-grid-inner">
                    ${others.map(img => renderItem(img)).join('')}
                </div>
            </div>
        `;
    }
    if (!recommended.length && !others.length) {
        html = `<p class="gallery-empty">Žiadna ikona neobsahuje „${escapeHtml(gallerySearch)}“.</p>`;
    }
    grid.innerHTML = html;
}

function onGallerySearchInput(value) {
    gallerySearch = value || '';
    renderGallery();
}

function selectFromGallery(id) {
    const item = galleryImages.find(i => i.id === id);
    if (!item) return;
    state.currentGalleryId = id;
    state.iconManual = true; // explicit user pick — do not auto-overwrite
    // Reset per-week transform when switching icons; otherwise the old pan/zoom
    // gets applied to the new image (common source of confusion).
    state.iconTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    const img = new Image();
    img.onload = () => {
        state.iconImage = img;
        state._iconDataUrl = item.src; // cache so we don't re-encode on every save
        updatePreview();
        saveToLocalStorage();
        refreshEditIconBtnState();
    };
    img.onerror = () => {
        // Decode failed — undo the selection rather than leaving half-applied
        // state behind.
        state.currentGalleryId = null;
        alert('Nepodarilo sa načítať ikonu.');
        refreshEditIconBtnState();
    };
    img.src = item.src;
    closeGallery();
}

// Load an icon by id without touching iconManual. Used when restoring a week's
// archived icon or applying an auto-preselection. Returns true only if a matching
// gallery item was found; the actual image decode is async (and may still fail —
// onerror clears the partial state).
function loadIconById(id) {
    const item = galleryImages.find(i => i.id === id);
    if (!item) {
        // Referenced id no longer exists (e.g. the user deleted their uploaded
        // icon). Clear any stale selection so the preview doesn't keep the old
        // icon around.
        state.currentGalleryId = null;
        state.iconImage = null;
        state._iconDataUrl = null;
        updatePreview();
        refreshEditIconBtnState();
        return false;
    }
    state.currentGalleryId = id;
    const img = new Image();
    img.onload = () => {
        state.iconImage = img;
        state._iconDataUrl = item.src;
        updatePreview();
        refreshEditIconBtnState();
    };
    img.onerror = () => {
        state.currentGalleryId = null;
        state.iconImage = null;
        state._iconDataUrl = null;
        updatePreview();
        refreshEditIconBtnState();
    };
    img.src = item.src;
    return true;
}

// Enable/disable the "Upraviť ikonu" button based on whether an icon is loaded.
// Called from every path that changes state.iconImage so the UI stays in sync
// without relying on a reactive framework.
function refreshEditIconBtnState() {
    const btn = document.getElementById('openImageEditorBtn');
    if (!btn) return;
    const disabled = !state.iconImage;
    btn.disabled = disabled;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    btn.title = disabled ? 'Najprv vyberte alebo nahrajte ikonu' : 'Upraviť ikonu';
}

// Gallery item deletion is handled by the delegated click listener in
// initializeEventListeners — see the '.gallery-item-delete' branch there.
// ───────────────────────────────────────────────────────────────────────────

// LocalStorage functions
//
// Persistence is debounced: rapid edits (feast name keystrokes, drag reorders)
// coalesce into a single localStorage write. flushSaveToLocalStorage() runs the
// actual work; saveToLocalStorage() schedules it.
const SAVE_DEBOUNCE_MS = 200;
let _saveTimer = null;

function saveToLocalStorage() {
    // Snapshot synchronously so in-memory archive is always current even if the
    // flush is delayed (important for openStats() which reads state.archive).
    snapshotCurrentWeekToArchive();
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(flushSaveToLocalStorage, SAVE_DEBOUNCE_MS);
}

function flushSaveToLocalStorage() {
    _saveTimer = null;
    try {
        const stateToSave = {
            currentDay: state.currentDay,
            currentWeekStart: state.currentWeekStart ? state.currentWeekStart.toISOString() : null,
            currentGalleryId: state.currentGalleryId,
            calendarStyle: state.calendarStyle,
            // Keep legacy top-level fields for backward compatibility with older clients/exports
            events: state.events,
            feasts: state.feasts,
            dayTypes: state.dayTypes,
            fastingMode: state.fastingMode,
            archive: state.archive,
            // Use the cached data URL instead of re-encoding the image every save.
            // _iconDataUrl is set wherever state.iconImage is set.
            iconImageData: state._iconDataUrl || null
        };

        localStorage.setItem('markovce-rozpis-state', JSON.stringify(stateToSave));
        showSavedToast();
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

function loadFromLocalStorage() {
    try {
        const savedState = localStorage.getItem('markovce-rozpis-state');
        if (!savedState) {
            return false;
        }

        const parsed = JSON.parse(savedState);

        // Restore session state
        state.currentDay = parsed.currentDay || 'sunday';
        state.calendarStyle = parsed.calendarStyle === 'julian' ? 'julian' : 'antiochian';
        state.archive = parsed.archive && typeof parsed.archive === 'object' ? parsed.archive : {};

        // Restore week start date
        if (parsed.currentWeekStart) {
            state.currentWeekStart = new Date(parsed.currentWeekStart);
        }

        // Load the current week's events from archive if present; otherwise fall back to
        // the legacy top-level fields (so existing users don't lose their in-progress week),
        // and migrate that into the archive.
        const key = state.currentWeekStart ? getWeekKey(state.currentWeekStart) : null;
        let archiveOwnsIcon = false;
        if (key && hasArchiveEntry(key)) {
            loadWeekFromArchive(key);
            // If the archive had an iconGalleryId, loadIconById already kicked off
            // a load; skip the legacy `iconImageData` restore so its async onload
            // doesn't race and overwrite the per-week icon.
            archiveOwnsIcon = !!state.archive[key].iconGalleryId;
        } else {
            state.events = parsed.events || state.events;
            state.feasts = parsed.feasts || state.feasts;
            state.dayTypes = parsed.dayTypes || state.dayTypes;
            state.fastingMode = parsed.fastingMode || false;
            // Migrate legacy single-week state into the archive so it counts toward stats
            if (key && parsed.events) {
                snapshotCurrentWeekToArchive();
            }
        }

        // Restore icon image (legacy path — only if nothing from archive took it)
        if (parsed.iconImageData && !archiveOwnsIcon) {
            const img = new Image();
            img.onload = () => {
                state.iconImage = img;
                state._iconDataUrl = parsed.iconImageData;
                updatePreview();
                refreshEditIconBtnState();
            };
            img.onerror = () => { /* corrupt data URL — leave icon empty */ };
            img.src = parsed.iconImageData;
        }

        // Restore selected-gallery highlight so the user sees which icon they picked
        if (parsed.currentGalleryId && !archiveOwnsIcon) {
            state.currentGalleryId = parsed.currentGalleryId;
        }

        return true;
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        return false;
    }
}

// Day names in Slovak (matching the interface)
const dayNames = {
    monday: 'PONDELÍ',
    tuesday: 'UTOROK',
    wednesday: 'STREDA',
    thursday: 'ŠTVRTOK',
    friday: 'PIATOK',
    saturday: 'SOBOTA',
    sunday: 'NEDEĽA'
};

// Month names in Slovak (genitive)
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Máj', 'Jún',
    'Júl', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load gallery (async — we need the manifest before we can auto-preselect
    // a week's feast icon or show the "recommended" section).
    await loadGallery();

    // Try to load from localStorage first
    const loaded = loadFromLocalStorage();

    // Always start on today's Monday on app open, so users never land on an
    // accidentally-locked past week. Historical weeks remain fully accessible
    // via week nav or the stats modal.
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const todaysMonday = new Date(today);
    todaysMonday.setDate(diff);
    todaysMonday.setHours(0, 0, 0, 0);

    // If we loaded a saved session but it pointed at a different week, swap
    // in today's Monday and try to load that week's archived data (if any).
    const storedKey = state.currentWeekStart ? getWeekKey(state.currentWeekStart) : null;
    state.currentWeekStart = todaysMonday;
    const todaysKey = getWeekKey(state.currentWeekStart);
    if (loaded && storedKey !== todaysKey) {
        if (hasArchiveEntry(todaysKey)) {
            loadWeekFromArchive(todaysKey);
        }
        // else keep the in-memory state as a template for today's week
    }

    initializeEventListeners();
    // One-time container-level drag handler (re-bound per item during each
    // render; the container handler must not be re-added on every render).
    initializeContainerDragListener();
    initializeModalDismissHandlers();

    // Flush any pending debounced save if the user closes/navigates away within
    // the debounce window — prevents a just-typed keystroke from being lost.
    window.addEventListener('pagehide', () => {
        if (_saveTimer) flushSaveToLocalStorage();
    });

    // Only load standard week if no saved events exist
    if (!loaded) {
        loadStandardWeek();
    }

    // Sync fasting mode checkbox with state
    document.getElementById('fastingMode').checked = state.fastingMode;

    // Reflect the stored (or defaulted) calendar style in the picker
    syncCalendarPickerUI();

    // Auto-preselect icon + auto-fill feast names for the newly-loaded week.
    // Respects iconManual so returning users keep their chosen icons.
    applyAutoIconPreselection();

    // Make sure the initial week is in the archive (so it shows in stats even before any edit)
    snapshotCurrentWeekToArchive();

    updateUI();
    // renderDayDetails has to run after autofill so the feast input for the
    // currently-selected day reflects the auto-filled name.
    renderDayDetails();
    applyLockState();
    renderWeekFeastHints();
    refreshEditIconBtnState();

    // From this point onward, persisted edits trigger the "Uložené" toast.
    // (Suppressed during bootstrap so initial state restore doesn't flash it.)
    _appReady = true;
});

function initializeEventListeners() {
    // Day selector buttons
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentDay = btn.dataset.day;
            renderDayDetails();
            saveToLocalStorage();
        });
    });

    // Recommendation buttons
    document.querySelectorAll('.rec-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!guardEditable()) return;
            const eventText = btn.dataset.event;
            state.events[state.currentDay].push(eventText);
            renderDayDetails();
            updatePreview();
            saveToLocalStorage();
        });
    });

    // Icon upload (main + gallery upload)
    document.getElementById('iconUpload').addEventListener('change', handleIconUpload);
    document.getElementById('galleryUpload').addEventListener('change', handleGalleryUpload);

    // Feast input
    document.getElementById('dayFeastName').addEventListener('input', (e) => {
        if (!guardEditable()) { e.target.value = state.feasts[state.currentDay] || ''; return; }
        state.feasts[state.currentDay] = e.target.value;
        // Any user edit transitions the field to "manual" — subsequent calendar
        // or week changes must not overwrite it.
        state.autoFilledFeasts[state.currentDay] = false;
        updatePreview();
        saveToLocalStorage();
    });

    // Day type selector
    document.querySelectorAll('input[name="dayType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (!guardEditable()) { e.preventDefault(); e.target.checked = false; renderDayDetails(); return; }
            state.dayTypes[state.currentDay] = e.target.value;
            updatePreview();
            saveToLocalStorage();
        });
    });

    // Fasting mode toggle
    document.getElementById('fastingMode').addEventListener('change', (e) => {
        if (!guardEditable()) { e.target.checked = state.fastingMode; return; }
        state.fastingMode = e.target.checked;
        updatePreview();
        saveToLocalStorage();
    });

    // Week navigation
    document.getElementById('prevWeek').addEventListener('click', () => {
        navigateWeeks(-1);
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        navigateWeeks(1);
    });

    // Calendar-style picker: switching the calendar reshuffles fixed-feast
    // dates, which changes what icons/feasts are recommended for the week.
    document.querySelectorAll('input[name="calendarStyle"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const val = e.target.value === 'julian' ? 'julian' : 'antiochian';
            if (val === state.calendarStyle) return;
            state.calendarStyle = val;
            // autofillFeastNames replaces previously-auto-filled names with the
            // new calendar's feast (or clears if no longer a feast); user-typed
            // names are preserved via the autoFilledFeasts flag.
            autofillFeastNames();
            autoPickWeekIcon();
            renderDayDetails();
            updatePreview();
            renderWeekFeastHints();
            saveToLocalStorage();
        });
    });

    // Gallery search
    const gsearch = document.getElementById('gallerySearch');
    if (gsearch) gsearch.addEventListener('input', (e) => onGallerySearchInput(e.target.value));

    // Delegated click handling on the gallery grid: item click → select, delete
    // button click → remove. Avoids inline onclick(id) that would be fragile
    // against quotes/apostrophes in ids (defense in depth, even though ids are
    // machine-generated).
    const galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        galleryGrid.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.gallery-item-delete');
            if (deleteBtn && deleteBtn.dataset.iconId) {
                e.stopPropagation();
                const id = deleteBtn.dataset.iconId;
                galleryImages = galleryImages.filter(i => i.id !== id);
                if (state.currentGalleryId === id) state.currentGalleryId = null;
                saveGallery();
                renderGallery();
                return;
            }
            const item = e.target.closest('.gallery-item');
            if (item && item.dataset.iconId) {
                selectFromGallery(item.dataset.iconId);
            }
        });
    }

    // Image editor: open via button over the preview on every viewport.
    const editBtn = document.getElementById('openImageEditorBtn');
    if (editBtn) editBtn.addEventListener('click', openImageEditor);

    // View switcher (mobile / tablet portrait)
    initializeViewSwitcher();
}

function syncCalendarPickerUI() {
    const radios = document.querySelectorAll('input[name="calendarStyle"]');
    radios.forEach(r => { r.checked = r.value === state.calendarStyle; });
}

function initializeViewSwitcher() {
    const main = document.querySelector('.main-content');
    const buttons = Array.from(document.querySelectorAll('.view-switcher-btn'));
    if (!main || buttons.length === 0) return;

    const activate = (view, { focus = false } = {}) => {
        if (!view) return;
        buttons.forEach(b => {
            const active = b.dataset.view === view;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
            // Roving tabindex — only the active tab is reachable via Tab key;
            // arrow keys move focus inside the tablist (WAI-ARIA APG pattern).
            b.setAttribute('tabindex', active ? '0' : '-1');
            if (active && focus) b.focus();
        });

        main.classList.remove('view-editor', 'view-preview');
        main.classList.add(`view-${view}`);

        // When switching to the preview, repaint — the canvas may have been
        // offscreen while hidden — then bring the preview to the top of the
        // viewport so users see it without having to scroll.
        if (view === 'preview') {
            updatePreview();
            if (window.scrollY > 0) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    };

    buttons.forEach((btn, index) => {
        btn.addEventListener('click', () => activate(btn.dataset.view));
        btn.addEventListener('keydown', (e) => {
            // ← / → / Home / End navigate between tabs within the tablist.
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight'
                && e.key !== 'Home' && e.key !== 'End') return;
            e.preventDefault();
            let nextIndex = index;
            if (e.key === 'ArrowLeft') nextIndex = (index - 1 + buttons.length) % buttons.length;
            else if (e.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
            else if (e.key === 'Home') nextIndex = 0;
            else if (e.key === 'End') nextIndex = buttons.length - 1;
            activate(buttons[nextIndex].dataset.view, { focus: true });
        });
    });
}

function jumpToThisWeek() {
    const today = new Date();
    const dow = today.getDay();
    const diff = today.getDate() - dow + (dow === 0 ? -6 : 1);
    const monday = new Date(today);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);

    if (getWeekKey(monday) === currentWeekKey()) return; // already there

    snapshotCurrentWeekToArchive();
    state.currentWeekStart = monday;
    // A week we haven't seen yet starts with a fresh "auto" icon slot so the
    // preselection can pick this week's feast icon. Archived weeks below
    // reload iconManual/iconTransform from disk.
    state.iconManual = false;
    state.iconTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    state.currentGalleryId = null;
    state.iconImage = null;
    state._iconDataUrl = null;
    const key = getWeekKey(monday);
    if (hasArchiveEntry(key)) {
        loadWeekFromArchive(key);
    } else {
        // Clear last week's auto-filled feasts so they don't leak into today's.
        clearAutoFilledFeasts();
    }
    applyAutoIconPreselection();
    updateUI();
    renderDayDetails();
    renderWeekFeastHints();
    document.getElementById('fastingMode').checked = state.fastingMode;
    applyLockState();
    saveToLocalStorage();
}

function navigateWeeks(deltaWeeks) {
    // Persist whatever is currently on screen under the current week key
    snapshotCurrentWeekToArchive();

    // Move to the target week
    state.currentWeekStart.setDate(state.currentWeekStart.getDate() + deltaWeeks * 7);
    const key = getWeekKey(state.currentWeekStart);

    if (hasArchiveEntry(key)) {
        // Archived week — load exactly what was planned for that week.
        loadWeekFromArchive(key);
    } else {
        // Fresh week — reset the icon to "auto" so preselection can run below,
        // rather than carrying over the previous week's chosen icon.
        state.iconManual = false;
        state.iconTransform = { scale: 1, offsetX: 0, offsetY: 0 };
        state.currentGalleryId = null;
        state.iconImage = null;
        state._iconDataUrl = null;
        if (isWeekFullyPast(state.currentWeekStart)) {
            // Past week with no archive — show empty so we don't pretend the
            // current-week program was actually used that week.
            resetCurrentWeekToEmpty();
        } else {
            // Future / current week with no archive: keep events (as a template)
            // but clear feast names that were auto-filled for the *previous* week
            // so they don't leak into the new week. User-typed names survive.
            clearAutoFilledFeasts();
        }
    }

    applyAutoIconPreselection();
    updateUI();
    renderDayDetails();
    renderWeekFeastHints();
    document.getElementById('fastingMode').checked = state.fastingMode;
    applyLockState();
    saveToLocalStorage();
}

function resetCurrentWeekToEmpty() {
    state.events = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
    state.feasts = { monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: '' };
    state.autoFilledFeasts = { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false };
}

// Clear only feasts that were auto-filled (per autoFilledFeasts). Leaves user
// edits alone. Used on fresh-week navigation so last week's auto names don't
// bleed into this week.
function clearAutoFilledFeasts() {
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
        if (state.autoFilledFeasts[day]) {
            state.feasts[day] = '';
            state.autoFilledFeasts[day] = false;
        }
    });
}

function updateUI() {
    const end = new Date(state.currentWeekStart);
    end.setDate(end.getDate() + 6);

    const display = `${state.currentWeekStart.getDate()}. ${monthNames[state.currentWeekStart.getMonth()]} – ${end.getDate()}. ${monthNames[end.getMonth()]}`;
    document.getElementById('weekDisplay').textContent = display;

    updatePreview();
}

function handleIconUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const src = event.target.result;
        const id = addToGallery(src, file.name.replace(/\.[^.]+$/, ''));
        state.currentGalleryId = id;
        state.iconManual = true;
        state.iconTransform = { scale: 1, offsetX: 0, offsetY: 0 };
        const img = new Image();
        img.onload = () => {
            state.iconImage = img;
            state._iconDataUrl = src; // cache so we don't re-encode on every save
            updatePreview();
            saveToLocalStorage();
            refreshEditIconBtnState();
        };
        img.onerror = () => {
            state.currentGalleryId = null;
            alert('Nepodarilo sa načítať nahraný súbor.');
            refreshEditIconBtnState();
        };
        img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function handleGalleryUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const src = event.target.result;
        addToGallery(src, file.name.replace(/\.[^.]+$/, ''));
        renderGallery();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function loadStandardWeek() {
    if (!guardEditable()) return;
    state.events = {
        monday: [],
        tuesday: ['16:00 Katechéza'],
        wednesday: ['6:00 sv. Liturgia'],
        thursday: ['7:00 sv. Liturgia', '16:00 Zemplínske Jastrabie'],
        friday: ['7:00 sv. Liturgia'],
        saturday: ['8:00 sv. Liturgia', '14:00 Kačanov', '17:00 Večerňa a spoveď'],
        sunday: ['9:00 sv. Liturgia', '13:00 Nedeľná škola']
    };
    state.dayTypes = {
        monday: 'non-fasting',
        tuesday: 'non-fasting',
        wednesday: 'fasting',
        thursday: 'non-fasting',
        friday: 'fasting',
        saturday: 'non-fasting',
        sunday: 'celebration'
    };
    renderDayDetails();
    updatePreview();
    saveToLocalStorage();
}

function loadFastingWeek() {
    if (!guardEditable()) return;
    state.events = {
        monday: [],
        tuesday: [],
        wednesday: ['16:30 Liturgia vopred posv. darov'],
        thursday: ['7:00 sv. Liturgia'],
        friday: ['16:30 Liturgia vopred posv. darov'],
        saturday: ['8:00 sv. Liturgia', '14:00 Kačanov', '17:00 Večerňa a spoveď'],
        sunday: ['9:00 sv. Liturgia', '13:00 Nedeľná škola']
    };
    state.feasts = {
        monday: '', tuesday: '', wednesday: '', thursday: '',
        friday: '', saturday: '', sunday: ''
    };
    state.dayTypes = {
        monday: 'fasting',
        tuesday: 'fasting',
        wednesday: 'fasting',
        thursday: 'non-fasting',
        friday: 'fasting',
        saturday: 'non-fasting',
        sunday: 'celebration'
    };
    state.fastingMode = true;
    document.getElementById('fastingMode').checked = true;
    renderDayDetails();
    updatePreview();
    saveToLocalStorage();
}

function clearAllEvents() {
    if (!guardEditable()) return;
    state.events = {
        monday: [], tuesday: [], wednesday: [], thursday: [],
        friday: [], saturday: [], sunday: []
    };
    state.feasts = {
        monday: '', tuesday: '', wednesday: '', thursday: '',
        friday: '', saturday: '', sunday: ''
    };
    state.dayTypes = {
        monday: 'non-fasting', tuesday: 'non-fasting', wednesday: 'fasting',
        thursday: 'non-fasting', friday: 'fasting', saturday: 'non-fasting', sunday: 'celebration'
    };
    renderDayDetails();
    updatePreview();
    saveToLocalStorage();
}

function renderDayDetails() {
    const eventsList = document.getElementById('eventsList');
    const feastInput = document.getElementById('dayFeastName');
    const currentEvents = state.events[state.currentDay];
    const locked = isCurrentWeekLocked();

    // Update feast input
    feastInput.value = state.feasts[state.currentDay];
    feastInput.disabled = locked;

    // Update day type radio buttons
    const currentDayType = state.dayTypes[state.currentDay];
    document.querySelectorAll('input[name="dayType"]').forEach(radio => {
        radio.checked = radio.value === currentDayType;
        radio.disabled = locked;
    });

    // Update events list
    if (locked && currentEvents.length === 0) {
        eventsList.innerHTML = '<p class="events-empty-locked">Žiadne udalosti pre tento deň.</p>';
        return;
    }

    eventsList.innerHTML = currentEvents.map((event, index) => {
        const safeValue = escapeHtml(event);
        if (locked) {
            return `
                <div class="event-item event-item--locked" data-index="${index}">
                    <span class="event-handle" aria-hidden="true">🔒</span>
                    <input type="text" value="${safeValue}" readonly>
                </div>
            `;
        }
        return `
            <div class="event-item" draggable="true" data-index="${index}">
                <span class="event-handle" aria-hidden="true">☰</span>
                <input type="text" value="${safeValue}" onchange="updateEvent(${index}, this.value)" aria-label="Udalosť ${index + 1}">
                <button onclick="removeEvent(${index})" aria-label="Zmazať udalosť ${index + 1}">🗑️</button>
            </div>
        `;
    }).join('');

    if (!locked) bindItemDragHandlers();
}

// Per-item handlers (dragstart/dragend) are bound to freshly-created DOM nodes
// each render — safe because the nodes themselves are replaced. The container's
// `dragover` listener, however, is bound ONCE at init (see
// initializeContainerDragListener) because the <div id="eventsList"> persists
// across renders and would otherwise accumulate handlers on every re-render.
function bindItemDragHandlers() {
    const list = document.getElementById('eventsList');
    list.querySelectorAll('.event-item').forEach(item => {
        item.addEventListener('dragstart', () => item.classList.add('dragging'));
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            const newOrder = Array.from(list.querySelectorAll('.event-item'))
                .map(el => el.querySelector('input').value);
            state.events[state.currentDay] = newOrder;
            updatePreview();
            saveToLocalStorage();
        });
    });
}

function initializeContainerDragListener() {
    const list = document.getElementById('eventsList');
    if (!list) return;
    list.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(list, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (!dragging) return;
        if (afterElement == null) list.appendChild(dragging);
        else list.insertBefore(dragging, afterElement);
    });
}

// ── Modal dismiss: Esc key + backdrop click ────────────────────────────────
function initializeModalDismissHandlers() {
    const modals = [
        { id: 'galleryModal',      close: closeGallery },
        { id: 'statsModal',        close: closeStats },
        { id: 'imageEditorModal',  close: closeImageEditor }
    ];

    // Backdrop click (click lands on the modal backdrop itself, not the inner content card)
    modals.forEach(({ id, close }) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
            if (e.target === el) close();
        });
    });

    // Esc closes the topmost open modal
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        for (const { id, close } of modals) {
            const el = document.getElementById(id);
            if (el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none') {
                close();
                e.stopPropagation();
                return;
            }
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.event-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function addEventToCurrentDay() {
    if (!guardEditable()) return;
    state.events[state.currentDay].push('');
    renderDayDetails();
    updatePreview();
    saveToLocalStorage();
}

function updateEvent(index, value) {
    if (!guardEditable()) { renderDayDetails(); return; }
    state.events[state.currentDay][index] = value;
    updatePreview();
    saveToLocalStorage();
}

function removeEvent(index) {
    if (!guardEditable()) return;
    state.events[state.currentDay].splice(index, 1);
    renderDayDetails();
    updatePreview();
    saveToLocalStorage();
}

function updatePreview() {
    const canvas = document.getElementById('previewCanvas');
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = canvas.width / 1200; // Base design is 1200px wide
    drawBackground(ctx, canvas, scale);

    if (state.iconImage) {
        drawIcon(ctx, canvas, scale);
    }

    drawSchedule(ctx, canvas, scale);
}

function drawBackground(ctx, canvas, scale) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    if (state.fastingMode) {
        // Purple/Violet background for fasting/Lent
        gradient.addColorStop(0, '#5b1a8a'); // Medium violet-purple
        gradient.addColorStop(1, '#2d0a52'); // Dark purple
    } else {
        // Ochre/Gold background
        gradient.addColorStop(0, '#c9b48b'); // Lighter ochre
        gradient.addColorStop(1, '#a68a54'); // Darker ochre/gold
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawIcon(ctx, canvas, scale) {
    const targetW = canvas.width * 0.6; // Slightly more than half
    const targetH = canvas.height;
    const x = canvas.width - targetW;

    ctx.save();

    // Create a clipping path for the icon or just draw it
    // We'll draw it on the right side with a fade-out to the left

    const imgAspect = state.iconImage.width / state.iconImage.height;
    const canvasAspect = targetW / targetH;

    // Base fit: "cover" the icon region. The user's iconTransform (scale/offset)
    // is layered on top so crops stay WYSIWYG between preview and export.
    let baseW, baseH;
    if (imgAspect > canvasAspect) {
        baseH = targetH;
        baseW = targetH * imgAspect;
    } else {
        baseW = targetW;
        baseH = targetW / imgAspect;
    }

    const t = state.iconTransform || { scale: 1, offsetX: 0, offsetY: 0 };
    const userScale = Math.max(0.2, Math.min(4, Number(t.scale) || 1));
    const drawW = baseW * userScale;
    const drawH = baseH * userScale;
    // offsetX/Y are stored as fractions of the icon region (-1..1), so they
    // produce the same visual pan on preview and full-res export.
    const offX = (Number(t.offsetX) || 0) * targetW;
    const offY = (Number(t.offsetY) || 0) * targetH;
    const drawX = x + (targetW - drawW) / 2 + offX;
    const drawY = (targetH - drawH) / 2 + offY;

    // Clip to the icon region so oversized/panned images don't bleed over the
    // schedule text on the left.
    ctx.beginPath();
    ctx.rect(x, 0, targetW, targetH);
    ctx.clip();

    // Draw the image
    ctx.drawImage(state.iconImage, drawX, drawY, drawW, drawH);

    // Apply a gradient mask to fade the icon into the background on the left
    const fadeGrad = ctx.createLinearGradient(x, 0, x + 200 * scale, 0);
    fadeGrad.addColorStop(0, 'rgba(166, 138, 84, 1)'); // Use the darker ochre from background
    fadeGrad.addColorStop(1, 'rgba(166, 138, 84, 0)');

    ctx.globalCompositeOperation = 'destination-out'; // This is tricky, let's just draw an overlay instead
    ctx.restore();

    // Better way: Draw an overlay gradient from left to right to blend
    const bgRgb = state.fastingMode ? '45, 10, 82' : '166, 138, 84';
    const overlay = ctx.createLinearGradient(0, 0, canvas.width, 0);
    overlay.addColorStop(0, `rgba(${bgRgb}, 1)`);
    overlay.addColorStop(0.35, `rgba(${bgRgb}, 1)`);
    overlay.addColorStop(0.6, `rgba(${bgRgb}, 0.4)`);
    overlay.addColorStop(1, `rgba(${bgRgb}, 0)`);

    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawSchedule(ctx, canvas, scale) {
    drawHeader(ctx, canvas, scale);

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const startY = 270 * scale; // Reduced from 320 to bring days closer to headline
    const dayPadding = 8 * scale; // Reduced padding between days for more compact layout

    let currentY = startY;

    days.forEach((day) => {
        const dayHeight = drawDayRow(ctx, day, currentY, canvas, scale);
        currentY += dayHeight + dayPadding;
    });
}

function drawHeader(ctx, canvas, scale) {
    // Title (Top Left)
    ctx.font = `800 ${48 * scale}px "Outfit", sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText('Pravoslávni Markovce', 70 * scale, 80 * scale);

    // Dates (Large White)
    const end = new Date(state.currentWeekStart);
    end.setDate(end.getDate() + 6);

    const dateText = `${state.currentWeekStart.getDate()}. – ${end.getDate()}. ${monthNames[end.getMonth()]}`;

    ctx.font = `900 ${90 * scale}px "Outfit", sans-serif`; // Reduced from 120
    ctx.fillStyle = '#ffffff';
    ctx.fillText(dateText, 70 * scale, 190 * scale); // Adjusted baseline from 200 to 190
}

function drawDayRow(ctx, day, y, canvas, scale) {
    const dayName = dayNames[day];
    const events = state.events[day];
    const feastName = state.feasts[day];
    const colorState = getDayState(day, events, feastName);

    // 1. Draw Day Pill
    const pillX = 70 * scale;
    const pillW = 200 * scale;
    // Make pill smaller for empty days
    const isEmpty = events.length === 0 && !feastName;
    const pillH = isEmpty ? 50 * scale : 80 * scale;

    ctx.fillStyle = colorState.pillBg;
    ctx.beginPath();
    ctx.roundRect(pillX, y, pillW, pillH, 40 * scale);
    ctx.fill();

    ctx.font = `bold ${28 * scale}px "Outfit", sans-serif`;
    ctx.fillStyle = colorState.pillTextColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dayName, pillX + pillW / 2, y + pillH / 2);
    ctx.textAlign = 'left';

    // Track the height of this day row
    let rowHeight = pillH;

    // 2. Draw Events Box (next to pill)
    if (events.length > 0 || feastName) {
        const boxX = pillX + pillW + 20 * scale;

        // Calculate dynamic width (hug content)
        let maxTextWidth = 0;

        // Font sizes for measurement
        const feastFont = `700 ${22 * scale}px "Outfit", sans-serif`;
        const boldEventFont = `bold ${38 * scale}px "Outfit", sans-serif`;
        const normalEventFont = `600 ${38 * scale}px "Outfit", sans-serif`;

        // Measure Feast Name
        if (feastName) {
            ctx.font = feastFont;
            maxTextWidth = Math.max(maxTextWidth, ctx.measureText('☦ ' + feastName.toUpperCase()).width);
        }

        // Measure Events
        events.forEach(event => {
            const timePart = event.split(' ')[0];
            const textPart = event.substring(timePart.length);

            ctx.font = boldEventFont;
            const timeW = ctx.measureText(timePart).width;
            ctx.font = normalEventFont;
            const textW = ctx.measureText(textPart).width;

            maxTextWidth = Math.max(maxTextWidth, timeW + 10 * scale + textW);
        });

        const boxW = maxTextWidth + 60 * scale; // Extra padding for larger scale

        // Calculate box height based on items
        let itemCount = events.length;
        if (feastName) itemCount += 1;
        const boxH = Math.max(80 * scale, itemCount * 50 * scale + 25 * scale);

        ctx.fillStyle = colorState.boxBg;
        ctx.beginPath();
        ctx.roundRect(boxX, y, boxW, boxH, 25 * scale);
        ctx.fill();

        let textY = y + 40 * scale;

        // Draw Feast Name if present
        if (feastName) {
            ctx.font = feastFont;
            ctx.fillStyle = colorState.feastColor;
            ctx.fillText('☦ ' + feastName.toUpperCase(), boxX + 25 * scale, textY);
            textY += 45 * scale;
        }

        // Draw Events
        events.forEach(event => {
            const timePart = event.split(' ')[0];
            const textPart = event.substring(timePart.length);

            ctx.font = boldEventFont;
            ctx.fillStyle = colorState.timeColor;
            ctx.fillText(timePart, boxX + 25 * scale, textY);

            ctx.font = normalEventFont;
            ctx.fillStyle = colorState.textColor;
            ctx.fillText(textPart, boxX + 35 * scale + ctx.measureText(timePart).width, textY);

            textY += 50 * scale;
        });

        // Update row height to be the maximum of pill height or box height
        rowHeight = Math.max(pillH, boxH);
    }

    // Return the height of this row so the next day can be positioned correctly
    return rowHeight;
}

function getDayState(day, events, feastName) {
    const dayType = state.dayTypes[day];

    const hasImportant = feastName || events.some(e =>
        e.toLowerCase().includes('liturgia') ||
        e.toLowerCase().includes('navečerie') ||
        e.toLowerCase().includes('sviatok')
    );

    // Pill Background based on day type
    let pillBg = '#F4D03F'; // Yellow for non-fasting (default)
    let pillTextColor = '#1a1a1a'; // Dark for yellow background

    if (dayType === 'fasting') {
        pillBg = '#6200ea'; // Deep Purple for fasting
        pillTextColor = '#ffffff';
    }
    if (dayType === 'celebration') {
        pillBg = '#e63946'; // Red for celebration
        pillTextColor = '#ffffff';
    }

    // Box Background
    let boxBg = 'rgba(255, 255, 255, 0.9)'; // White default
    if (dayType === 'celebration' || hasImportant) boxBg = 'rgba(255, 250, 240, 0.95)'; // Cream/Goldish for important
    if (dayType === 'fasting' && !hasImportant) boxBg = 'rgba(243, 229, 245, 0.9)'; // Very light purple

    // Colors for text elements
    let timeColor = '#1a1a1a'; // Dark for normal days
    let feastColor = '#d87e1f'; // Orange/Gold for feast names

    if (dayType === 'celebration' || hasImportant) {
        timeColor = '#b71c1c'; // Red for important events
        feastColor = '#b71c1c'; // Red for important feasts
    }

    return {
        pillBg: pillBg,
        pillTextColor: pillTextColor,
        boxBg: boxBg,
        timeColor: timeColor,
        textColor: '#1a1a1a',
        feastColor: feastColor
    };
}

function generateImage() {
    // Create a temporary high-resolution canvas for export
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1200;
    exportCanvas.height = 1200;
    const ctx = exportCanvas.getContext('2d');

    // Draw on the export canvas at full resolution
    const scale = 1; // 1200 / 1200 = 1
    ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);

    drawBackground(ctx, exportCanvas, scale);

    if (state.iconImage) {
        drawIcon(ctx, exportCanvas, scale);
    }

    drawSchedule(ctx, exportCanvas, scale);

    // Generate filename and download
    const end = new Date(state.currentWeekStart);
    end.setDate(end.getDate() + 6);

    const fileName = `rozpis_${state.currentWeekStart.getDate()}_${end.getDate()}_${monthNames[end.getMonth()]}.png`;

    const link = document.createElement('a');
    link.download = fileName;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}

// ── Past-week locking ──────────────────────────────────────────────────────
// Session-only override: weeks unlocked via the Odomknúť button while the tab is open.
const sessionUnlockedWeeks = new Set();

function isWeekFullyPast(weekStart) {
    if (!weekStart) return false;
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end < new Date();
}

function isCurrentWeekLocked() {
    if (!state.currentWeekStart) return false;
    if (!isWeekFullyPast(state.currentWeekStart)) return false;
    return !sessionUnlockedWeeks.has(currentWeekKey());
}

function unlockCurrentWeek() {
    if (!isCurrentWeekLocked()) return;
    const ok = confirm('Tento týždeň už prešiel. Naozaj chcete odomknúť minulý týždeň pre úpravu?\n\nZmeny ovplyvnia ročné štatistiky.');
    if (!ok) return;
    sessionUnlockedWeeks.add(currentWeekKey());
    applyLockState();
}

function applyLockState() {
    const locked = isCurrentWeekLocked();
    document.body.classList.toggle('week-locked', locked);

    const banner = document.getElementById('weekLockBanner');
    if (banner) banner.style.display = locked ? 'flex' : 'none';

    // Disable specific form controls directly so keyboard nav is also blocked
    const toToggle = ['dayFeastName', 'fastingMode'];
    toToggle.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = locked;
    });
    document.querySelectorAll('input[name="dayType"]').forEach(r => r.disabled = locked);

    // Re-render day details so event inputs pick up read-only state
    renderDayDetails();
}

function guardEditable(silent) {
    if (isCurrentWeekLocked()) {
        if (!silent) {
            // Subtle nudge — a banner + alert would be noisy, so just flash the banner.
            const banner = document.getElementById('weekLockBanner');
            if (banner) {
                banner.classList.remove('flash');
                // force reflow to restart animation
                void banner.offsetWidth;
                banner.classList.add('flash');
            }
        }
        return false;
    }
    return true;
}
// ───────────────────────────────────────────────────────────────────────────

// ── Stats ──────────────────────────────────────────────────────────────────
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const FULL_MONTH_NAMES = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún',
    'Júl', 'August', 'September', 'Október', 'November', 'December'];

// Category groups — the order here is also the display order in the stats modal.
const CATEGORY_GROUPS = [
    { key: 'liturgies',  label: 'Liturgie' },
    { key: 'vespers',    label: 'Večerné bohoslužby' },
    { key: 'sacraments', label: 'Sväté tajiny a obrady' },
    { key: 'education',  label: 'Katechéza a modlitby' },
    { key: 'other',      label: 'Iné', isFallback: true }
];

// Individual categories — **order matters**: first match wins, so more specific
// patterns (e.g. "Liturgia vopred posv. darov", "Veľká večerňa") must come
// before broader ones (plain "Liturgia", plain "Večerňa").
const CATEGORIES = [
    // --- Liturgie ---
    { key: 'presanctified', group: 'liturgies', label: 'Liturgia vopred posv. darov',
      test: t => /vopred/.test(t) && /liturgia|\blit\./.test(t) },
    { key: 'kacanov',       group: 'liturgies', label: 'Kačanov',
      test: t => /kačanov/.test(t) },
    { key: 'jastrabie',     group: 'liturgies', label: 'Zemplínske Jastrabie',
      test: t => /jastrabie/.test(t) },
    { key: 'regular',       group: 'liturgies', label: 'Sv. Liturgia (Markovce)',
      test: t => /liturgia|\blit\./.test(t) },

    // --- Večerné bohoslužby --- (must precede "spoveď" so "Večerňa a spoveď" counts here)
    { key: 'great_vespers', group: 'vespers', label: 'Veľká večerňa',
      test: t => /(veľká|velka)\s+(večerň|vecern)/.test(t) },
    { key: 'povecerie',     group: 'vespers', label: 'Povečerie',
      test: t => /povečer|povecer/.test(t) },
    { key: 'vespers',       group: 'vespers', label: 'Večerňa',
      test: t => /večerň|vecern/.test(t) },
    { key: 'utiereň',       group: 'vespers', label: 'Utiereň',
      test: t => /utiereň|utieren|utreň|utren/.test(t) },

    // --- Sväté tajiny a obrady ---
    { key: 'baptism',     group: 'sacraments', label: 'Krst',
      test: t => /\bkrst/.test(t) },
    { key: 'wedding',     group: 'sacraments', label: 'Sobáš / Svadba',
      test: t => /sobáš|sobas|svadba/.test(t) },
    { key: 'funeral',     group: 'sacraments', label: 'Pohreb',
      test: t => /pohreb/.test(t) },
    { key: 'panychida',   group: 'sacraments', label: 'Panychida / Parastas',
      test: t => /panych|panachid|parastas/.test(t) },
    { key: 'myrovanie',   group: 'sacraments', label: 'Myrovanie / Pomazanie',
      test: t => /myrovan|pomazan/.test(t) },
    { key: 'confession',  group: 'sacraments', label: 'Spoveď',
      test: t => /spoveď|spoved/.test(t) },

    // --- Katechéza a modlitby ---
    { key: 'sunday_school', group: 'education', label: 'Nedeľná škola',
      test: t => /nedeľná\s+škola|nedelna\s+skola|nedeľ.*škol/.test(t) },
    { key: 'catechism',     group: 'education', label: 'Katechéza',
      test: t => /katech/.test(t) },
    { key: 'moleben',       group: 'education', label: 'Moleben / Akafist',
      test: t => /moleben|akafist/.test(t) }
];

// Keep a quick lookup of which sub-keys belong to the "Liturgie" group —
// used to keep the hero number and month table liturgy-focused.
const LITURGY_KEYS = new Set(
    CATEGORIES.filter(c => c.group === 'liturgies').map(c => c.key)
);

function categorizeEvent(eventText) {
    if (!eventText) return null;
    const t = eventText.toLowerCase();
    for (const cat of CATEGORIES) {
        if (cat.test(t)) return cat;
    }
    return null;
}

function computeStats(year) {
    // Initialise a zeroed group/sub structure so the UI layout stays stable
    // even for years with no data yet.
    const groups = {};
    CATEGORY_GROUPS.forEach(g => {
        groups[g.key] = { label: g.label, total: 0, subs: {}, isFallback: !!g.isFallback };
    });
    CATEGORIES.forEach(c => {
        groups[c.group].subs[c.key] = { label: c.label, count: 0 };
    });

    const stats = {
        year,
        totalLiturgies: 0,                // hero number — Liturgie group only
        totalEvents: 0,                    // everything categorized + uncategorized (non-empty)
        byCategory: { regular: 0, presanctified: 0, kacanov: 0, jastrabie: 0 },  // kept for month table
        byMonth: Array.from({ length: 12 }, () => ({ total: 0, regular: 0, presanctified: 0, kacanov: 0, jastrabie: 0 })),
        weeks: [],
        archivedWeeksTotal: 0,
        groups
    };

    Object.keys(state.archive).sort().forEach(weekKey => {
        const entry = state.archive[weekKey];
        const weekStart = parseWeekKey(weekKey);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        // Does this week touch the selected year at all?
        const touchesYear = weekStart.getFullYear() === year || weekEnd.getFullYear() === year;
        if (!touchesYear) return;

        stats.archivedWeeksTotal++;

        let weekLiturgyCount = 0;
        DAY_KEYS.forEach((dayKey, idx) => {
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + idx);
            // Attribute each day's events to that day's year — handles week crossing year boundary
            if (dayDate.getFullYear() !== year) return;
            const dayEvents = (entry.events && entry.events[dayKey]) || [];
            const month = dayDate.getMonth();
            dayEvents.forEach(ev => {
                if (!ev || !String(ev).trim()) return;
                stats.totalEvents++;
                const cat = categorizeEvent(ev);
                if (cat) {
                    const g = stats.groups[cat.group];
                    g.total++;
                    g.subs[cat.key].count++;
                    if (LITURGY_KEYS.has(cat.key)) {
                        stats.totalLiturgies++;
                        stats.byCategory[cat.key]++;
                        stats.byMonth[month].total++;
                        stats.byMonth[month][cat.key]++;
                        weekLiturgyCount++;
                    }
                } else {
                    // Uncategorized → "Iné" bucket, aggregated by the event text so
                    // the user can see what keywords are still missing from the rules.
                    const g = stats.groups.other;
                    const text = String(ev).trim();
                    const key = text.toLowerCase();
                    g.total++;
                    g.subs[key] = g.subs[key] || { label: text, count: 0 };
                    g.subs[key].count++;
                }
            });
        });

        stats.weeks.push({
            weekKey,
            weekStart,
            weekEnd,
            count: weekLiturgyCount
        });
    });

    return stats;
}

function openStats() {
    // Flush current week into archive so today's edits count
    snapshotCurrentWeekToArchive();
    statsYear = new Date().getFullYear();
    renderStats();
    document.getElementById('statsModal').style.display = 'flex';
}

function closeStats() {
    document.getElementById('statsModal').style.display = 'none';
}

function changeStatsYear(delta) {
    statsYear += delta;
    renderStats();
}

function formatWeekRange(start, end) {
    const sameYear = start.getFullYear() === end.getFullYear();
    const startStr = `${start.getDate()}. ${monthNames[start.getMonth()]}${sameYear ? '' : ' ' + start.getFullYear()}`;
    const endStr = `${end.getDate()}. ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
    return `${startStr} – ${endStr}`;
}

function jumpToWeek(weekKey) {
    snapshotCurrentWeekToArchive();
    state.currentWeekStart = parseWeekKey(weekKey);
    if (hasArchiveEntry(weekKey)) {
        loadWeekFromArchive(weekKey);
    } else {
        state.iconManual = false;
        state.iconTransform = { scale: 1, offsetX: 0, offsetY: 0 };
        state.currentGalleryId = null;
        state.iconImage = null;
        state._iconDataUrl = null;
        clearAutoFilledFeasts();
    }
    applyAutoIconPreselection();
    saveToLocalStorage();
    updateUI();
    renderDayDetails();
    renderWeekFeastHints();
    document.getElementById('fastingMode').checked = state.fastingMode;
    applyLockState();
    closeStats();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Lower-case + strip combining diacritic marks so text search can match across
// Slovak/Russian transliterations ("pôst" ↔ "post", "Ján" ↔ "jan").
function foldText(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function renderStats() {
    const stats = computeStats(statsYear);

    document.getElementById('statsYearDisplay').textContent = statsYear;

    // --- Group accordion (one <details> per group) ---
    const groupsHtml = CATEGORY_GROUPS.map(gMeta => {
        const g = stats.groups[gMeta.key];
        const open = expandedStatsGroups.has(gMeta.key);
        let bodyHtml;
        if (gMeta.isFallback) {
            // "Iné" — aggregate unique event texts, sort by count desc, cap the list.
            const entries = Object.values(g.subs).sort((a, b) => b.count - a.count);
            if (!entries.length) {
                bodyHtml = '<p class="stats-empty-sub">Žiadne nezaradené udalosti.</p>';
            } else {
                const MAX = 12;
                const shown = entries.slice(0, MAX);
                const rest = entries.slice(MAX);
                const restSum = rest.reduce((s, e) => s + e.count, 0);
                bodyHtml = shown.map(e =>
                    `<div class="stats-line"><span>${escapeHtml(e.label)}</span><strong>${e.count}</strong></div>`
                ).join('');
                if (rest.length) {
                    bodyHtml += `<div class="stats-line stats-line-muted"><span>… a ${rest.length} ďalších</span><strong>${restSum}</strong></div>`;
                }
                bodyHtml += `<p class="stats-fallback-hint">Udalosti, ktoré nezodpovedajú žiadnej kategórii. Ak by niektorá mala byť v niektorej kategórii, doplníme pravidlo.</p>`;
            }
        } else {
            // Defined subcategories — keep them in configured order.
            const subKeys = CATEGORIES.filter(c => c.group === gMeta.key).map(c => c.key);
            bodyHtml = subKeys.map(k => {
                const s = g.subs[k];
                return `<div class="stats-line${s.count === 0 ? ' stats-line-muted' : ''}"><span>${escapeHtml(s.label)}</span><strong>${s.count}</strong></div>`;
            }).join('');
        }

        return `
            <details class="stats-group" data-group="${gMeta.key}"${open ? ' open' : ''}>
                <summary class="stats-group-header">
                    <span class="stats-group-toggle" aria-hidden="true">▶</span>
                    <span class="stats-group-label">${escapeHtml(gMeta.label)}</span>
                    <span class="stats-group-total">${g.total}</span>
                </summary>
                <div class="stats-group-body">${bodyHtml}</div>
            </details>
        `;
    }).join('');

    // --- Per-week jump list ---
    const weeksList = stats.weeks.length
        ? stats.weeks.map(w => `
            <div class="stats-week-item">
                <span class="stats-week-date">${formatWeekRange(w.weekStart, w.weekEnd)}</span>
                <span class="stats-week-count">${w.count} lit.</span>
                <button class="stats-week-jump" onclick="jumpToWeek('${w.weekKey}')">Otvoriť</button>
            </div>
        `).join('')
        : `<p class="stats-empty">Žiadne archivované týždne pre rok ${statsYear}.</p>`;

    const content = document.getElementById('statsContent');
    content.innerHTML = `
        <div class="stats-summary">
            <div class="stats-total">
                <div class="stats-total-number">${stats.totalLiturgies}</div>
                <div class="stats-total-label">liturgií v roku ${statsYear}</div>
                <div class="stats-total-sub">${stats.totalEvents} bohoslužieb a udalostí celkom<br>${stats.archivedWeeksTotal} archivovaných týždňov</div>
            </div>
            <div class="stats-groups">${groupsHtml}</div>
        </div>
        <div class="stats-section">
            <h3>Liturgie po mesiacoch</h3>
            <div class="stats-month-table-wrap">
                <table class="stats-month-table">
                    <thead>
                        <tr>
                            <th>Mesiac</th>
                            <th>Spolu</th>
                            <th>Sv. lit.</th>
                            <th>Vopred</th>
                            <th>Kač.</th>
                            <th>Jastr.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.byMonth.map((m, i) => `
                            <tr class="${m.total === 0 ? 'empty' : ''}">
                                <td>${FULL_MONTH_NAMES[i]}</td>
                                <td><strong>${m.total}</strong></td>
                                <td>${m.regular}</td>
                                <td>${m.presanctified}</td>
                                <td>${m.kacanov}</td>
                                <td>${m.jastrabie}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        <div class="stats-section">
            <h3>Archivované týždne (${stats.weeks.length})</h3>
            <div class="stats-week-list">${weeksList}</div>
        </div>
    `;

    // Sync open/closed state back to the expanded set on user toggle so it
    // survives year-change re-renders.
    content.querySelectorAll('.stats-group').forEach(el => {
        el.addEventListener('toggle', () => {
            const key = el.dataset.group;
            if (el.open) expandedStatsGroups.add(key);
            else expandedStatsGroups.delete(key);
        });
    });
}
// ───────────────────────────────────────────────────────────────────────────

// ── Week feast hints (sidebar info panel) ──────────────────────────────────
// Surfaces the big feasts of the current week so the priest/deacon knows what
// to expect when they open a week (e.g. "Thu: St. George, Sat: Apostle James").
function renderWeekFeastHints() {
    const container = document.getElementById('weekFeastHints');
    if (!container) return;
    const { all, byDay } = weekFeastRecommendations();
    if (!all.length) {
        container.innerHTML = `<p class="week-feasts-empty">Žiadne väčšie sviatky v tomto týždni.</p>`;
        return;
    }
    const dayLabels = {
        monday: 'Po', tuesday: 'Ut', wednesday: 'St',
        thursday: 'Št', friday: 'Pi', saturday: 'So', sunday: 'Ne'
    };
    // Show only celebrations / fasting-major / MAJOR_MOVABLE / TWELVE_GREAT_FIXED
    const notable = all.filter(f =>
        orthodoxCalendar.feastRank(f) >= 40
        || orthodoxCalendar.MAJOR_MOVABLE.has(f.id)
        || orthodoxCalendar.TWELVE_GREAT_FIXED.has(f.id)
    );
    if (!notable.length) {
        container.innerHTML = `<p class="week-feasts-empty">Žiadne väčšie sviatky v tomto týždni.</p>`;
        return;
    }
    const calendarLabel = state.calendarStyle === 'julian' ? 'Juliánsky (starý)' : 'Antiochijský (nový)';
    const rows = notable.map(f => {
        const dLabel = dayLabels[f.day] || '';
        const dateStr = `${f.date.getDate()}. ${monthNames[f.date.getMonth()]}`;
        return `
            <li class="week-feast-item">
                <span class="week-feast-day">${dLabel} · ${dateStr}</span>
                <span class="week-feast-name">☦ ${escapeHtml(f.name)}</span>
            </li>
        `;
    }).join('');
    container.innerHTML = `
        <div class="week-feasts-header">
            <span class="week-feasts-title">Sviatky týždňa</span>
            <span class="week-feasts-calendar">${escapeHtml(calendarLabel)}</span>
        </div>
        <ul class="week-feasts-list">${rows}</ul>
    `;
}

// ── Image editor (scale / crop) ────────────────────────────────────────────
// Lightweight on-canvas editor: live preview at icon-region aspect ratio with
// scale slider + draggable pan. Persists into state.iconTransform per-week.
const imageEditor = {
    canvas: null,
    ctx: null,
    draftScale: 1,
    draftOffsetX: 0,
    draftOffsetY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartOffsetX: 0,
    dragStartOffsetY: 0,
    // Match aspect ratio of the icon region on the export (0.6 * 1200 × 1200)
    editorWidth: 480,
    editorHeight: 600,
    initialized: false
};

function openImageEditor() {
    if (!state.iconImage) {
        alert('Najprv vyberte alebo nahrajte ikonu.');
        return;
    }
    if (isCurrentWeekLocked()) {
        alert('Tento týždeň je uzamknutý. Odomknite ho pre úpravy.');
        return;
    }
    const modal = document.getElementById('imageEditorModal');
    if (!modal) return;

    // Copy current transform into the draft so Cancel can discard changes.
    imageEditor.draftScale = state.iconTransform.scale || 1;
    imageEditor.draftOffsetX = state.iconTransform.offsetX || 0;
    imageEditor.draftOffsetY = state.iconTransform.offsetY || 0;

    if (!imageEditor.initialized) initializeImageEditor();

    modal.style.display = 'flex';
    syncImageEditorControls();
    renderImageEditor();
}

function closeImageEditor() {
    const modal = document.getElementById('imageEditorModal');
    if (modal) modal.style.display = 'none';
}

function initializeImageEditor() {
    const canvas = document.getElementById('imageEditorCanvas');
    if (!canvas) return;
    imageEditor.canvas = canvas;
    imageEditor.ctx = canvas.getContext('2d');

    const scaleInput = document.getElementById('imageEditorScale');
    if (scaleInput) {
        scaleInput.addEventListener('input', (e) => {
            imageEditor.draftScale = Number(e.target.value);
            // Shrinking the image can leave the stored offset past the new
            // max-offset range — re-clamp so the view doesn't jump at apply.
            clampOffsetsToScale();
            updateScaleLabel();
            renderImageEditor();
        });
    }

    // Drag to pan. Offsets are clamped based on current scale so the image can
    // never be panned entirely outside the clip region (see clampOffsetsToScale).
    const onDown = (clientX, clientY) => {
        imageEditor.dragging = true;
        imageEditor.dragStartX = clientX;
        imageEditor.dragStartY = clientY;
        imageEditor.dragStartOffsetX = imageEditor.draftOffsetX;
        imageEditor.dragStartOffsetY = imageEditor.draftOffsetY;
    };
    const onMove = (clientX, clientY) => {
        if (!imageEditor.dragging) return;
        const rect = canvas.getBoundingClientRect();
        const dxFrac = (clientX - imageEditor.dragStartX) / rect.width;
        const dyFrac = (clientY - imageEditor.dragStartY) / rect.height;
        imageEditor.draftOffsetX = imageEditor.dragStartOffsetX + dxFrac;
        imageEditor.draftOffsetY = imageEditor.dragStartOffsetY + dyFrac;
        clampOffsetsToScale();
        renderImageEditor();
    };
    const onUp = () => { imageEditor.dragging = false; };

    canvas.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onUp);
    // If focus leaves the window mid-drag (alt-tab, iframe focus) we'd never
    // see mouseup — drop dragging state defensively.
    window.addEventListener('blur', onUp);

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        // Prevent the default (scroll/zoom) only once a single-finger drag starts;
        // otherwise multi-touch gestures / scrolls over the canvas are blocked
        // unnecessarily on mobile.
        e.preventDefault();
        onDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
        // Only eat the event while we're actively dragging — otherwise let the
        // browser scroll the modal body as usual.
        if (!imageEditor.dragging || e.touches.length !== 1) return;
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('touchcancel', onUp);

    imageEditor.initialized = true;
}

// At scale s, an image fit to "cover" fills the clip region at s=1 and grows
// beyond it for s>1. The offset range that keeps some of the image visible is
// ±(s+1)/2 (pan by half the overflow in each direction, capped so one edge can
// just touch the opposite clip edge). For s<1 (user zoomed out) the image is
// smaller than the clip so we don't clamp below that lower bound.
function clampOffsetsToScale() {
    const s = imageEditor.draftScale;
    // Offset unit is "fraction of icon region width/height". At scale s:
    //   drawSize = baseSize * s (baseSize ≈ clip size in the smaller axis)
    //   overflow (fraction of clip) ≈ (s - 1)/2 on each side if s > 1
    //   we additionally allow up to ~0.5 of margin so user can shift
    //   the visible crop substantially even when image is tight.
    const maxOffset = Math.max(0.5, (s + 1) / 2);
    imageEditor.draftOffsetX = clamp(imageEditor.draftOffsetX, -maxOffset, maxOffset);
    imageEditor.draftOffsetY = clamp(imageEditor.draftOffsetY, -maxOffset, maxOffset);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function syncImageEditorControls() {
    const scaleInput = document.getElementById('imageEditorScale');
    if (scaleInput) scaleInput.value = imageEditor.draftScale;
    updateScaleLabel();
}

function updateScaleLabel() {
    const label = document.getElementById('imageEditorScaleValue');
    if (label) label.textContent = `${Math.round(imageEditor.draftScale * 100)}%`;
}

function renderImageEditor() {
    const canvas = imageEditor.canvas;
    const ctx = imageEditor.ctx;
    if (!canvas || !ctx || !state.iconImage) return;

    const W = imageEditor.editorWidth;
    const H = imageEditor.editorHeight;
    canvas.width = W;
    canvas.height = H;

    // Background matching the generated image so WYSIWYG holds at this step too.
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    if (state.fastingMode) {
        bgGrad.addColorStop(0, '#5b1a8a');
        bgGrad.addColorStop(1, '#2d0a52');
    } else {
        bgGrad.addColorStop(0, '#c9b48b');
        bgGrad.addColorStop(1, '#a68a54');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Fit image "cover" then apply draft transform — mirror drawIcon() so the
    // user sees exactly what the export will render.
    const imgAspect = state.iconImage.width / state.iconImage.height;
    const canvasAspect = W / H;
    let baseW, baseH;
    if (imgAspect > canvasAspect) {
        baseH = H;
        baseW = H * imgAspect;
    } else {
        baseW = W;
        baseH = W / imgAspect;
    }
    const s = imageEditor.draftScale;
    const drawW = baseW * s;
    const drawH = baseH * s;
    const offX = imageEditor.draftOffsetX * W;
    const offY = imageEditor.draftOffsetY * H;
    const drawX = (W - drawW) / 2 + offX;
    const drawY = (H - drawH) / 2 + offY;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.drawImage(state.iconImage, drawX, drawY, drawW, drawH);
    ctx.restore();

    // Crop border overlay to make the clip region obvious.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.setLineDash([]);
}

function imageEditorReset() {
    imageEditor.draftScale = 1;
    imageEditor.draftOffsetX = 0;
    imageEditor.draftOffsetY = 0;
    syncImageEditorControls();
    renderImageEditor();
}

function imageEditorApply() {
    state.iconTransform = {
        scale: imageEditor.draftScale,
        offsetX: imageEditor.draftOffsetX,
        offsetY: imageEditor.draftOffsetY
    };
    updatePreview();
    saveToLocalStorage();
    closeImageEditor();
}

// ───────────────────────────────────────────────────────────────────────────

// polyfill for roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
        if (typeof radius === 'number') radius = { tl: radius, tr: radius, br: radius, bl: radius };
        this.beginPath();
        this.moveTo(x + radius.tl, y);
        this.lineTo(x + width - radius.tr, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
        this.lineTo(x + width, y + height - radius.br);
        this.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
        this.lineTo(x + radius.bl, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
        this.lineTo(x, y + radius.tl);
        this.quadraticCurveTo(x, y, x + radius.tl, y);
        this.closePath();
        return this;
    };
}

