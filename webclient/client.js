/**
 * LORD Minimal Webclient
 *
 * Vanilla JavaScript client for Legend of the Red Dragon.
 * Connects to the game server via WebSocket with ANSI-based authentication.
 * Supports both text (ANSI) and RIP graphics modes.
 *
 * No build step, no framework - just static files served by any web server.
 */

// ── Constants ───────────────────────────────────────────────────────────

const TERM_COLS = 80;
const TERM_ROWS = 25;
const TERMINAL_FONT_FAMILY = 'Web437-IBM-VGA';

// ── State ───────────────────────────────────────────────────────────────

let socket = null;
let term = null;
let fitAddon = null;
let ripOverlay = null;
let sessionToken = null;
let sessionUsername = null;
let isAuthConnection = false;

// ── Terminal Setup ──────────────────────────────────────────────────────

async function createTerminal() {
    // Wait for the webfont before opening xterm so the initial glyph metrics are correct.
    try {
        await WebFontsAddon.loadFonts([TERMINAL_FONT_FAMILY]);
    } catch (e) {
        console.warn('Web font preload failed, continuing with fallback fonts:', e);
    }

    term = new Terminal({
        cols: TERM_COLS,
        rows: TERM_ROWS,
        cursorBlink: true,
        fontSize: 16,
        fontFamily: '"' + TERMINAL_FONT_FAMILY + '", "Courier New", monospace',
        theme: {
            background: '#000000',
            foreground: '#aaaaaa',
            cursor: '#aaaaaa',
            black: '#000000',
            red: '#aa0000',
            green: '#00aa00',
            yellow: '#aa5500',
            blue: '#0000aa',
            magenta: '#aa00aa',
            cyan: '#00aaaa',
            white: '#aaaaaa',
            brightBlack: '#555555',
            brightRed: '#ff5555',
            brightGreen: '#55ff55',
            brightYellow: '#ffff55',
            brightBlue: '#5555ff',
            brightMagenta: '#ff55ff',
            brightCyan: '#55ffff',
            brightWhite: '#ffffff',
        },
        convertEol: false,
        scrollback: 1000,
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    const container = document.getElementById('terminal-container');
    term.open(container);

    // Fit then lock to 80x25
    fitAddon.fit();
    term.resize(TERM_COLS, TERM_ROWS);

    // Forward terminal input to WebSocket
    term.onData((data) => {
        sendInput(data);
    });

    term.focus();
}

// ── WebSocket ───────────────────────────────────────────────────────────

function sendInput(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
    }
}

function sendMessage(msg) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
    }
}

function connect(token) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = protocol + '//' + location.host + '/ws';

    if (token) url += '?token=' + encodeURIComponent(token);
    // Only enable RIP on authenticated sessions - auth is always ANSI-based
    if (token && isRipEnabled()) url += '&rip=1';

    // Close any existing socket
    if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }
    }

    socket = new WebSocket(url);
    isAuthConnection = !token;

    socket.onopen = () => {
        setStatus('connected');
    };

    socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
            if (event.data.startsWith('{')) {
                try {
                    const msg = JSON.parse(event.data);
                    handleJsonMessage(msg);
                    return;
                } catch (_e) {
                    // Not JSON - treat as terminal output
                }
            }
            term.write(event.data);
        } else {
            event.data.arrayBuffer().then(buf => {
                term.write(new Uint8Array(buf));
            });
        }
    };

    socket.onclose = () => {
        setStatus('disconnected');
        // Auto-reconnect after a brief delay (unless we're in auth mode)
        if (!isAuthConnection && sessionToken) {
            setTimeout(() => {
                term.write('\r\n\x1b[1;33mReconnecting...\x1b[0m\r\n');
                connect(sessionToken);
            }, 3000);
        }
    };

    socket.onerror = () => {
        term.write('\r\n\x1b[1;31m*** Connection error ***\x1b[0m\r\n');
    };
}

