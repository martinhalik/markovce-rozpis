// State management
const state = {
    currentDay: 'sunday',
    iconImage: null,
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
    }
};

// LocalStorage functions
function saveToLocalStorage() {
    try {
        const stateToSave = {
            currentDay: state.currentDay,
            currentWeekStart: state.currentWeekStart ? state.currentWeekStart.toISOString() : null,
            events: state.events,
            feasts: state.feasts,
            dayTypes: state.dayTypes,
            iconImageData: null
        };

        // Convert icon image to base64 if it exists
        if (state.iconImage) {
            const canvas = document.createElement('canvas');
            canvas.width = state.iconImage.width;
            canvas.height = state.iconImage.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(state.iconImage, 0, 0);
            stateToSave.iconImageData = canvas.toDataURL('image/png');
        }

        localStorage.setItem('markovce-rozpis-state', JSON.stringify(stateToSave));
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

        // Restore state
        state.currentDay = parsed.currentDay || 'sunday';
        state.events = parsed.events || state.events;
        state.feasts = parsed.feasts || state.feasts;
        state.dayTypes = parsed.dayTypes || state.dayTypes;

        // Restore week start date
        if (parsed.currentWeekStart) {
            state.currentWeekStart = new Date(parsed.currentWeekStart);
        }

        // Restore icon image
        if (parsed.iconImageData) {
            const img = new Image();
            img.onload = () => {
                state.iconImage = img;
                updatePreview();
            };
            img.src = parsed.iconImageData;
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
    // Try to load from localStorage first
    const loaded = loadFromLocalStorage();

    // If no saved state, set default week (current Monday)
    if (!loaded || !state.currentWeekStart) {
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
        state.currentWeekStart = new Date(today.setDate(diff));
        state.currentWeekStart.setHours(0, 0, 0, 0);
    }

    initializeEventListeners();

    // Only load standard week if no saved events exist
    if (!loaded) {
        loadStandardWeek();
    }

    updateUI();
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
            const eventText = btn.dataset.event;
            state.events[state.currentDay].push(eventText);
            renderDayDetails();
            updatePreview();
            saveToLocalStorage();
        });
    });

    // Icon upload
    document.getElementById('iconUpload').addEventListener('change', handleIconUpload);

    // Feast input
    document.getElementById('dayFeastName').addEventListener('input', (e) => {
        state.feasts[state.currentDay] = e.target.value;
        updatePreview();
        saveToLocalStorage();
    });

    // Day type selector
    document.querySelectorAll('input[name="dayType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.dayTypes[state.currentDay] = e.target.value;
            updatePreview();
            saveToLocalStorage();
        });
    });

    // Week navigation
    document.getElementById('prevWeek').addEventListener('click', () => {
        state.currentWeekStart.setDate(state.currentWeekStart.getDate() - 7);
        updateUI();
        saveToLocalStorage();
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        state.currentWeekStart.setDate(state.currentWeekStart.getDate() + 7);
        updateUI();
        saveToLocalStorage();
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
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                state.iconImage = img;
                updatePreview();
                saveToLocalStorage();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function loadStandardWeek() {
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

function clearAllEvents() {
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

    // Update feast input
    feastInput.value = state.feasts[state.currentDay];

    // Update day type radio buttons
    const currentDayType = state.dayTypes[state.currentDay];
    document.querySelectorAll('input[name="dayType"]').forEach(radio => {
        radio.checked = radio.value === currentDayType;
    });

    // Update events list
    eventsList.innerHTML = currentEvents.map((event, index) => `
        <div class="event-item" draggable="true" data-index="${index}">
            <span class="event-handle">☰</span>
            <input type="text" value="${event}" onchange="updateEvent(${index}, this.value)">
            <button onclick="removeEvent(${index})">🗑️</button>
        </div>
    `).join('');

    initializeDragAndDrop();
}

function initializeDragAndDrop() {
    const list = document.getElementById('eventsList');
    const items = list.querySelectorAll('.event-item');

    items.forEach(item => {
        item.addEventListener('dragstart', () => {
            item.classList.add('dragging');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            const newOrder = Array.from(list.querySelectorAll('.event-item')).map(item => {
                return item.querySelector('input').value;
            });
            state.events[state.currentDay] = newOrder;
            updatePreview();
            saveToLocalStorage();
        });
    });

    list.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(list, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (afterElement == null) {
            list.appendChild(dragging);
        } else {
            list.insertBefore(dragging, afterElement);
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
    state.events[state.currentDay].push('');
    renderDayDetails();
    updatePreview();
    saveToLocalStorage();
}

function updateEvent(index, value) {
    state.events[state.currentDay][index] = value;
    updatePreview();
    saveToLocalStorage();
}

function removeEvent(index) {
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
    // Ochre/Gold background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#c9b48b'); // Lighter ochre
    gradient.addColorStop(1, '#a68a54'); // Darker ochre/gold
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Optional: add a subtle mesh/texture if we had one
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
    const overlay = ctx.createLinearGradient(0, 0, canvas.width, 0);
    overlay.addColorStop(0, 'rgba(166, 138, 84, 1)');
    overlay.addColorStop(0.35, 'rgba(166, 138, 84, 1)');
    overlay.addColorStop(0.6, 'rgba(166, 138, 84, 0.4)');
    overlay.addColorStop(1, 'rgba(166, 138, 84, 0)');

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

