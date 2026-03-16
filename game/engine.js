import { getIntersection } from './math.js?v=0.4';
import { CONFIG } from './config.js?v=0.4';
import { TRACKS } from './tracks.js?v=0.4';
import { buildTrackRuntime } from './core/track-runtime.js?v=0.4';
import { recordRunPoint, updateSimulation } from './core/simulation.js?v=0.4';
import { saveLapTime, getTrackData, hasAnyTrackData } from './storage.js?v=0.4';
import { AnalyticsService } from './services/analytics.js?v=0.4';
import { SessionFlagStore } from './services/session-flags.js?v=0.4';
import { ShareService } from './services/share.js?v=0.4';
import { GameUi } from './ui.js?v=0.4';

// --- Game Engine ---
export class RealTimeRacer {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true }) || this.canvas.getContext('2d');
        this.container = document.getElementById('game-container');
        this.isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

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
        this.collisionSegments = [];
        this.trackCanvasOrigin = { x: 0, y: 0 };

        // Game State
        this.status = 'ready';
        this.currentTime = 0;
        this.nextCheckpointIndex = 0; // next checkpoint to pass this lap
        this.bestLapTime = null; // Best lap time for current track
        this.hasAnyData = false; // Whether any track has ever been raced
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
        this.isNarrowViewport = false;
        this._lookAheadX = 0;
        this._lookAheadY = 0;

        // Performance optimization: Cache values
        this.cachedSpeed = 0;
        this.frameSkip = 0;
        this.frameTimeHistory = [];
        this.frameTimeHistoryIndex = 0;
        this.frameTimeTotal = 0;

        // Fixed timestep for smooth physics (60Hz)
        this.FIXED_DT = 1 / 60;
        this.accumulator = 0;
        this.prevPos = { ...this.currentTrack.startPos };
        this.prevAngle = this.currentTrack.startAngle;
        this.timeOffsetMs = 0;

        // Detect device performance early (before track loading)
        this.qualityLevel = this.detectDevicePerformance();

        this.runHistory = [];
        this.runHistoryTimer = 0;
        this.lastSharePayload = null;
        this.trackLoadRequestId = 0;
        this.pendingStartFrame = null;
        this.startButtonPending = false;

        // Session race stats (sent once on session end)
        this.raceStats = { start: 0, crash: 0, win: 0 };
        this.raceEventSent = false;
        this.playerTypeSent = false;
        this.mapStats = {};
        this.mapEventSent = false;

        this.ui = new GameUi({
            isCoarsePointer: this.isCoarsePointer,
            onTrackChange: (trackKey) => this.loadTrack(trackKey),
            onStart: () => this.handleStartButton(),
            onReset: () => {
                this.raceStats.start++;
                this.reset(true);
            },
            onShare: () => {
                this.analytics.trackChallengeShare();
                this.shareService.share(this.lastSharePayload).catch((error) => {
                    if (error?.name !== 'AbortError') {
                        console.error('Error sharing lap result:', error);
                    }
                });
            }
        });
        this.analytics = new AnalyticsService();
        this.sessionFlags = new SessionFlagStore();
        this.shareService = new ShareService({
            buildAsset: (payload) => this.buildShareImageBlob(payload, { includeCaption: false }),
            addCaptionToBlob: (blob, payload) => this.addCaptionToBlob(blob, payload),
            getCaption: (payload) => this.getShareCaption(payload),
            getFilename: (payload) => `${payload.trackKey}-${payload.lapTime.toFixed(2).replace('.', '-')}.jpg`,
            onStateChange: (state) => this.ui.updateShareState(state),
            onPreviewChange: (blob) => {
                if (blob) {
                    this.ui.setModalPreviewBlob(blob);
                } else {
                    this.ui.clearModalPreview();
                }
            }
        });
        this.playerHistoryPromise = hasAnyTrackData()
            .then((hasAnyData) => {
                this.hasAnyData = hasAnyData;
                this.ui.refreshStartOverlay(this.status, this.hasAnyData);
                return hasAnyData;
            })
            .catch((error) => {
                console.error('Error loading player history:', error);
                return false;
            });

        // Listeners
        new ResizeObserver(() => this.resize()).observe(this.container);
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
        window.addEventListener('blur', () => this.clearSteeringInput());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.clearSteeringInput();
        });
        window.addEventListener('pagehide', () => {
            this.sendRaceEvent();
            this.sendMapEvent();
        });
        this.ui.bindSteeringControls({
            onLeftDown: () => this.handleKey({ key: 'a' }, true),
            onLeftUp: () => this.handleKey({ key: 'a' }, false),
            onRightDown: () => this.handleKey({ key: 'd' }, true),
            onRightUp: () => this.handleKey({ key: 'd' }, false)
        });

        this.resize();
        this.loadTrack('circuit', { trackPageview: false });
        this.exposeTestHooks();

        this.lastTime = this.getNow();
        this.loop(this.lastTime);
    }

    sendRaceEvent() {
        if (this.raceEventSent || this.raceStats.start === 0) return;
        this.raceEventSent = true;
        this.analytics.trackRaceEvent(this.raceStats);
    }

    sendMapEvent() {
        if (this.mapEventSent || this.raceStats.start === 0 || Object.keys(this.mapStats).length === 0) return;
        this.mapEventSent = true;
        this.analytics.trackMapEvent(this.mapStats);
    }

    getNow() {
        return performance.now() + this.timeOffsetMs;
    }

    async handleStartButton() {
        if (this.status !== 'ready' || this.startButtonPending) return;

        this.startButtonPending = true;
        const playerTypeAlreadySent = this.sessionFlags.get('playerTypeSent');
        try {
            if (!this.playerTypeSent && !playerTypeAlreadySent) {
                const hasAnyData = await this.playerHistoryPromise;
                this.playerTypeSent = true;
                this.sessionFlags.set('playerTypeSent', '1');
                this.analytics.trackPlayerType(hasAnyData);
            }

            this.raceStats.start++;
            this.startSequence();
        } finally {
            this.startButtonPending = false;
        }
    }

    exposeTestHooks() {
        window.__RACER_DEBUG__ = {
            game: this,
            renderGameToText: () => this.renderGameToText(),
            advanceTime: (ms) => this.advanceTime(ms)
        };
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
            this.ui.syncHud({ time: this.currentTime, speed: this.cachedSpeed, force: true });
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
        this.ui.hideStartOverlay();
        this.ui.showStartLights();

        // Sequence: 3 red lights, then GO.
        this.activeTimers.push(setTimeout(() => this.ui.turnOnCountdownLight(0), 400));
        this.activeTimers.push(setTimeout(() => this.ui.turnOnCountdownLight(1), 1100));
        this.activeTimers.push(setTimeout(() => this.ui.turnOnCountdownLight(2), 1800));

        this.activeTimers.push(setTimeout(() => {
            this.ui.turnCountdownLightsGreen();
            this.ui.showGoMessage();

            // Defer status transition to the next rAF tick so the DOM mutations
            // above flush before the game loop sees 'playing', and lastTime gets a
            // clean baseline with no stale frameTimeHistory from the countdown.
            this.pendingStartFrame = requestAnimationFrame((t) => {
                this.pendingStartFrame = null;
                this.status = 'playing';
                this.currentTime = 0;
                this.lastTime = t;
                this.resetFrameTimingHistory();
                this.frameSkip = 0;

                // Cleanup visuals after start
                this.activeTimers.push(setTimeout(() => {
                    this.ui.resetCountdown();
                }, 1500));
            });
        }, 2500));
    }

    clearSteeringInput() {
        this.keys.left = false;
        this.keys.right = false;
        this.ui.resetTouchControls();
    }

    // Create F1 Car Sprite
    createCarSprite() {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 32;
        const x = c.getContext('2d');
        const carColor = CONFIG.carColor;
        const carAccent = CONFIG.carAccent;
        const tireColor = CONFIG.tireColor;
        x.translate(32, 16);

        // Tires
        x.fillStyle = tireColor;
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
        x.fillStyle = carColor;
        x.beginPath(); x.moveTo(20, 0); x.lineTo(6, -3); x.lineTo(-6, -6);
        x.lineTo(-12, -6); x.lineTo(-14, -2); x.lineTo(-14, 2); x.lineTo(-12, 6);
        x.lineTo(-6, 6); x.lineTo(6, 3); x.closePath(); x.fill();
        // Intakes
        x.fillStyle = '#000';
        x.beginPath(); x.moveTo(0, -4); x.lineTo(-4, -6); x.lineTo(0, -6); x.fill();
        x.beginPath(); x.moveTo(0, 4); x.lineTo(-4, 6); x.lineTo(0, 6); x.fill();
        // Rear Wing
        x.fillStyle = tireColor; x.fillRect(-18, -10, 4, 20);
        x.fillStyle = carColor; x.fillRect(-18, -10, 5, 2); x.fillRect(-18, 8, 5, 2);
        // Helmet
        x.fillStyle = carAccent; x.beginPath(); x.arc(-4, 0, 3, 0, Math.PI * 2); x.fill();
        // Stripe
        x.fillStyle = carAccent; x.fillRect(-10, -1, 12, 2);
        return c;
    }

    drawCheckeredLine(ctx, p1, p2, width) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.hypot(dx, dy);
        if (length < 1) return;

        const tx = dx / length;
        const ty = dy / length;
        const nx = -ty;
        const ny = tx;
        const rows = 2;
        const columns = Math.max(2, Math.ceil(length / Math.max(6, width * 0.8)));
        const cellLength = length / columns;
        const rowHeight = width / rows;

        ctx.save();
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        ctx.strokeStyle = 'rgba(2, 6, 23, 0.45)';
        ctx.lineWidth = width + 4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        for (let row = 0; row < rows; row++) {
            const innerOffset = -width / 2 + row * rowHeight;
            const outerOffset = innerOffset + rowHeight;

            for (let col = 0; col < columns; col++) {
                const startDist = col * cellLength;
                const endDist = (col + 1) * cellLength;
                const sx = p1.x + tx * startDist;
                const sy = p1.y + ty * startDist;
                const ex = p1.x + tx * endDist;
                const ey = p1.y + ty * endDist;

                ctx.fillStyle = (row + col) % 2 === 0
                    ? CONFIG.finishLineColor
                    : CONFIG.finishLineDarkColor;
                ctx.beginPath();
                ctx.moveTo(sx + nx * innerOffset, sy + ny * innerOffset);
                ctx.lineTo(ex + nx * innerOffset, ey + ny * innerOffset);
                ctx.lineTo(ex + nx * outerOffset, ey + ny * outerOffset);
                ctx.lineTo(sx + nx * outerOffset, sy + ny * outerOffset);
                ctx.closePath();
                ctx.fill();
            }
        }

        ctx.strokeStyle = CONFIG.finishLineBorderColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p1.x + nx * (width / 2), p1.y + ny * (width / 2));
        ctx.lineTo(p2.x + nx * (width / 2), p2.y + ny * (width / 2));
        ctx.moveTo(p1.x - nx * (width / 2), p1.y - ny * (width / 2));
        ctx.lineTo(p2.x - nx * (width / 2), p2.y - ny * (width / 2));
        ctx.stroke();
        ctx.restore();
    }

    drawTireBarrier(ctx, x, y, angle) {
        const tireOffsets = [-12, 0, 12];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        for (let i = 0; i < tireOffsets.length; i++) {
            const offset = tireOffsets[i];
            const yOffset = i === 1 ? 0 : 2;

            ctx.fillStyle = 'rgba(2, 6, 23, 0.28)';
            ctx.beginPath();
            ctx.ellipse(offset + 1.5, yOffset + 2, 8, 6.5, 0, 0, Math.PI * 2);
            ctx.fill();

            const sidewall = ctx.createRadialGradient(offset - 2, yOffset - 2, 1, offset, yOffset, 8);
            sidewall.addColorStop(0, '#4b5563');
            sidewall.addColorStop(0.3, '#1f2937');
            sidewall.addColorStop(0.75, '#0f172a');
            sidewall.addColorStop(1, '#020617');
            ctx.fillStyle = sidewall;
            ctx.beginPath();
            ctx.ellipse(offset, yOffset, 7.5, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(offset, yOffset, 5.5, 4.4, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#020617';
            ctx.beginPath();
            ctx.ellipse(offset, yOffset, 2.2, 1.8, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(226, 232, 240, 0.12)';
            ctx.lineWidth = 1;
            for (let tread = -3; tread <= 3; tread += 3) {
                ctx.beginPath();
                ctx.moveTo(offset + tread, yOffset - 4.8);
                ctx.lineTo(offset + tread, yOffset + 4.8);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    resetFrameTimingHistory() {
        this.frameTimeHistory = [];
        this.frameTimeHistoryIndex = 0;
        this.frameTimeTotal = 0;
    }

    resize() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.isNarrowViewport = window.innerWidth <= 768;
    }

    // Build the offscreen track canvas used by the main render loop
    buildTrackPaths() {
        const gs = CONFIG.gridSize;
        const outer = this.activeGeometry.outer;
        const inner = this.activeGeometry.inner;

        if (outer.length < 3 || inner.length < 3) {
            this.trackCanvasOrigin = { x: 0, y: 0 };
            this.trackCanvas = null;
            this.trackCtx = null;
            return;
        }

        // Find bounds for the offscreen canvas
        let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
        for (let p of [...outer, ...inner]) {
            const px = p.x * gs;
            const py = p.y * gs;
            if (px < minX) minX = px;
            if (py < minY) minY = py;
            if (px > maxX) maxX = px;
            if (py > maxY) maxY = py;
        }
        const padding = gs * 5;
        this.trackCanvasOrigin = {
            x: minX - padding,
            y: minY - padding
        };

        // Create or resize canvas
        if (!this.trackCanvas) {
            this.trackCanvas = document.createElement('canvas');
            this.trackCtx = this.trackCanvas.getContext('2d', { alpha: false });
        }

        this.trackCanvas.width = Math.ceil((maxX - minX) + padding * 2);
        this.trackCanvas.height = Math.ceil((maxY - minY) + padding * 2);

        const ctx = this.trackCtx;
        const offsetX = -this.trackCanvasOrigin.x;
        const offsetY = -this.trackCanvasOrigin.y;
        const mapTrackPoint = (point) => ({
            x: point.x * gs + offsetX,
            y: point.y * gs + offsetY
        });

        // Off-track background
        ctx.fillStyle = CONFIG.offTrackColor;
        ctx.fillRect(0, 0, this.trackCanvas.width, this.trackCanvas.height);

        // Track surface path (for fill)
        const surfacePath = new Path2D();
        let mappedPoint = mapTrackPoint(outer[0]);
        surfacePath.moveTo(mappedPoint.x, mappedPoint.y);
        for (let i = 1; i < outer.length; i++) {
            mappedPoint = mapTrackPoint(outer[i]);
            surfacePath.lineTo(mappedPoint.x, mappedPoint.y);
        }
        surfacePath.closePath();
        mappedPoint = mapTrackPoint(inner[0]);
        surfacePath.moveTo(mappedPoint.x, mappedPoint.y);
        for (let i = 1; i < inner.length; i++) {
            mappedPoint = mapTrackPoint(inner[i]);
            surfacePath.lineTo(mappedPoint.x, mappedPoint.y);
        }
        surfacePath.closePath();

        // Outer curb path
        const outerCurbPath = new Path2D();
        mappedPoint = mapTrackPoint(outer[0]);
        outerCurbPath.moveTo(mappedPoint.x, mappedPoint.y);
        for (let i = 1; i < outer.length; i++) {
            mappedPoint = mapTrackPoint(outer[i]);
            outerCurbPath.lineTo(mappedPoint.x, mappedPoint.y);
        }
        outerCurbPath.closePath();

        // Inner curb path
        const innerCurbPath = new Path2D();
        mappedPoint = mapTrackPoint(inner[0]);
        innerCurbPath.moveTo(mappedPoint.x, mappedPoint.y);
        for (let i = 1; i < inner.length; i++) {
            mappedPoint = mapTrackPoint(inner[i]);
            innerCurbPath.lineTo(mappedPoint.x, mappedPoint.y);
        }
        innerCurbPath.closePath();

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
            const step = 18;
            for (let i = 0; i < poly.length; i += step) {
                const p = poly[i];
                const px = p.x * gs + offsetX;
                const py = p.y * gs + offsetY;
                const prev = poly[(i - 1 + poly.length) % poly.length];
                const next = poly[(i + 1) % poly.length];
                const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
                this.drawTireBarrier(ctx, px, py, angle);
            }
        };
        drawTires(outer);

        const sl = this.currentTrack.startLine;
        this.drawCheckeredLine(
            ctx,
            { x: sl.p1.x * gs + offsetX, y: sl.p1.y * gs + offsetY },
            { x: sl.p2.x * gs + offsetX, y: sl.p2.y * gs + offsetY },
            10
        );
    }

    async loadTrack(trackKey, { trackPageview = true } = {}) {
        const nextTrack = TRACKS[trackKey];
        if (!nextTrack) return;

        if (trackPageview) {
            this.analytics.trackPageview(`/track/${trackKey}`, trackKey);
        }

        // Track map selection statistics
        this.mapStats[trackKey] = (this.mapStats[trackKey] || 0) + 1;

        const requestId = ++this.trackLoadRequestId;
        this.currentTrack = nextTrack;
        this.currentTrackKey = trackKey;

        // Sync selector
        this.ui.setTrackSelection(trackKey);

        const runtime = buildTrackRuntime(this.currentTrack, {
            qualityLevel: this.qualityLevel,
            frameSkip: this.frameSkip
        });
        this.activeGeometry.outer = runtime.outer;
        this.activeGeometry.inner = runtime.inner;
        this.collisionSegments = runtime.collisionSegments;

        // Build cached paths for performance
        this.buildTrackPaths();

        // Stop the current run immediately so physics and collision checks
        // cannot continue against the new track geometry while storage loads.
        this.bestLapTime = null;
        this.ui.setBestTime(null);
        this.reset();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }

        // Load best lap time for this track
        try {
            const [trackData, hasAnyData] = await Promise.all([
                getTrackData(trackKey),
                hasAnyTrackData()
            ]);
            if (requestId !== this.trackLoadRequestId) return;
            this.bestLapTime = trackData.bestTime;
            this.hasAnyData = hasAnyData;
            this.ui.setBestTime(this.bestLapTime);
            this.ui.refreshStartOverlay(this.status, this.hasAnyData);
        } catch (error) {
            console.error('Error loading track data:', error);
            if (requestId !== this.trackLoadRequestId) return;
            this.bestLapTime = null;
            this.ui.setBestTime(null);
            this.ui.refreshStartOverlay(this.status, this.hasAnyData);
        }
    }

    handleKey(e, isDown) {
        if (!e.key) return;
        if (e.key.toLowerCase() === 'r' && isDown && this.ui.isModalActive()) {
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
        const nextState = updateSimulation({
            dt,
            state: {
                status: this.status,
                currentTime: this.currentTime,
                angle: this.angle,
                pos: this.pos,
                velocity: this.velocity,
                cachedSpeed: this.cachedSpeed,
                nextCheckpointIndex: this.nextCheckpointIndex,
                skidMarks: this.skidMarks,
                routeTrace: this.routeTrace,
                particles: this.particles,
                trailTimer: this.trailTimer,
                runHistory: this.runHistory,
                runHistoryTimer: this.runHistoryTimer,
                keys: this.keys
            },
            config: CONFIG,
            currentTrack: this.currentTrack,
            collisionSegments: this.collisionSegments,
            frameSkip: this.frameSkip,
            qualityLevel: this.qualityLevel,
            getIntersection
        });

        this.status = nextState.status;
        this.currentTime = nextState.currentTime;
        this.angle = nextState.angle;
        this.pos = nextState.pos;
        this.velocity = nextState.velocity;
        this.cachedSpeed = nextState.cachedSpeed;
        this.nextCheckpointIndex = nextState.nextCheckpointIndex;
        this.skidMarks = nextState.skidMarks;
        this.routeTrace = nextState.routeTrace;
        this.particles = nextState.particles;
        this.trailTimer = nextState.trailTimer;
        this.runHistory = nextState.runHistory;
        this.runHistoryTimer = nextState.runHistoryTimer;

        if (nextState.events.crashImpact !== null) {
            this.raceStats.crash++;
            this.ui.showModal('CRASHED', null, { isCrash: true, impact: nextState.events.crashImpact }, false);
        }
        if (nextState.events.winTriggered) {
            this.handleWin();
        }
    }

    async handleWin() {
        this.status = 'won';
        this.raceStats.win++;
        const finalTime = this.currentTime;
        const trackKey = this.currentTrackKey;
        const trackSnapshot = this.currentTrack;
        const trackLoadRequestId = this.trackLoadRequestId;
        const geometrySnapshot = {
            outer: this.activeGeometry.outer.map(({ x, y }) => ({ x, y })),
            inner: this.activeGeometry.inner.map(({ x, y }) => ({ x, y }))
        };
        const startLineSnapshot = {
            p1: { ...trackSnapshot.startLine.p1 },
            p2: { ...trackSnapshot.startLine.p2 }
        };
        const startPosSnapshot = { ...trackSnapshot.startPos };
        this.ui.syncHud({ time: finalTime, speed: this.cachedSpeed, force: true });
        this.recordRunPoint(this.pos);
        const runHistorySnapshot = this.runHistory.slice();

        // Save lap time
        let trackData;
        const previousBest = this.bestLapTime;
        try {
            trackData = await saveLapTime(trackKey, finalTime);
        } catch (error) {
            console.error('Error saving lap time:', error);
            // Fallback display
            trackData = {
                lapTimes: [finalTime],
                bestTime: previousBest ?? finalTime
            };
            if (finalTime < (previousBest ?? Infinity)) {
                trackData.bestTime = finalTime;
            }
        }

        if (trackLoadRequestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) {
            return;
        }

        // Update best lap time in memory/UI only if the player is still on the same track.
        this.bestLapTime = trackData.bestTime;
        this.hasAnyData = true;
        this.ui.setBestTime(this.bestLapTime);

        // Check if this is a new best
        const isNewBest = trackData.bestTime === finalTime && (previousBest === null || previousBest === undefined || finalTime < previousBest);
        const title = isNewBest ? 'New PB!' : 'FINISH LINE';

        this.lastSharePayload = {
            title,
            trackName: trackSnapshot.name,
            trackKey,
            lapTime: finalTime,
            bestTime: trackData.bestTime ?? finalTime,
            isNewBest,
            runHistory: runHistorySnapshot,
            trackGeometry: geometrySnapshot,
            startLine: startLineSnapshot,
            startPos: startPosSnapshot
        };
        this.ui.showModal(title, null, {
            lapTime: finalTime,
            bestTime: trackData.bestTime ?? finalTime,
            lapTimesArray: trackData.lapTimes || [],
            isNewBest
        }, Boolean(this.lastSharePayload));
        // Defer the heavy offscreen canvas work (single 640×640 render) until
        // after the modal's first transition frame has been painted. Without
        // this deferral the synchronous renderReplayFrame calls block the main
        // thread in the same task as classList.add('active'), causing the
        // opacity/transform transition to skip its first frame (visible stutter).
        requestAnimationFrame(() => {
            requestAnimationFrame(() => this.prepareShareAsset());
        });
    }

    reset(autoStart = false) {
        // Clear any running start sequences
        this.clearTimers();
        if (this.pendingStartFrame !== null) {
            cancelAnimationFrame(this.pendingStartFrame);
            this.pendingStartFrame = null;
        }

        this.pos = { ...this.currentTrack.startPos };
        this.prevPos = { ...this.currentTrack.startPos };
        this.velocity = { x: 0, y: 0 };
        this.angle = this.currentTrack.startAngle;
        this.prevAngle = this.currentTrack.startAngle;
        this.clearSteeringInput();
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
        this.ui.closeModal();
        this.shareService.reset({ visible: false });

        // Reset Visuals
        this.ui.resetCountdown();
        this.ui.resetHud();

        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const gs = CONFIG.gridSize;
        this.camera.x = (this.pos.x * gs) - cw / 2 / this.zoom;
        this.camera.y = (this.pos.y * gs) - ch / 2 / this.zoom;
        this._lookAheadX = 0;
        this._lookAheadY = 0;

        if (autoStart) {
            this.ui.hideStartOverlay();
            this.startSequence();
        } else {
            this.ui.showStartOverlay(this.hasAnyData);
        }
    }

    recordRunPoint(point) {
        this.runHistory = recordRunPoint(this.runHistory, point, {
            frameSkip: this.frameSkip,
            qualityLevel: this.qualityLevel
        });
    }

    getShareCaption(payload) {
        return `I ran ${payload.trackName} in 🏁 ${payload.lapTime.toFixed(2)}s. Can you beat it? \n 🏎️ vectorgp.run `;
    }

    getReplayLayout(payload, width, height, hudHeight) {
        const padding = 28;
        const trackOuter = payload.trackGeometry?.outer ?? this.activeGeometry.outer;
        const trackInner = payload.trackGeometry?.inner ?? this.activeGeometry.inner;
        const startPos = payload.startPos ?? this.currentTrack.startPos;
        const run = payload.runHistory.length > 1 ? payload.runHistory : [startPos, this.pos];
        const points = [...trackOuter, ...trackInner, ...run];
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

    traceMappedPath(ctx, points, mapPoint, closePath = false) {
        if (!points.length) return;
        const first = mapPoint(points[0]);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i++) {
            const point = mapPoint(points[i]);
            ctx.lineTo(point.x, point.y);
        }
        if (closePath) {
            ctx.closePath();
        }
    }

    renderReplayFrame(ctx, payload, layout, width, height, progress, options = {}) {
        const { hudHeight, run, mapPoint } = layout;
        const showHud = options.showHud ?? true;
        const showMarker = options.showMarker ?? true;
        const trackOuter = payload.trackGeometry?.outer ?? this.activeGeometry.outer;
        const trackInner = payload.trackGeometry?.inner ?? this.activeGeometry.inner;
        const startLine = payload.startLine ?? this.currentTrack.startLine;
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

        this.traceMappedPath(ctx, trackOuter, mapPoint, true);
        ctx.fillStyle = '#334155';
        ctx.fill();

        this.traceMappedPath(ctx, trackInner, mapPoint, true);
        ctx.fillStyle = '#020617';
        ctx.fill();

        this.traceMappedPath(ctx, trackOuter, mapPoint, true);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#f8fafc';
        ctx.lineJoin = 'round';
        ctx.stroke();

        this.traceMappedPath(ctx, trackInner, mapPoint, true);
        ctx.strokeStyle = '#cbd5e1';
        ctx.stroke();

        const lineStart = mapPoint(startLine.p1);
        const lineEnd = mapPoint(startLine.p2);
        this.drawCheckeredLine(ctx, lineStart, lineEnd, 8);

        ctx.strokeStyle = 'rgba(251, 113, 133, 0.2)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this.traceMappedPath(ctx, run, mapPoint);
        ctx.stroke();

        ctx.strokeStyle = '#fb7185';
        ctx.lineWidth = 8;
        this.traceMappedPath(ctx, revealedPoints, mapPoint);
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

    buildShareImageBlob(payload, options = {}) {
        const { includeCaption = true } = options;
        const width = 640;
        const height = 640;
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

        if (includeCaption) {
            this.drawShareCaption(ctx, payload, width, height);
        }

        return new Promise((resolve, reject) => {
            if (canvas.toBlob) {
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                        return;
                    }
                    reject(new Error('Canvas export returned an empty blob.'));
                }, 'image/jpeg', 0.9);
                return;
            }

            try {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                fetch(dataUrl)
                    .then((response) => response.blob())
                    .then(resolve)
                    .catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    drawShareCaption(ctx, payload, width, height) {
        const caption = this.getShareCaption(payload);
        const pad = 21;
        const lineHeight = 32;
        const fontSize = 24;
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
    }

    addCaptionToBlob(blob, payload) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                this.drawShareCaption(ctx, payload, canvas.width, canvas.height);
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', 0.9);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image for caption'));
            };
            img.src = url;
        });
    }

    prepareShareAsset() {
        if (!this.lastSharePayload) return;
        return this.shareService.prepare(this.lastSharePayload).catch((error) => {
            console.error('Error preparing share asset:', error);
            throw error;
        });
    }

    render(dt, alpha = 1) {
        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const gs = CONFIG.gridSize;

        // Interpolated display position (between physics steps). Skip when not playing to avoid jitter.
        const displayPos = (this.status === 'playing')
            ? {
                x: this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha,
                y: this.prevPos.y + (this.pos.y - this.prevPos.y) * alpha
            }
            : { x: this.pos.x, y: this.pos.y };
        const lerpAngle = (a, b, t) => {
            let d = b - a;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            return a + d * t;
        };
        const displayAngle = (this.status === 'playing') ? lerpAngle(this.prevAngle, this.angle, alpha) : this.angle;

        // 1. Fill Off-Track
        ctx.fillStyle = CONFIG.offTrackColor;
        ctx.fillRect(0, 0, cw, ch);

        // 2. Camera: dynamic look-ahead based on velocity to prevent whipping
        const speed = this.cachedSpeed;
        const mobileCameraMode = this.isCoarsePointer || this.isNarrowViewport;
        this.zoom = mobileCameraMode ? 0.75 : 1.0;

        // Target offset uses physical velocity, which takes time to change, 
        // unlike the immediate response of steering angle
        let targetLookAheadX = 0;
        let targetLookAheadY = 0;

        if (speed > 1) {
            const multiplier = mobileCameraMode ? 12 : 5;
            const maxOffset = mobileCameraMode ? Math.min(cw, ch) / 2.5 : Math.min(cw, ch) / 5;

            targetLookAheadX = this.velocity.x * multiplier;
            targetLookAheadY = this.velocity.y * multiplier;

            const mag = Math.hypot(targetLookAheadX, targetLookAheadY);
            if (mag > maxOffset) {
                targetLookAheadX = (targetLookAheadX / mag) * maxOffset;
                targetLookAheadY = (targetLookAheadY / mag) * maxOffset;
            }
        }

        // Keep the original camera lead response; only the rendered car uses corrected interpolation.
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
            ctx.drawImage(this.trackCanvas, this.trackCanvasOrigin.x, this.trackCanvasOrigin.y);
        }

        // 4. Skid Marks - removed slow clip operation
        if (this.skidMarks.length > 0) {
            ctx.fillStyle = CONFIG.skidColor;
            const startIdx = this.frameSkip > 0 ? Math.max(0, this.skidMarks.length - 50) : 0;

            for (let i = startIdx; i < this.skidMarks.length; i++) {
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
            const traceStep = Math.max(this.frameSkip > 0 ? 2 : 1, Math.ceil(this.routeTrace.length / 240));
            for (let i = traceStep; i < this.routeTrace.length; i += traceStep) {
                ctx.lineTo(this.routeTrace[i].x * gs, this.routeTrace[i].y * gs);
            }
            const lastTracePoint = this.routeTrace[this.routeTrace.length - 1];
            ctx.lineTo(lastTracePoint.x * gs, lastTracePoint.y * gs);
            ctx.lineTo(displayPos.x * gs, displayPos.y * gs);
            ctx.stroke();
        }

        // 8. Particles
        if (this.particles.length > 0) {
            for (const p of this.particles) {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life / p.maxLife;
                ctx.beginPath();
                ctx.arc(p.x * gs, p.y * gs, p.size, 0, Math.PI * 2);
                ctx.fill();
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

        // Track frame time history for adaptive quality using a rolling window.
        if (this.frameTimeHistory.length < 10) {
            this.frameTimeHistory.push(frameTime);
            this.frameTimeTotal += frameTime;
        } else {
            this.frameTimeTotal -= this.frameTimeHistory[this.frameTimeHistoryIndex];
            this.frameTimeHistory[this.frameTimeHistoryIndex] = frameTime;
            this.frameTimeTotal += frameTime;
            this.frameTimeHistoryIndex = (this.frameTimeHistoryIndex + 1) % 10;
        }

        // Calculate average frame time
        const avgFrameTime = this.frameTimeTotal / this.frameTimeHistory.length;
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
            this.ui.syncHud({ time: this.currentTime, speed: this.cachedSpeed });
        }

        requestAnimationFrame((t) => this.loop(t));
    }
}