function handleJsonMessage(msg) {
    // Auth success - server validated credentials via ANSI login
    if (isAuthConnection && msg.type === 'auth_success') {
        sessionToken = msg.token;
        sessionUsername = msg.username;
        saveSession();
        socket.close();
        term.reset();
        // Show logout button now that user is authenticated
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.style.display = '';
        // Reconnect with token for game session
        connect(sessionToken);
        return;
    }

    if (isAuthConnection && msg.type === 'auth_quit') {
        term.write('\r\n\x1b[0;37m*** Goodbye ***\x1b[0m\r\n');
        return;
    }

    // RIP graphics
    if (msg.type === 'rip') {
        if (ripOverlay) {
            ripOverlay.handleRipMessage(msg);
        }
        return;
    }

    // Player connect/disconnect notifications (optional display)
    if (msg.type === 'player_connect') {
        console.log('[info] Player connected:', msg.username);
        return;
    }
    if (msg.type === 'player_disconnect') {
        console.log('[info] Player disconnected:', msg.username);
        return;
    }

    // Game events - ignored in minimal client (no modern UI)
    if (msg.type === 'game_event' || msg.type === 'player_stats') {
        return;
    }
}

// ── Session Storage ─────────────────────────────────────────────────────

function saveSession() {
    try {
        localStorage.setItem('lord_session', JSON.stringify({
            token: sessionToken,
            username: sessionUsername,
        }));
    } catch (_e) { /* private browsing */ }
}

function loadSession() {
    try {
        const data = localStorage.getItem('lord_session');
        if (data) {
            const parsed = JSON.parse(data);
            sessionToken = parsed.token;
            sessionUsername = parsed.username;
        }
    } catch (_e) { /* ignore */ }
}

function clearSession() {
    sessionToken = null;
    sessionUsername = null;
    try { localStorage.removeItem('lord_session'); } catch (_e) { /* ignore */ }
}

async function validateToken(token) {
    try {
        const resp = await fetch('/api/validate?token=' + encodeURIComponent(token));
        const data = await resp.json();
        return data.valid;
    } catch (_e) {
        return false;
    }
}

// ── RIP Graphics Toggle ────────────────────────────────────────────────

function isRipEnabled() {
    try {
        return localStorage.getItem('lord_rip') === '1';
    } catch (_e) {
        return false;
    }
}

function setRipEnabled(enabled) {
    try {
        localStorage.setItem('lord_rip', enabled ? '1' : '0');
    } catch (_e) { /* ignore */ }
}

// ── RIP Overlay ─────────────────────────────────────────────────────────

/**
 * Manages the RIP graphics overlay - a canvas that sits over the terminal
 * and renders RIPscrip graphics via the riptermjs library.
 */
class MinimalRipOverlay {
    constructor(terminalContainer, termInstance, fitAddonInstance) {
        this.terminalContainer = terminalContainer;
        this.term = termInstance;
        this.fitAddon = fitAddonInstance;
        this.visible = false;
        this.ripTerm = null;
        this.fontsLoaded = false;
        this.textWindow = null;
        this._positioned = false;

        this._createOverlayDOM();

        // Handle clicks on terminal for RIP <CLICK>/<MORE> prompts
        this._mouseDownX = undefined;
        this._mouseDownY = undefined;
        this.terminalContainer.addEventListener('mousedown', (e) => {
            this._mouseDownX = e.clientX;
            this._mouseDownY = e.clientY;
        }, true);
        this.terminalContainer.addEventListener('mouseup', (e) => {
            if (!this.visible) return;
            if (e.button !== 0) return;
            if (this.terminalContainer.style.display === 'none') return;
            if (this._mouseDownX !== undefined) {
                const dx = e.clientX - this._mouseDownX;
                const dy = e.clientY - this._mouseDownY;
                if (Math.sqrt(dx * dx + dy * dy) > 5) return;
            }
            // Only send Enter if the terminal is already focused; otherwise just focus it
            // so the user can type without accidentally submitting the current prompt.
            if (document.activeElement && this.terminalContainer.contains(document.activeElement)) {
                sendInput('\r');
            }
            this.term.focus();
        }, true);

        // Global keyboard handler for when terminal is hidden (graphics-only)
        document.addEventListener('keydown', (e) => {
            if (!this.visible) return;
            if (this.terminalContainer.style.display !== 'none') return;
            if (this.gameWrapper?.querySelector('.rip-picklist-overlay')) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            let char = '';
            if (e.key.length === 1) char = e.key;
            else if (e.key === 'Enter') char = '\r';
            else if (e.key === 'Escape') char = '\x1b';
            else if (e.key === 'Backspace') char = '\b';
            if (char) sendInput(char);
        }, true);
    }

