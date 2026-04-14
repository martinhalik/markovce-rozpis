// State management
const state = {
    currentDay: 'sunday',
    iconImage: null,
    currentGalleryId: null,
    currentWeekStart: null,
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
        dayTypes: { ...state.dayTypes },
        fastingMode: state.fastingMode,
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
    state.dayTypes = { ...defaultTypes, ...(entry.dayTypes || {}) };
    state.fastingMode = !!entry.fastingMode;
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

function loadGallery() {
    try {
        const saved = localStorage.getItem('markovce-icons-gallery');
        if (saved) galleryImages = JSON.parse(saved);
    } catch (e) {
        galleryImages = [];
    }
    // Attempt to load built-in icons from manifest (static file in /icons/)
    fetch('icons/manifest.json')
        .then(r => r.json())
        .then(manifest => {
            const existingIds = new Set(galleryImages.map(i => i.id));
            const builtins = (manifest.icons || [])
                .filter(icon => !existingIds.has(icon.id))
                .map(icon => ({ id: icon.id, name: icon.name, src: 'icons/' + icon.file, type: 'builtin' }));
            if (builtins.length) {
                galleryImages = [...builtins, ...galleryImages];
            }
        })
        .catch(() => { /* no manifest – that's fine */ });
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
    renderGallery();
    document.getElementById('galleryModal').style.display = 'flex';
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
    grid.innerHTML = galleryImages.map(img => {
        const safeName = escapeHtml(img.name);
        const safeId = escapeHtml(img.id);
        const safeSrc = escapeHtml(img.src);
        return `
            <div class="gallery-item${state.currentGalleryId === img.id ? ' selected' : ''}"
                 onclick="selectFromGallery('${safeId}')">
                <img src="${safeSrc}" alt="${safeName}" loading="lazy">
                <div class="gallery-item-name">${safeName}</div>
                ${img.type === 'uploaded'
                    ? `<button class="gallery-item-delete" onclick="deleteFromGallery(event,'${safeId}')">✕</button>`
                    : ''}
            </div>
        `;
    }).join('');
}

function selectFromGallery(id) {
    const item = galleryImages.find(i => i.id === id);
    if (!item) return;
    state.currentGalleryId = id;
    const img = new Image();
    img.onload = () => {
        state.iconImage = img;
        state._iconDataUrl = item.src; // cache so we don't re-encode on every save
        updatePreview();
        saveToLocalStorage();
    };
    img.src = item.src;
    closeGallery();
}

function deleteFromGallery(event, id) {
    event.stopPropagation();
    galleryImages = galleryImages.filter(i => i.id !== id);
    if (state.currentGalleryId === id) {
        state.currentGalleryId = null;
    }
    saveGallery();
    renderGallery();
}
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
        state.archive = parsed.archive && typeof parsed.archive === 'object' ? parsed.archive : {};

        // Restore week start date
        if (parsed.currentWeekStart) {
            state.currentWeekStart = new Date(parsed.currentWeekStart);
        }

        // Load the current week's events from archive if present; otherwise fall back to
        // the legacy top-level fields (so existing users don't lose their in-progress week),
        // and migrate that into the archive.
        const key = state.currentWeekStart ? getWeekKey(state.currentWeekStart) : null;
        if (key && hasArchiveEntry(key)) {
            loadWeekFromArchive(key);
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

        // Restore icon image
        if (parsed.iconImageData) {
            const img = new Image();
            img.onload = () => {
                state.iconImage = img;
                state._iconDataUrl = parsed.iconImageData;
                updatePreview();
            };
            img.src = parsed.iconImageData;
        }

        // Restore selected-gallery highlight so the user sees which icon they picked
        if (parsed.currentGalleryId) {
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
document.addEventListener('DOMContentLoaded', () => {
    // Load gallery
    loadGallery();

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

    // Make sure the initial week is in the archive (so it shows in stats even before any edit)
    snapshotCurrentWeekToArchive();

    updateUI();
    applyLockState();

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

    // View switcher (mobile / tablet portrait)
    initializeViewSwitcher();
}

function initializeViewSwitcher() {
    const main = document.querySelector('.main-content');
    const buttons = document.querySelectorAll('.view-switcher-btn');
    if (!main || buttons.length === 0) return;

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view; // 'editor' or 'preview'
            if (!view) return;

            buttons.forEach(b => {
                const active = b.dataset.view === view;
                b.classList.toggle('active', active);
                b.setAttribute('aria-selected', active ? 'true' : 'false');
            });

            main.classList.remove('view-editor', 'view-preview');
            main.classList.add(`view-${view}`);

            // When switching to the preview, scroll the switcher back into view
            // and repaint — the canvas may have been offscreen while hidden.
            if (view === 'preview') {
                updatePreview();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
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
    } else if (isWeekFullyPast(state.currentWeekStart)) {
        // Past week with no archive — show empty so we don't pretend the
        // current-week program was actually used that week.
        resetCurrentWeekToEmpty();
    }
    // Otherwise (future / current week with no archive): keep current in-memory
    // state as a starting template so the user can iterate week-over-week.

    updateUI();
    renderDayDetails();
    document.getElementById('fastingMode').checked = state.fastingMode;
    applyLockState();
    saveToLocalStorage();
}

function resetCurrentWeekToEmpty() {
    state.events = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
    state.feasts = { monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: '' };
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
        const img = new Image();
        img.onload = () => {
            state.iconImage = img;
            state._iconDataUrl = src; // cache so we don't re-encode on every save
            updatePreview();
            saveToLocalStorage();
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
        { id: 'galleryModal', close: closeGallery },
        { id: 'statsModal',   close: closeStats }
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

    let drawW, drawH, drawX, drawY;
    if (imgAspect > canvasAspect) {
        drawH = targetH;
        drawW = targetH * imgAspect;
        drawX = x + (targetW - drawW) / 2;
        drawY = 0;
    } else {
        drawW = targetW;
        drawH = targetW / imgAspect;
        drawX = x;
        drawY = (targetH - drawH) / 2;
    }

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
    }
    saveToLocalStorage();
    updateUI();
    renderDayDetails();
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

