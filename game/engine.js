import { getIntersection } from './math.js?v=0.3';
import { CONFIG } from './config.js?v=0.3';
import { TRACKS } from './tracks.js?v=0.3';
import { saveLapTime, getTrackData } from './storage.js?v=0.3';

// --- Game Engine ---
export class RealTimeRacer {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('game-container');
        this.trackSelect = document.getElementById('track-select');
        this.headerControls = document.getElementById('header-controls');

        // Settings Controls (trace route is always enabled)

        // Generate Internal Car Sprite
        this.carSprite = this.createCarSprite();

        // Physics State
        this.currentTrack = TRACKS.circuit;
        this.currentTrackKey = 'circuit';
        this.pos = { ...this.currentTrack.startPos };
        this.velocity = { x: 0, y: 0 };
        this.angle = this.currentTrack.startAngle;

        // Active Geometry (Smoothed)
        this.activeGeometry = { outer: [], inner: [] };

        // Cached Path2D objects for track rendering (performance optimization)
        this.trackPaths = {
            surface: null,
            outerCurb: null,
            innerCurb: null
        };

        // Cache variables for DOM to avoid unnecessary reflows
        this._lastTimeText = "";
        this._lastSpeedText = "";

        // Game State
        this.status = 'ready';
        this.startTime = 0;
        this.currentTime = 0;
        this.nextCheckpointIndex = 0; // next checkpoint to pass this lap
        this.bestLapTime = null; // Best lap time for current track
        this.activeTimers = []; // Keep track of active timeouts/intervals

        // Visuals
        this.skidMarks = [];
        this.routeTrace = [];
        this.particles = [];
        this.trailTimer = 0;

        // Input
        this.keys = { left: false, right: false }; // Only steering

        // Viewport
        this.camera = { x: 0, y: 0 };
        this.zoom = 1;

        // Performance optimization: Cache values
        this.cachedSpeed = 0;
        this.frameSkip = 0;
        this.frameTimeHistory = [];

        // Fixed timestep for smooth physics (60Hz)
        this.FIXED_DT = 1 / 60;
        this.accumulator = 0;
        this.prevPos = { x: 0, y: 0 };
        this.prevAngle = 0;
        this.timeOffsetMs = 0;

        // Detect device performance early (before track loading)
        this.qualityLevel = this.detectDevicePerformance();

        // DOM
        this.uiTime = document.getElementById('time-val');
        this.uiSpeed = document.getElementById('speed-val');
        this.bestTimeDisplay = document.getElementById('best-time-display');
        this.bestTimeVal = document.getElementById('best-time-val');
        this.modal = document.getElementById('modal');
        this.modalTitle = document.getElementById('modal-title');
        this.modalMsg = document.getElementById('modal-msg');
        this.modalLapTimes = document.getElementById('modal-lap-times');
        this.modalBestTime = document.getElementById('modal-best-time');
        this.viewRunsBtn = document.getElementById('view-runs-btn');
        this.backToMainBtn = document.getElementById('back-to-main-btn');
        this.modalMainView = document.getElementById('modal-main-view');
        this.modalRunsView = document.getElementById('modal-runs-view');
        this.sharePanel = document.getElementById('share-panel');
        this.shareBtn = document.getElementById('share-btn');
        this.startOverlay = document.getElementById('start-overlay');
        this.startLights = document.getElementById('start-lights');
        this.goMessage = document.getElementById('go-message');
        this.runHistory = [];
        this.runHistoryTimer = 0;
        this.lastSharePayload = null;
        this.shareFile = null;
        this.shareFilename = '';
        this.shareBlobPromise = null;
        this.htpModal = document.getElementById('how-to-play-modal');
        this.closeHtpBtn = document.getElementById('close-htp-btn');
        this.headerHtpBtn = document.getElementById('header-htp-btn');

        // Session race stats (sent once on session end)
        this.raceStats = { start: 0, crash: 0, win: 0 };
        this.raceEventSent = false;

        // Listeners
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
        window.addEventListener('pagehide', () => this.sendRaceEvent());

        // Track Selectors
        this.trackSelect.addEventListener('change', (e) => this.loadTrack(e.target.value));

        // Mobile workaround: native pickers ignore option[hidden]. Remove hidden options
        // before picker opens, restore after selection.
        const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
        if (isTouchDevice) {
            let hiddenOptsRestore = null;
            const removeHidden = () => {
                const opts = Array.from(this.trackSelect.querySelectorAll('option[hidden]'));
                if (opts.length) {
                    hiddenOptsRestore = opts.map(o => ({ el: o, next: o.nextSibling }));
                    hiddenOptsRestore.forEach(({ el }) => el.remove());
                }
            };
            const restoreHidden = () => {
                if (hiddenOptsRestore) {
                    hiddenOptsRestore.reverse().forEach(({ el, next }) =>
                        this.trackSelect.insertBefore(el, next));
                    hiddenOptsRestore = null;
                }
            };
            this.trackSelect.addEventListener('focus', removeHidden);
            this.trackSelect.addEventListener('mousedown', removeHidden, { passive: true });
            this.trackSelect.addEventListener('touchstart', removeHidden, { passive: true });
            this.trackSelect.addEventListener('change', restoreHidden);
            this.trackSelect.addEventListener('blur', restoreHidden);
        }

        if (this.viewRunsBtn) {
            this.viewRunsBtn.addEventListener('click', () => {
                if (this.modalMainView) this.modalMainView.classList.remove('active-view');
                if (this.modalRunsView) this.modalRunsView.classList.add('active-view');
            });
        }
        if (this.backToMainBtn) {
            this.backToMainBtn.addEventListener('click', () => {
                if (this.modalRunsView) this.modalRunsView.classList.remove('active-view');
                if (this.modalMainView) this.modalMainView.classList.add('active-view');
            });
        }



        // Button Listeners
        if (this.headerHtpBtn) {
            this.headerHtpBtn.addEventListener('click', () => {
                if (this.htpModal) this.htpModal.classList.add('active');
            });
        }