    _createOverlayDOM() {
        const tc = this.terminalContainer;
        const w = tc.offsetWidth;
        const h = tc.offsetHeight;

        this.gameWrapper = document.createElement('div');
        this.gameWrapper.id = 'rip-game-wrapper';
        this.gameWrapper.style.cssText = `position: relative; width: ${w}px; height: ${h}px;`;

        tc.parentNode.insertBefore(this.gameWrapper, tc);
        this.gameWrapper.appendChild(tc);

        this.wrapper = document.createElement('div');
        this.wrapper.id = 'rip-wrapper';
        this.wrapper.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            display: none; z-index: 10; background: #000;
        `;

        this.canvas = document.createElement('canvas');
        this.canvas.id = 'rip-canvas';
        this.canvas.width = 640;
        this.canvas.height = 350;
        this.canvas.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            image-rendering: pixelated;
        `;

        this.wrapper.appendChild(this.canvas);
        this.gameWrapper.appendChild(this.wrapper);
    }

    async _initRipTerm() {
        if (this.ripTerm) return;

        this.ripTerm = new RIPterm({
            canvasId: 'rip-canvas',
            fontsPath: '/vendor/riptermjs/fonts',
            iconsPath: '/rip/icons',
            timeInterval: 5,
            refreshInterval: 50,
        });

        this.ripTerm.onTextWindow = (tw) => this._onTextWindow(tw);
        this.ripTerm.onHostCommand = (cmd) => this._onHostCommand(cmd);
        this.ripTerm.onPickList = (list, resolve) => this._onPickList(list, resolve);

        if (!this.fontsLoaded) {
            await this.ripTerm.initFonts();
            this.fontsLoaded = true;
        }

        // Set default RIP font
        await this.ripTerm.runRIPcmd('Y', '00000100');
    }

    async handleRipMessage(msg) {
        if (msg.action === 'show') {
            this._renderQueue = (this._renderQueue || Promise.resolve())
                .then(() => this._showSection(msg.section, msg.lines))
                .catch(e => console.warn('RIP render error:', e.message));
            await this._renderQueue;
        } else if (msg.action === 'hide') {
            this.hide();
        }
    }

    async _showSection(section, lines) {
        await this._initRipTerm();
        if (!this.ripTerm) return;

        this.show();

        const ripData = lines.join('\r\n');
        const isFullSection = ripData.includes('|*');

        if (isFullSection) {
            this._hideTerminal();
        }

        const encoder = new TextEncoder();
        const bytes = encoder.encode(ripData + '\r\n');
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(bytes);
                controller.close();
            }
        });

        this.ripTerm.stop();
        await this.ripTerm.setupStream(stream);
        this.ripTerm.isRunning = true;
        try {
            await this.ripTerm.playStream();
        } catch (e) {
            console.warn(`RIP stream interrupted (${section}):`, e.message);
            return;
        }
        this.ripTerm.bgi.refresh();
    }

    show() {
        if (this.visible) return;
        this.visible = true;
        this.wrapper.style.display = 'block';
        this.gameWrapper.classList.add('rip-active');
        if (!this.gameWrapper.style.width) {
            const w = this.terminalContainer.offsetWidth;
            if (w > 0) {
                this.gameWrapper.style.width = w + 'px';
                this.gameWrapper.style.height = Math.round(w * 3 / 4) + 'px';
            }
        }
    }

    hide() {
        if (!this.visible) return;
        this.visible = false;
        this.wrapper.style.display = 'none';
        this.textWindow = null;
        this.gameWrapper.classList.remove('rip-active');
        this._restoreTerminal();
    }

    _onTextWindow(tw) {
        this.textWindow = tw;

        if (tw.width === 0 && tw.height === 0) {
            this._hideTerminal();
            return;
        }
        if (tw.width === 640 && tw.height === 350 && tw.x === 0 && tw.y === 0) {
            return;
        }

        const scaleX = this.wrapper.offsetWidth / 640;
        const scaleY = this.wrapper.offsetHeight / 350;
        const insetPx = 2;

        const left = (tw.x + insetPx) * scaleX;
        const top = (tw.y + insetPx) * scaleY;
        const clampedW = Math.min(tw.width - insetPx * 2, 640 - tw.x - insetPx * 2);
        const clampedH = Math.min(tw.height - insetPx * 2, 350 - tw.y - insetPx * 2);
        const width = clampedW * scaleX;
        const height = clampedH * scaleY;

        const fontH = tw.fontH || 8;
        const fontW = tw.fontW || 8;
        const visibleRows = Math.floor(clampedH / fontH);
        const visibleCols = Math.floor(clampedW / fontW);

        this._positionTerminal(left, top, width, height, visibleCols, visibleRows);
    }

    _onHostCommand(cmd) {
        // An empty host command (button defined with no command text) falls back
        // to carriage return - same as clicking the terminal directly.
        // This handles W1-style "Continue" buttons whose RIP data has `<>Continue<>`
        // with no trailing command (unlike W3/W4 which correctly use `<>Continue<>^m`).
        if (cmd === '') {
            cmd = '\r';
        }

        if (!cmd) return;
        // RIP host commands already encode the intended keystrokes. Appending
        // an extra Enter breaks single-key menus by immediately submitting the
        // next prompt's default action.
        sendInput(cmd);
        this.term.focus();
    }

    _onPickList(items, resolve) {
        // Create a simple pick list overlay
        const overlay = document.createElement('div');
        overlay.className = 'rip-picklist-overlay';
        const list = document.createElement('div');
        list.className = 'rip-picklist';

        items.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'rip-picklist-item';
            el.textContent = item;
            el.addEventListener('click', () => {
                overlay.remove();
                resolve(i);
            });
            list.appendChild(el);
        });

        overlay.appendChild(list);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(-1);
            }
        });
        this.gameWrapper.appendChild(overlay);
    }

    _hideTerminal() {
        const tc = this.terminalContainer;
        if (!this._positioned) {
            this._saveOriginals();
            this._positioned = true;
        }
        tc.style.display = 'none';
    }

    _positionTerminal(left, top, pixelWidth, pixelHeight, textCols, textRows) {
        const tc = this.terminalContainer;
        if (!this._positioned) {
            this._saveOriginals();
            this._positioned = true;
        }
        const wasHidden = tc.style.display === 'none';
        tc.style.display = '';
        tc.style.position = 'absolute';
        tc.style.zIndex = '20';
        tc.style.left = left + 'px';
        tc.style.top = top + 'px';
        tc.style.width = pixelWidth + 'px';
        tc.style.height = pixelHeight + 'px';
        tc.style.overflow = 'hidden';
        tc.style.border = 'none';
        tc.style.borderRadius = '0';
        tc.style.padding = '0';
        tc.style.boxSizing = 'border-box';
        requestAnimationFrame(() => {
            try {
                if (this.fitAddon) {
                    this.fitAddon.fit();
                    if (this.term.cols !== 80) {
                        this.term.resize(80, this.term.rows);
                    }
                } else {
                    this.term.resize(textCols, textRows);
                }
            } catch (_e) { /* ignore */ }
            // Auto-focus when terminal becomes visible (e.g. entering the forest
            // from a graphics-only screen like the town menu).
            if (wasHidden) {
                this.term.focus();
            }
        });
    }

    _restoreTerminal() {
        if (!this._positioned) return;
        const tc = this.terminalContainer;
        tc.style.position = this._origPosition || '';
        tc.style.zIndex = this._origZIndex || '';
        tc.style.left = this._origLeft || '';
        tc.style.top = this._origTop || '';
        tc.style.width = this._origWidth || '';
        tc.style.height = this._origHeight || '';
        tc.style.display = this._origDisplay || '';
        tc.style.overflow = this._origOverflow || '';
        tc.style.border = this._origBorder || '';
        tc.style.borderRadius = this._origBorderRadius || '';
        tc.style.padding = this._origPadding || '';
        tc.style.boxSizing = this._origBoxSizing || '';
        this._positioned = false;

        this.gameWrapper.style.width = '';
        this.gameWrapper.style.height = '';

        requestAnimationFrame(() => {
            try {
                if (this.fitAddon) {
                    this.fitAddon.fit();
                    this.term.resize(TERM_COLS, TERM_ROWS);
                }
            } catch (_e) { /* ignore */ }
        });
    }

    _saveOriginals() {
        const tc = this.terminalContainer;
        this._origWidth = tc.style.width;
        this._origHeight = tc.style.height;
        this._origPosition = tc.style.position;
        this._origZIndex = tc.style.zIndex;
        this._origLeft = tc.style.left;
        this._origTop = tc.style.top;
        this._origDisplay = tc.style.display;
        this._origOverflow = tc.style.overflow;
        this._origBorder = tc.style.border;
        this._origBorderRadius = tc.style.borderRadius;
        this._origPadding = tc.style.padding;
        this._origBoxSizing = tc.style.boxSizing;
    }
}