        if (this.closeHtpBtn) {
            this.closeHtpBtn.addEventListener('click', () => {
                if (this.htpModal) this.htpModal.classList.remove('active');
            });
        }

        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.raceStats.start++;
                this.startSequence();
            });
        }



        const modalResetBtn = document.getElementById('modal-reset-btn');
        if (modalResetBtn) {
            modalResetBtn.addEventListener('click', () => {
                this.raceStats.start++;
                this.reset(true);
            });
        }
        if (this.shareBtn) {
            this.shareBtn.addEventListener('click', () => {
                if (typeof umami !== 'undefined') umami.track('challenge_friend_share');
                this.shareLapResult();
            });
        }

        // Mobile Control Bindings
        this.bindMobileControls();

        this.resize();
        this.loadTrack('circuit');
        this.exposeTestHooks();

        this.lastTime = this.getNow();
        this.loop(this.lastTime);
    }

    sendRaceEvent() {
        if (this.raceEventSent || this.raceStats.start === 0) return;
        this.raceEventSent = true;
        if (typeof umami !== 'undefined') {
            umami.track('race-event', {
                start: this.raceStats.start,
                crash: this.raceStats.crash,
                win: this.raceStats.win
            });
        }
    }

    getNow() {
        return performance.now() + this.timeOffsetMs;
    }

    exposeTestHooks() {
        window.render_game_to_text = () => this.renderGameToText();
        window.advanceTime = (ms) => this.advanceTime(ms);
    }

    renderGameToText() {
        return JSON.stringify({
            coordinateSystem: 'origin top-left, x increases right, y increases down, units are track-grid cells',
            mode: this.status,
            track: this.currentTrackKey,
            player: {
                x: Number(this.pos.x.toFixed(2)),
                y: Number(this.pos.y.toFixed(2)),
                angle: Number(this.angle.toFixed(3)),
                speed: Number(this.cachedSpeed.toFixed(2))
            },
            lapTime: Number(this.currentTime.toFixed(2)),
            startLine: this.currentTrack.startLine,
            routeTracePoints: this.routeTrace.length
        });
    }

    advanceTime(ms) {
        const totalSteps = Math.max(1, Math.round(ms / (this.FIXED_DT * 1000)));
        const stepMs = ms / totalSteps;

        for (let i = 0; i < totalSteps; i++) {
            this.timeOffsetMs += stepMs;
            this.prevPos = { x: this.pos.x, y: this.pos.y };
            this.prevAngle = this.angle;
            this.update(this.FIXED_DT);
        }

        if (this.status === 'playing') {
            this.currentTime = (this.getNow() - this.startTime) / 1000;
            this.uiTime.textContent = this.currentTime.toFixed(2);
            this.uiSpeed.textContent = Math.round(this.cachedSpeed * 20).toString();
        }

        this.accumulator = 0;
        this.render(this.FIXED_DT, 1);
        this.lastTime = performance.now();
    }

    detectDevicePerformance() {
        // Quick performance test: measure time to render a simple canvas operation
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 100;
        testCanvas.height = 100;
        const testCtx = testCanvas.getContext('2d');

        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            testCtx.fillRect(0, 0, 100, 100);
        }
        const elapsed = performance.now() - start;

        // If simple operations take > 1ms, likely a low-end device
        // Also check for mobile devices
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isLowEnd = elapsed > 1 || isMobile;

        return isLowEnd ? 1 : 0; // 1 = low quality, 0 = high quality
    }

    clearTimers() {
        this.activeTimers.forEach(id => {
            clearTimeout(id);
            clearInterval(id);
        });
        this.activeTimers = [];
    }

    startSequence() {
        if (this.status !== 'ready') return;

        this.status = 'starting';
        this.runHistory = [];
        this.runHistoryTimer = 0;
        this.recordRunPoint(this.pos);
        this.startOverlay.style.display = 'none';
        this.startLights.classList.add('visible');

        const l1 = document.getElementById('light-1');
        const l2 = document.getElementById('light-2');
        const l3 = document.getElementById('light-3');

        // Sequence: 1s intervals
        this.activeTimers.push(setTimeout(() => l1.classList.add('on'), 500));
        this.activeTimers.push(setTimeout(() => l2.classList.add('on'), 1500));

        this.activeTimers.push(setTimeout(() => {
            // Turn all green
            l1.classList.remove('on'); l1.classList.add('green');
            l2.classList.remove('on'); l2.classList.add('green');
            l3.classList.remove('on'); l3.classList.add('green');

            // Show GO
            this.goMessage.classList.add('visible');

            // START
            this.status = 'playing';
            this.startTime = this.getNow();

            // Cleanup visuals after start
            this.activeTimers.push(setTimeout(() => {
                this.startLights.classList.remove('visible');
                this.goMessage.classList.remove('visible');
                [l1, l2, l3].forEach(l => {
                    l.className = 'light';
                });
            }, 1500));
        }, 2500));
    }

    bindMobileControls() {
        const setupBtn = (id, key) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            const down = (e) => {
                e.preventDefault();
                this.handleKey({ key: key }, true);
                btn.classList.add('active');
            };
            const up = (e) => {
                e.preventDefault();
                this.handleKey({ key: key }, false);
                btn.classList.remove('active');
            };

            btn.addEventListener('touchstart', down, { passive: false });
            btn.addEventListener('touchend', up, { passive: false });
            btn.addEventListener('mousedown', down);
            btn.addEventListener('mouseup', up);
            btn.addEventListener('mouseleave', up);
        };

        setupBtn('btn-left', 'a');
        setupBtn('btn-right', 'd');
    }

    // Create F1 Car Sprite
    createCarSprite() {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 32;
        const x = c.getContext('2d');
        x.translate(32, 16);

        // Tires
        x.fillStyle = '#171717';
        x.fillRect(6, -12, 10, 6); x.fillRect(6, 6, 10, 6);
        x.fillRect(-16, -13, 11, 7); x.fillRect(-16, 6, 11, 7);
        // Shine
        x.fillStyle = '#333';
        x.fillRect(8, -11, 4, 2); x.fillRect(8, 7, 4, 2);
        x.fillRect(-14, -12, 6, 2); x.fillRect(-14, 7, 6, 2);
        // Front Wing
        x.fillStyle = '#e2e8f0';
        x.beginPath(); x.moveTo(18, -10); x.lineTo(18, 10); x.lineTo(14, 8); x.lineTo(14, -8); x.fill();
        // Body
        x.fillStyle = '#dc2626';
        x.beginPath(); x.moveTo(20, 0); x.lineTo(6, -3); x.lineTo(-6, -6);
        x.lineTo(-12, -6); x.lineTo(-14, -2); x.lineTo(-14, 2); x.lineTo(-12, 6);
        x.lineTo(-6, 6); x.lineTo(6, 3); x.closePath(); x.fill();
        // Intakes
        x.fillStyle = '#000';
        x.beginPath(); x.moveTo(0, -4); x.lineTo(-4, -6); x.lineTo(0, -6); x.fill();
        x.beginPath(); x.moveTo(0, 4); x.lineTo(-4, 6); x.lineTo(0, 6); x.fill();
        // Rear Wing
        x.fillStyle = '#111'; x.fillRect(-18, -10, 4, 20);
        x.fillStyle = '#dc2626'; x.fillRect(-18, -10, 5, 2); x.fillRect(-18, 8, 5, 2);
        // Helmet
        x.fillStyle = '#facc15'; x.beginPath(); x.arc(-4, 0, 3, 0, Math.PI * 2); x.fill();
        // Stripe
        x.fillStyle = '#fff'; x.fillRect(-10, -1, 12, 2);
        return c;
    }

    resize() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
    }

    // Helper to round corners - optimized with adaptive step count
    smoothPoly(points, radius) {
        const uniquePoints = points.filter((p, i) => {
            const next = points[(i + 1) % points.length];
            return !(Math.abs(p.x - next.x) < 0.01 && Math.abs(p.y - next.y) < 0.01);
        });

        if (uniquePoints.length < 3) return uniquePoints;

        const newPoints = [];
        const len = uniquePoints.length;

        // Reduce steps for lower-end devices (3 steps instead of 5)
        const steps = (this.qualityLevel > 0 || this.frameSkip > 0) ? 3 : 5;

        for (let i = 0; i < len; i++) {
            const prev = uniquePoints[(i - 1 + len) % len];
            const curr = uniquePoints[i];
            const next = uniquePoints[(i + 1) % len];

            // Edge vectors
            const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
            const v2 = { x: next.x - curr.x, y: next.y - curr.y };

            const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
            const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

            if (len1 < 0.001 || len2 < 0.001) {
                newPoints.push(curr);
                continue;
            }

            const r = Math.min(radius, len1 / 2.5, len2 / 2.5);
            const n1 = { x: v1.x / len1, y: v1.y / len1 };
            const n2 = { x: v2.x / len2, y: v2.y / len2 };
            const start = { x: curr.x - n1.x * r, y: curr.y - n1.y * r };
            const end = { x: curr.x + n2.x * r, y: curr.y + n2.y * r };

            for (let t = 0; t <= steps; t++) {
                const s = t / steps;
                const a = (1 - s) * (1 - s);
                const b = 2 * (1 - s) * s;
                const c = s * s;
                newPoints.push({
                    x: a * start.x + b * curr.x + c * end.x,
                    y: a * start.y + b * curr.y + c * end.y
                });
            }
        }
        return newPoints;
    }

    // Build cached Path2D objects for track rendering
    buildTrackPaths() {
        const gs = CONFIG.gridSize;
        const outer = this.activeGeometry.outer;
        const inner = this.activeGeometry.inner;

        // Find bounds for the offscreen canvas
        let maxX = 0; let maxY = 0;
        for (let p of outer) {
            if (p.x * gs > maxX) maxX = p.x * gs;
            if (p.y * gs > maxY) maxY = p.y * gs;
        }

        // Create or resize canvas
        if (!this.trackCanvas) {
            this.trackCanvas = document.createElement('canvas');
            this.trackCtx = this.trackCanvas.getContext('2d', { alpha: false });
        }

        this.trackCanvas.width = maxX + gs * 5; // padding
        this.trackCanvas.height = maxY + gs * 5;

        const ctx = this.trackCtx;

        // Off-track background
        ctx.fillStyle = CONFIG.offTrackColor;
        ctx.fillRect(0, 0, this.trackCanvas.width, this.trackCanvas.height);

        // Track surface path (for fill)
        const surfacePath = new Path2D();
        surfacePath.moveTo(outer[0].x * gs, outer[0].y * gs);
        for (let i = 1; i < outer.length; i++) {
            surfacePath.lineTo(outer[i].x * gs, outer[i].y * gs);
        }
        surfacePath.closePath();
        surfacePath.moveTo(inner[0].x * gs, inner[0].y * gs);
        for (let i = 1; i < inner.length; i++) {
            surfacePath.lineTo(inner[i].x * gs, inner[i].y * gs);
        }
        surfacePath.closePath();

        // Outer curb path
        const outerCurbPath = new Path2D();
        outerCurbPath.moveTo(outer[0].x * gs, outer[0].y * gs);
        for (let i = 1; i < outer.length; i++) {
            outerCurbPath.lineTo(outer[i].x * gs, outer[i].y * gs);
        }
        outerCurbPath.closePath();

        // Inner curb path
        const innerCurbPath = new Path2D();
        innerCurbPath.moveTo(inner[0].x * gs, inner[0].y * gs);
        for (let i = 1; i < inner.length; i++) {
            innerCurbPath.lineTo(inner[i].x * gs, inner[i].y * gs);
        }
        innerCurbPath.closePath();

        this.trackPaths.surface = surfacePath;
        this.trackPaths.outerCurb = outerCurbPath;
        this.trackPaths.innerCurb = innerCurbPath;

        // Draw static track elements statically
        ctx.fillStyle = CONFIG.trackColor;
        ctx.fill(surfacePath, 'evenodd');

        const drawCurb = (path) => {
            ctx.lineWidth = 6;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.setLineDash([20, 20]);
            ctx.strokeStyle = CONFIG.curbRed;
            ctx.stroke(path);
            ctx.lineDashOffset = 20;
            ctx.strokeStyle = CONFIG.curbWhite;
            ctx.stroke(path);
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke(path);
        };

        drawCurb(outerCurbPath);
        drawCurb(innerCurbPath);

        const drawTires = (poly) => {
            const step = 20;
            for (let i = 0; i < poly.length; i += step) {
                const p = poly[i];
                const px = p.x * gs;
                const py = p.y * gs;

                const offsets = [{ x: 0, y: 0 }, { x: 6, y: 4 }, { x: -6, y: 4 }];
                for (let o of offsets) {
                    ctx.fillStyle = '#171717';
                    ctx.beginPath(); ctx.arc(px + o.x, py + o.y, 5, 0, Math.PI * 2); ctx.fill();

                    ctx.strokeStyle = (i % (step * 2) === 0) ? CONFIG.curbRed : CONFIG.curbWhite;
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(px + o.x, py + o.y, 2.5, 0, Math.PI * 2); ctx.stroke();
                }
            }
        };
        drawTires(outer);

        const sl = this.currentTrack.startLine;
        ctx.beginPath();
        ctx.strokeStyle = CONFIG.finishLineColor;
        ctx.lineWidth = 8;
        ctx.setLineDash([8, 8]);
        ctx.moveTo(sl.p1.x * gs, sl.p1.y * gs);
        ctx.lineTo(sl.p2.x * gs, sl.p2.y * gs);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    async loadTrack(trackKey) {
        if (TRACKS[trackKey]) {
            this.currentTrack = TRACKS[trackKey];
            this.currentTrackKey = trackKey;

            // Sync selector
            this.trackSelect.value = trackKey;

            const cornerRadius = this.currentTrack.cornerRadius ?? 3;
            this.activeGeometry.outer = this.smoothPoly(this.currentTrack.outer, cornerRadius);
            this.activeGeometry.inner = this.smoothPoly(this.currentTrack.inner, cornerRadius);

            // Build cached paths for performance
            this.buildTrackPaths();

            // Load best lap time for this track
            try {
                const trackData = await getTrackData(trackKey);
                this.bestLapTime = trackData.bestTime;
                // Update UI
                if (this.bestLapTime !== null && this.bestLapTime !== undefined) {
                    this.bestTimeVal.textContent = this.bestLapTime.toFixed(2);
                    this.bestTimeDisplay.style.display = 'block';
                } else {
                    this.bestTimeDisplay.style.display = 'none';
                }
            } catch (error) {
                console.error('Error loading track data:', error);
                this.bestLapTime = null;
                this.bestTimeDisplay.style.display = 'none';
            }

            this.reset();
            document.activeElement.blur();
        }
    }

    handleKey(e, isDown) {
        if (!e.key) return;
        if (e.key.toLowerCase() === 'r' && isDown && this.modal.classList.contains('active')) {
            e.preventDefault();
            this.raceStats.start++;
            this.reset(true);
            return;
        }
        if (["ArrowLeft", "ArrowRight", "a", "d"].indexOf(e.key.toLowerCase()) > -1 || ["ArrowLeft", "ArrowRight"].indexOf(e.code) > -1) {
            if (e.preventDefault) e.preventDefault();
        }
        switch (e.key.toLowerCase()) {
            case 'a': case 'arrowleft': this.keys.left = isDown; break;
            case 'd': case 'arrowright': this.keys.right = isDown; break;
        }
    }

    update(dt) {
        if (this.status === 'playing') {
            // Physics
            let ax = 0;
            let ay = 0;

            // AUTO ACCELERATE
            ax += Math.cos(this.angle) * CONFIG.accel;
            ay += Math.sin(this.angle) * CONFIG.accel;

            if (this.keys.left) this.angle -= CONFIG.turnSpeed * dt;
            if (this.keys.right) this.angle += CONFIG.turnSpeed * dt;

            this.velocity.x += ax * dt;
            this.velocity.y += ay * dt;

            // Frame-rate independent friction (tuned for 60fps baseline)
            const frictionFactor = Math.pow(CONFIG.friction, dt * 60);
            this.velocity.x *= frictionFactor;
            this.velocity.y *= frictionFactor;

            // Cache speed calculation (used multiple times)
            this.cachedSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);

            const nextPos = {
                x: this.pos.x + this.velocity.x * dt,
                y: this.pos.y + this.velocity.y * dt
            };

            // Check Collision
            const hitWall = this.checkWallCollision(this.pos, nextPos);

            if (hitWall) {
                if (this.cachedSpeed > CONFIG.crashSpeed) {
                    this.status = 'crashed';
                    this.raceStats.crash++;
                    this.showModal('CRASHED', `Impact: ${Math.round(this.cachedSpeed * 20)} KPH`);
                    // Limit particle count on low-end devices
                    const particleCount = this.frameSkip > 0 ? 10 : 20;
                    for (let k = 0; k < particleCount; k++) this.spawnParticles('spark');
                } else {
                    // Wall Scrape
                    this.velocity.x *= -0.5;
                    this.velocity.y *= -0.5;
                    this.pos.x -= this.velocity.x * dt * 2;
                    this.pos.y -= this.velocity.y * dt * 2;
                    const particleCount = this.frameSkip > 0 ? 3 : 5;
                    for (let k = 0; k < particleCount; k++) this.spawnParticles('spark');
                }
            } else {
                const checkpoints = this.currentTrack.checkpoints || [];
                if (this.nextCheckpointIndex < checkpoints.length) {
                    const cp = checkpoints[this.nextCheckpointIndex];
                    if (getIntersection(this.pos, nextPos, cp.p1, cp.p2)) {
                        this.nextCheckpointIndex++;
                    }
                }
                if (this.checkFinishLine(this.pos, nextPos)) {
                    const allPassed = checkpoints.length === 0 || this.nextCheckpointIndex >= checkpoints.length;
                    if (allPassed && this.currentTime >= 2.0) {
                        this.handleWin();
                    }
                    this.nextCheckpointIndex = 0;
                }
                this.pos = nextPos;
            }

            this.currentTime = (this.getNow() - this.startTime) / 1000;

            // Skid marks (use cached speed)
            const vx = Math.cos(this.angle);
            const vy = Math.sin(this.angle);
            const vMag = this.cachedSpeed || 1;
            const vNormX = this.velocity.x / vMag;
            const vNormY = this.velocity.y / vMag;

            const slip = 1 - (vx * vNormX + vy * vNormY);

            // Slightly easier skid mark threshold
            if (slip > 0.05 && this.cachedSpeed > 2) {
                this.skidMarks.push({
                    x: this.pos.x,
                    y: this.pos.y,
                    angle: this.angle,
                    alpha: 1.0
                });
                // Reduce max skid marks on low-end devices
                const maxSkids = this.frameSkip > 0 ? 100 : 200;
                if (this.skidMarks.length > maxSkids) this.skidMarks.shift();
            }

            // Trace Route Logic (always enabled)
            this.trailTimer += dt;
            if (this.trailTimer > 0.05) {
                this.routeTrace.push({ x: this.pos.x, y: this.pos.y });
                this.trailTimer %= 0.05;
            }

            this.runHistoryTimer += dt;
            if (this.runHistoryTimer >= 0.05) {
                this.recordRunPoint(this.pos);
                this.runHistoryTimer %= 0.05;
            }
        }

        // Update Particles (limit count on low-end devices)
        const maxParticles = this.frameSkip > 0 ? 30 : 50;
        if (this.particles.length > maxParticles) {
            this.particles.splice(0, this.particles.length - maxParticles);
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    spawnParticles(type) {
        const count = type === 'spark' ? 5 : 1;
        for (let i = 0; i < count; i++) {
            const spread = 0.5;
            const px = this.pos.x + (Math.random() - 0.5) * spread;
            const py = this.pos.y + (Math.random() - 0.5) * spread;

            let pvX, pvY, color, life;

            if (type === 'spark') {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 5;
                pvX = Math.cos(angle) * speed;
                pvY = Math.sin(angle) * speed;
                color = CONFIG.sparkColor;
                life = 0.2 + Math.random() * 0.2;
            } else {
                // Smoke
                pvX = (Math.random() - 0.5) * 2;
                pvY = (Math.random() - 0.5) * 2;
                color = CONFIG.smokeColor;
                life = 0.5 + Math.random() * 0.5;
            }

            this.particles.push({
                x: px, y: py,
                vx: pvX, vy: pvY,
                life: life,
                maxLife: life,
                color: color,
                size: type === 'spark' ? 2 : 4
            });
        }
    }

    checkWallCollision(p1, p2) {
        const carRadiusSq = CONFIG.carRadius * CONFIG.carRadius;
        const checkPoly = (poly) => {
            // Early exit optimization: check bounding box first
            const minX = Math.min(p1.x, p2.x) - CONFIG.carRadius;
            const maxX = Math.max(p1.x, p2.x) + CONFIG.carRadius;
            const minY = Math.min(p1.y, p2.y) - CONFIG.carRadius;
            const maxY = Math.max(p1.y, p2.y) + CONFIG.carRadius;

            for (let i = 0; i < poly.length; i++) {
                const w1 = poly[i];
                const w2 = poly[(i + 1) % poly.length];

                // Quick bounding box check
                const wallMinX = Math.min(w1.x, w2.x);
                const wallMaxX = Math.max(w1.x, w2.x);
                const wallMinY = Math.min(w1.y, w2.y);
                const wallMaxY = Math.max(w1.y, w2.y);

                if (maxX < wallMinX || minX > wallMaxX || maxY < wallMinY || minY > wallMaxY) {
                    continue; // Skip this wall segment
                }

                if (getIntersection(p1, p2, w1, w2)) return true;

                const A = p2.x - w1.x;
                const B = p2.y - w1.y;
                const C = w2.x - w1.x;
                const D = w2.y - w1.y;

                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                let param = -1;
                if (lenSq !== 0) param = dot / lenSq;

                let xx, yy;

                if (param < 0) {
                    xx = w1.x; yy = w1.y;
                } else if (param > 1) {
                    xx = w2.x; yy = w2.y;
                } else {
                    xx = w1.x + param * C;
                    yy = w1.y + param * D;
                }

                const dx = p2.x - xx;
                const dy = p2.y - yy;
                if ((dx * dx + dy * dy) < carRadiusSq) {
                    return true;
                }
            }
            return false;
        };
        if (checkPoly(this.activeGeometry.outer)) return true;
        if (checkPoly(this.activeGeometry.inner)) return true;
        return false;
    }

    checkFinishLine(p1, p2) {
        const line = this.currentTrack.startLine;
        return !!getIntersection(p1, p2, line.p1, line.p2);
    }

    async handleWin() {
        this.status = 'won';
        this.raceStats.win++;
        const finalTime = this.currentTime;
        const trackName = this.currentTrackKey;
        this.recordRunPoint(this.pos);

        // Save lap time
        let trackData;
        const previousBest = this.bestLapTime;
        try {
            trackData = await saveLapTime(trackName, finalTime);
            // Update best lap time in memory
            this.bestLapTime = trackData.bestTime;
            // Update UI
            if (this.bestLapTime !== null && this.bestLapTime !== undefined) {
                this.bestTimeVal.textContent = this.bestLapTime.toFixed(2);
                this.bestTimeDisplay.style.display = 'block';
            }
        } catch (error) {
            console.error('Error saving lap time:', error);
            // Fallback display
            trackData = {
                lapTimes: [finalTime],
                bestTime: this.bestLapTime || finalTime
            };
            if (finalTime < (this.bestLapTime || Infinity)) {
                this.bestLapTime = finalTime;
                trackData.bestTime = finalTime;
            }
        }

        // Format time display
        const formattedTime = finalTime.toFixed(2);
        const bestTime = trackData.bestTime ? trackData.bestTime.toFixed(2) : 'N/A';

        // Check if this is a new best
        const isNewBest = trackData.bestTime === finalTime && (previousBest === null || previousBest === undefined || finalTime < previousBest);
        const title = isNewBest ? 'Personal Best' : 'FINISH LINE';

        // Build lap times list
        let lapTimesHtml = '';
        if (trackData.lapTimes.length > 0) {
            lapTimesHtml = '<div class="lap-times-list">';
            const recentRuns = trackData.lapTimes.slice().reverse().slice(0, 10);
            recentRuns.forEach((time, index) => {
                const isBest = Math.abs(time - trackData.bestTime) < 0.01; // Floating point comparison
                const isCurrent = index === 0;
                lapTimesHtml += `<div class="lap-time-item ${isBest ? 'best' : ''} ${isCurrent ? 'current' : ''}">`;
                const realIndex = trackData.lapTimes.length - index;
                lapTimesHtml += `${realIndex}. ${time.toFixed(2)}s`;
                if (isBest) lapTimesHtml += ' <span class="best-badge">BEST</span>';
                lapTimesHtml += '</div>';
            });
            lapTimesHtml += '</div>';
        }

        this.lastSharePayload = {
            title,
            trackName: this.currentTrack.name,
            trackKey: this.currentTrackKey,
            lapTime: finalTime,
            bestTime: trackData.bestTime ?? finalTime,
            isNewBest,
            runHistory: this.runHistory.slice()
        };
        this.showModal(title, `Lap Time: ${formattedTime}s`, {
            bestTime: bestTime,
            lapTimes: lapTimesHtml
        });
        this.prepareShareAsset();
    }

    reset(autoStart = false) {
        // Clear any running start sequences
        this.clearTimers();

        this.pos = { ...this.currentTrack.startPos };
        this.prevPos = { ...this.currentTrack.startPos };
        this.velocity = { x: 0, y: 0 };
        this.angle = this.currentTrack.startAngle;
        this.prevAngle = this.currentTrack.startAngle;
        this.keys = { left: false, right: false }; // Reset keys
        this.status = 'ready'; // Reset to ready state
        this.nextCheckpointIndex = 0;
        this.accumulator = 0;
        this.currentTime = 0;
        this.skidMarks = [];
        this.routeTrace = [];
        this.runHistory = [];
        this.runHistoryTimer = 0;
        this.particles = [];
        this.lastSharePayload = null;
        this.shareFile = null;
        this.shareFilename = '';
        this.shareBlobPromise = null;
        this.modal.classList.remove('active');
        this.setShareState(false);

        // Reset Visuals
        this.startLights.classList.remove('visible');
        this.goMessage.classList.remove('visible');
        [...this.startLights.children].forEach(el => el.className = 'light');

        this.uiTime.innerHTML = "0.00";
        this.uiSpeed.innerText = "0";

        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const gs = CONFIG.gridSize;
        this.camera.x = (this.pos.x * gs) - cw / 2;
        this.camera.y = (this.pos.y * gs) - ch / 2;

        if (autoStart) {
            this.startOverlay.style.display = 'none';
            this.startSequence();
        } else {
            this.startOverlay.style.display = 'flex';
        }
    }

    showModal(title, msg, lapData = null) {
        this.modalTitle.innerText = title;
        this.modalMsg.innerText = msg;

        if (lapData) {
            if (this.modalBestTime) {
                this.modalBestTime.innerHTML = `<strong>Best Time:</strong> ${lapData.bestTime}s`;
                this.modalBestTime.style.display = 'flex';
            }
            if (lapData.lapTimes && this.modalLapTimes) {
                this.modalLapTimes.innerHTML = lapData.lapTimes;
            } else if (this.modalLapTimes) {
                this.modalLapTimes.innerHTML = '';
            }
            if (this.viewRunsBtn) this.viewRunsBtn.style.display = lapData.lapTimes ? 'inline-block' : 'none';
        } else {
            if (this.modalBestTime) this.modalBestTime.style.display = 'none';
            if (this.viewRunsBtn) this.viewRunsBtn.style.display = 'none';
        }

        if (this.modalMainView && this.modalRunsView) {
            this.modalMainView.classList.add('active-view');
            this.modalRunsView.classList.remove('active-view');
        }

        this.setShareState(Boolean(this.lastSharePayload));

        this.modal.classList.add('active');
    }

    recordRunPoint(point) {
        const x = Number(point.x.toFixed(3));
        const y = Number(point.y.toFixed(3));
        const lastPoint = this.runHistory[this.runHistory.length - 1];
        if (lastPoint && Math.abs(lastPoint.x - x) < 0.001 && Math.abs(lastPoint.y - y) < 0.001) {
            return;
        }
        this.runHistory.push({ x, y });
    }

    setShareState(enabled) {
        if (this.sharePanel) {
            this.sharePanel.style.display = enabled ? 'flex' : 'none';
        }
        if (this.shareBtn) {
            this.shareBtn.disabled = !enabled || Boolean(this.shareBlobPromise);
            this.shareBtn.textContent = 'Challenge a Friend';
        }
    }

    flashShareMessage(message, timeoutMs = 2200) {
        // Obsolete, removed share status messages
    }

    getShareCaption(payload) {
        return `I ran ${payload.trackName} in 🏁 ${payload.lapTime.toFixed(2)}s. Can you beat it? \n 🏎️ vectorgp.run `;
    }

    getReplayLayout(payload, width, height, hudHeight) {
        const padding = 28;
        const run = payload.runHistory.length > 1 ? payload.runHistory : [this.currentTrack.startPos, this.pos];
        const points = [...this.activeGeometry.outer, ...this.activeGeometry.inner, ...run];
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const usableWidth = width - padding * 2;
        const usableHeight = height - hudHeight - padding * 2;
        const scale = Math.min(usableWidth / Math.max(1, maxX - minX), usableHeight / Math.max(1, maxY - minY));
        const offsetX = padding + (usableWidth - (maxX - minX) * scale) / 2;
        const offsetY = padding + (usableHeight - (maxY - minY) * scale) / 2;

        return {
            hudHeight,
            run,
            mapPoint: (point) => ({
                x: offsetX + (point.x - minX) * scale,
                y: offsetY + (point.y - minY) * scale
            })
        };
    }

    getReplayProgressPoint(run, progress) {
        if (run.length === 1) {
            return run[0];
        }

        const scaledIndex = progress * (run.length - 1);
        const baseIndex = Math.floor(scaledIndex);
        const nextIndex = Math.min(run.length - 1, baseIndex + 1);
        const t = scaledIndex - baseIndex;
        const start = run[baseIndex];
        const end = run[nextIndex];

        return {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t
        };
    }

    drawMappedPolygon(ctx, points, mapPoint) {
        if (!points.length) return;
        const first = mapPoint(points[0]);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i++) {
            const point = mapPoint(points[i]);
            ctx.lineTo(point.x, point.y);
        }
        ctx.closePath();
    }

    drawReplayPath(ctx, points, mapPoint) {
        if (!points.length) return;
        const first = mapPoint(points[0]);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i++) {
            const point = mapPoint(points[i]);
            ctx.lineTo(point.x, point.y);
        }
    }

    renderReplayFrame(ctx, payload, layout, width, height, progress, options = {}) {
        const { hudHeight, run, mapPoint } = layout;
        const showHud = options.showHud ?? true;
        const showMarker = options.showMarker ?? true;
        const currentPoint = this.getReplayProgressPoint(run, progress);
        const drawCount = Math.max(1, Math.floor(progress * (run.length - 1)));
        const revealedPoints = run.slice(0, drawCount + 1);
        if (revealedPoints[revealedPoints.length - 1] !== currentPoint) {
            revealedPoints.push(currentPoint);
        }

        ctx.clearRect(0, 0, width, height);

        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#020617');
        gradient.addColorStop(1, '#111827');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        if (showHud && hudHeight > 0) {
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, height - hudHeight, width, hudHeight);
        }

        this.drawMappedPolygon(ctx, this.activeGeometry.outer, mapPoint);
        ctx.fillStyle = '#334155';
        ctx.fill();

        this.drawMappedPolygon(ctx, this.activeGeometry.inner, mapPoint);
        ctx.fillStyle = '#020617';
        ctx.fill();

        this.drawMappedPolygon(ctx, this.activeGeometry.outer, mapPoint);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#f8fafc';
        ctx.lineJoin = 'round';
        ctx.stroke();

        this.drawMappedPolygon(ctx, this.activeGeometry.inner, mapPoint);
        ctx.strokeStyle = '#cbd5e1';
        ctx.stroke();

        const lineStart = mapPoint(this.currentTrack.startLine.p1);
        const lineEnd = mapPoint(this.currentTrack.startLine.p2);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 6;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(lineStart.x, lineStart.y);
        ctx.lineTo(lineEnd.x, lineEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(251, 113, 133, 0.2)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this.drawReplayPath(ctx, run, mapPoint);
        ctx.stroke();

        ctx.strokeStyle = '#fb7185';
        ctx.lineWidth = 8;
        this.drawReplayPath(ctx, revealedPoints, mapPoint);
        ctx.stroke();

        if (showMarker) {
            const marker = mapPoint(currentPoint);
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.arc(marker.x, marker.y, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    wrapText(ctx, text, maxWidth) {
        const paragraphs = text.split(/\n/);
        const lines = [];
        for (const para of paragraphs) {
            const words = para.split(/\s+/).filter((w) => w.length > 0);
            let line = '';
            for (const w of words) {
                const test = line ? `${line} ${w}` : w;
                const m = ctx.measureText(test);
                if (m.width > maxWidth && line) {
                    lines.push(line);
                    line = w;
                } else {
                    line = test;
                }
            }
            if (line) lines.push(line);
        }
        return lines;
    }

    buildShareImageBlob(payload) {
        const width = 1080;
        const height = 1080;
        const hudHeight = 0;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const layout = this.getReplayLayout(payload, width, height, hudHeight);

        this.renderReplayFrame(ctx, payload, layout, width, height, 1, {
            showHud: false,
            showMarker: false
        });

        const caption = this.getShareCaption(payload);
        const pad = 48;
        const lineHeight = 52;
        const fontSize = 42;
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = this.wrapText(ctx, caption, width - pad * 2);
        const textBlockHeight = lines.length * lineHeight + pad * 2;
        const y0 = height - textBlockHeight;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.fillRect(0, y0, width, textBlockHeight);
        ctx.fillStyle = '#f8fafc';
        lines.forEach((line, i) => {
            ctx.fillText(line, width / 2, y0 + pad + lineHeight / 2 + i * lineHeight);
        });

        return new Promise((resolve, reject) => {
            if (canvas.toBlob) {
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                        return;
                    }
                    reject(new Error('Canvas export returned an empty blob.'));
                }, 'image/png');
                return;
            }

            try {
                const dataUrl = canvas.toDataURL('image/png');
                fetch(dataUrl)
                    .then((response) => response.blob())
                    .then(resolve)
                    .catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    downloadBlob(filename, blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    prepareShareAsset() {
        if (!this.lastSharePayload) return;
        if (this.shareBlobPromise) return this.shareBlobPromise;
        if (this.shareFile) return Promise.resolve(this.shareFile);

        const payload = this.lastSharePayload;
        this.shareFile = null;
        this.shareFilename = `${payload.trackKey}-${payload.lapTime.toFixed(2).replace('.', '-')}.png`;
        this.setShareState(true);

        this.shareBlobPromise = this.buildShareImageBlob(payload)
            .then((blob) => {
                this.shareFile = typeof File === 'function'
                    ? new File([blob], this.shareFilename, { type: 'image/png' })
                    : blob;
                this.shareBlobPromise = null;
                this.setShareState(true);
                return this.shareFile;
            })
            .catch((error) => {
                console.error('Error preparing share asset:', error);
                this.shareBlobPromise = null;
                this.shareFile = null;
                this.setShareState(true);
                throw error;
            });
    }

    async shareLapResult() {
        if (!this.lastSharePayload) return;

        if (!this.shareFile) {
            this.setShareState(true);
            return;
        }

        try {
            const file = this.shareFile instanceof File ? this.shareFile : null;
            const caption = this.getShareCaption(this.lastSharePayload);

            // 1. Native share with image file (mobile / supported browsers)
            const hasNativeShare = !!(navigator.share && file && navigator.canShare && navigator.canShare({ files: [file] }));
            if (hasNativeShare) {
                // Omit 'text' when sharing files to prevent Safari/OS from duplicating the file in the share payload
                await navigator.share({ files: [file] });
                this.setShareState(true);
                return;
            }

            // 2. Native share without file (desktop browsers that support share but not file sharing)
            if (navigator.share) {
                await navigator.share({ text: caption, url: 'https://vectorgp.run' });
                this.setShareState(true);
                return;
            }

            // 3. Clipboard image fallback
            const blob = this.shareFile instanceof Blob ? this.shareFile : null;
            if (blob && navigator.clipboard?.write && typeof ClipboardItem === 'function') {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                this.setShareState(true);
                return;
            }

            // 4. Clipboard text fallback
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(caption);
                this.setShareState(true);
            } else {
                this.setShareState(true);
            }
        } catch (error) {
            console.error('Error sharing lap result:', error);
            this.setShareState(true);
        }
    }

    render(dt, alpha = 1) {
        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const gs = CONFIG.gridSize;

        // Interpolated display position (between physics steps). Skip when not playing to avoid jitter.
        const displayPos = (this.status === 'playing')
            ? { x: this.pos.x + this.velocity.x * this.accumulator, y: this.pos.y + this.velocity.y * this.accumulator }
            : { x: this.pos.x, y: this.pos.y };
        const lerpAngle = (a, b, t) => {
            let d = b - a;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            return a + d * t;
        };
        const displayAngle = (this.status === 'playing' && alpha < 1) ? lerpAngle(this.prevAngle, this.angle, 1 - alpha) : this.angle;

        // 1. Fill Off-Track
        ctx.fillStyle = CONFIG.offTrackColor;
        ctx.fillRect(0, 0, cw, ch);

        // 2. Camera: dynamic look-ahead based on velocity to prevent whipping
        const speed = this.cachedSpeed;
        const narrowViewport = window.innerWidth <= 768;
        this.zoom = narrowViewport ? 0.75 : 1.0;

        // Target offset uses physical velocity, which takes time to change, 
        // unlike the immediate response of steering angle
        let targetLookAheadX = 0;
        let targetLookAheadY = 0;

        if (speed > 1) {
            const multiplier = narrowViewport ? 12 : 5;
            const maxOffset = narrowViewport ? Math.min(cw, ch) / 2.5 : Math.min(cw, ch) / 5;

            targetLookAheadX = this.velocity.x * multiplier;
            targetLookAheadY = this.velocity.y * multiplier;

            const mag = Math.hypot(targetLookAheadX, targetLookAheadY);
            if (mag > maxOffset) {
                targetLookAheadX = (targetLookAheadX / mag) * maxOffset;
                targetLookAheadY = (targetLookAheadY / mag) * maxOffset;
            }
        }

        // Initialize smoothing variables if they don't exist
        this._lookAheadX = this._lookAheadX || 0;
        this._lookAheadY = this._lookAheadY || 0;

        // Smoothly approach the target offset over time 
        // 1 - exp(-dt * 4) achieves ~98% of target within 1 second.
        const lerpFactor = 1 - Math.exp(-dt * 4);

        this._lookAheadX += (targetLookAheadX - this._lookAheadX) * lerpFactor;
        this._lookAheadY += (targetLookAheadY - this._lookAheadY) * lerpFactor;

        this.camera.x = (displayPos.x * gs) + this._lookAheadX - (cw / 2 / this.zoom);
        this.camera.y = (displayPos.y * gs) + this._lookAheadY - (ch / 2 / this.zoom);

        ctx.save();
        // Apply Zoom and Camera Transform
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        // 3. Draw static track elements via offscreen canvas
        if (this.trackCanvas) {
            ctx.drawImage(this.trackCanvas, 0, 0);
        }

        // 4. Skid Marks - removed slow clip operation
        if (this.skidMarks.length > 0) {
            ctx.fillStyle = CONFIG.skidColor;
            const skidCount = this.frameSkip > 0 ? Math.min(this.skidMarks.length, 50) : this.skidMarks.length;
            const startIdx = this.frameSkip > 0 ? Math.max(0, this.skidMarks.length - 50) : 0;

            for (let i = startIdx; i < skidCount; i++) {
                const m = this.skidMarks[i];
                ctx.save();
                ctx.translate(m.x * gs, m.y * gs);
                ctx.rotate(m.angle);
                ctx.fillRect(-10, -5, 4, 10);
                ctx.fillRect(-10, 5, 4, 10);
                ctx.restore();
            }
        }

        // 4.5 Route Trace (Always Visible)
        if (this.routeTrace.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = "rgba(56, 189, 248, 0.5)"; // Light Blue
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            ctx.moveTo(this.routeTrace[0].x * gs, this.routeTrace[0].y * gs);
            const traceStep = this.frameSkip > 0 ? 2 : 1;
            for (let i = traceStep; i < this.routeTrace.length; i += traceStep) {
                ctx.lineTo(this.routeTrace[i].x * gs, this.routeTrace[i].y * gs);
            }
            ctx.stroke();
        }

        // 8. Particles - batch rendering
        if (this.particles.length > 0) {
            // Group particles by color to reduce state changes
            const particlesByColor = {};
            for (let p of this.particles) {
                if (!particlesByColor[p.color]) particlesByColor[p.color] = [];
                particlesByColor[p.color].push(p);
            }

            for (const color in particlesByColor) {
                ctx.fillStyle = color;
                for (let p of particlesByColor[color]) {
                    ctx.globalAlpha = p.life / p.maxLife;
                    ctx.beginPath();
                    ctx.arc(p.x * gs, p.y * gs, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1.0;
        }

        // 9. Player F1 Car (use interpolated position/angle)
        const px = displayPos.x * gs;
        const py = displayPos.y * gs;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(displayAngle);

        const scale = 1.0;
        ctx.drawImage(this.carSprite, -32 * scale, -16 * scale, 64 * scale, 32 * scale);

        ctx.restore();

        // 10. Speed Lines - reduce on low-end
        if (speed > 4 && this.status === 'playing' && this.frameSkip === 0) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const vx = -this.velocity.x * 2;
            const vy = -this.velocity.y * 2;
            const lineCount = this.frameSkip > 0 ? 3 : 5;
            for (let k = 0; k < lineCount; k++) {
                const rx = displayPos.x * gs + (Math.random() - 0.5) * 200;
                const ry = displayPos.y * gs + (Math.random() - 0.5) * 200;
                ctx.moveTo(rx, ry);
                ctx.lineTo(rx + vx, ry + vy);
            }
            ctx.stroke();
        }



        ctx.restore();
    }

    loop(now) {
        const rawDt = Math.min((now - this.lastTime) / 1000, 0.1);
        const frameTime = now - this.lastTime;
        this.lastTime = now;

        // Track frame time history for adaptive quality
        this.frameTimeHistory.push(frameTime);
        if (this.frameTimeHistory.length > 10) {
            this.frameTimeHistory.shift();
        }

        // Calculate average frame time
        const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
        // If average frame time > 20ms (below 50fps), reduce quality
        this.frameSkip = avgFrameTime > 20 ? 1 : 0;

        // Fixed timestep: run physics at 60Hz for consistent movement
        this.accumulator += rawDt;
        const maxSteps = 3; // Cap to avoid spiral of death
        let steps = 0;
        while (this.accumulator >= this.FIXED_DT && steps < maxSteps) {
            this.prevPos = { x: this.pos.x, y: this.pos.y };
            this.prevAngle = this.angle;
            this.update(this.FIXED_DT);
            this.accumulator -= this.FIXED_DT;
            steps++;
        }
        if (this.accumulator > this.FIXED_DT) this.accumulator = this.FIXED_DT; // Clamp
        const alpha = this.accumulator / this.FIXED_DT; // 0..1 for render interpolation

        this.render(rawDt, alpha);

        if (this.status === 'playing') {
            // Display current time
            let timeText = this.currentTime.toFixed(2);
            if (this._lastTimeText !== timeText) {
                this.uiTime.textContent = timeText;
                this._lastTimeText = timeText;
            }

            // Use cached speed instead of recalculating
            let speedText = Math.round(this.cachedSpeed * 20).toString();
            if (this._lastSpeedText !== speedText) {
                this.uiSpeed.textContent = speedText;
                this._lastSpeedText = speedText;
            }
        }

        requestAnimationFrame((t) => this.loop(t));
    }
}