// ── Status Indicator ────────────────────────────────────────────────────

function setStatus(state) {
    let el = document.getElementById('status');
    if (!el) {
        el = document.createElement('div');
        el.id = 'status';
        document.body.appendChild(el);
    }
    el.className = state;
    el.textContent = state === 'connected' ? '● Connected' : '○ Disconnected';
}

// ── Initialization ──────────────────────────────────────────────────────

async function init() {
    await createTerminal();

    // Set up RIP toggle
    const ripCheckbox = document.getElementById('rip-toggle');
    ripCheckbox.checked = isRipEnabled();
    ripCheckbox.addEventListener('change', () => {
        setRipEnabled(ripCheckbox.checked);
        if (ripCheckbox.checked) {
            // Initialize RIP overlay if not already done
            if (!ripOverlay) {
                ripOverlay = new MinimalRipOverlay(
                    document.getElementById('terminal-container'),
                    term,
                    fitAddon,
                );
            }
            // Notify server
            sendMessage({ type: 'rip_toggle', enabled: true });
        } else {
            if (ripOverlay) {
                ripOverlay.hide();
            }
            sendMessage({ type: 'rip_toggle', enabled: false });
        }
    });

    // Initialize RIP overlay if RIP is already enabled
    if (isRipEnabled()) {
        ripOverlay = new MinimalRipOverlay(
            document.getElementById('terminal-container'),
            term,
            fitAddon,
        );
    }

    // Set up Logout button
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.addEventListener('click', () => {
        clearSession();
        if (socket) {
            socket.onclose = null;
            socket.close();
        }
        term.reset();
        logoutBtn.style.display = 'none';
        connect(); // Reconnect without token → ANSI auth
    });

    // Check for existing session
    loadSession();
    if (sessionToken) {
        const valid = await validateToken(sessionToken);
        if (valid) {
            logoutBtn.style.display = '';
            connect(sessionToken);
            return;
        }
        clearSession();
    }

    // No valid session - connect without token for ANSI-based auth
    connect();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        void init();
    });
} else {
    void init();
}
