import { getIntersection } from './math.js?v=0.71';
import { CONFIG } from './config.js?v=0.71';

function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
}
import { TRACKS } from './tracks.js?v=0.80';
import { buildTrackCanvas } from './core/track-canvas.js?v=0.71';
import { buildTrackRuntime } from './core/track-runtime.js?v=0.71';
import { recordRunPoint, updateSimulation } from './core/simulation.js?v=0.71';
import { saveLapTime, getTrackData, hasAnyTrackData } from './storage.js?v=0.71';
import { AnalyticsService } from './services/analytics.js?v=0.72';
import { PlayerStatusStore } from './services/player-status.js?v=0.84';
import { SessionFlagStore } from './services/session-flags.js?v=0.71';
import { ShareService } from './services/share.js?v=0.80';
import { GameUi } from './ui.js?v=0.90';

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
        this.isReturningPlayer = false;
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
        this.currentTrackPageviewPending = false;
        this.currentTrackMapSelectionPending = false;

        // Session race stats (sent once on session end)
        this.raceStats = { start: 0, crash: 0, win: 0 };
        this.raceEventSent = false;
        this.playerTypeSent = false;
        this.mapStats = {};
        this.mapEventSent = false;
        this._previewPresentationOpId = 0;

        this.ui = new GameUi({
            isCoarsePointer: this.isCoarsePointer,
            onOpenTrackSelection: () => this.reset(false),
            onPreviewTrack: (trackKey) => {
                this.fadeThenLoadTrackForPreview(trackKey);
            },
            onPreviewPresentation: ({ opacity, instant }) => {
                this.applyPreviewPresentation({ opacity, instant });
            },
            onStart: (trackKey) => this.handleStartButton(trackKey),
            onShowPersonalBests: () => this.showPersonalBests(),
            onReset: () => {
                this.raceStats.start++;
                this.reset(true);
            },
            previewQualityLevel: this.qualityLevel,
            previewFrameSkip: this.frameSkip,
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
        this.playerStatus = new PlayerStatusStore();
        this.sessionFlags = new SessionFlagStore();
        this.shareService = new ShareService({
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
                this.isReturningPlayer = this.playerStatus.isReturningPlayer(hasAnyData);
                this.ui.refreshStartOverlay(this.status, this.hasAnyData);
                return {
                    hasAnyData,
                    isReturningPlayer: this.isReturningPlayer
                };
            })
            .catch((error) => {
                console.error('Error loading player history:', error);
                return {
                    hasAnyData: false,
                    isReturningPlayer: false
                };
            });

        // Listeners
        let resizeRafId = 0;
        new ResizeObserver(() => {
            cancelAnimationFrame(resizeRafId);
            resizeRafId = requestAnimationFrame(() => this.resize());
        }).observe(this.container);
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
        this.loadTrack('circuit', { trackPageview: false, countMapSelection: false });
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

    async handleStartButton(trackKey = this.currentTrackKey) {
        if (this.status !== 'ready' || this.startButtonPending) return;

        this.resetCanvasPresentation();
        this.startButtonPending = true;
        const playerTypeAlreadySent = this.sessionFlags.get('playerTypeSent');
        try {
            if (trackKey && trackKey !== this.currentTrackKey) {
                await this.loadTrack(trackKey, { trackPageview: false, countMapSelection: true });
            }

            if (this.currentTrackMapSelectionPending) {
                this.mapStats[this.currentTrackKey] = (this.mapStats[this.currentTrackKey] || 0) + 1;
                this.currentTrackMapSelectionPending = false;
            }

            if (this.currentTrackPageviewPending) {
                this.analytics.trackPageview(`/track/${this.currentTrackKey}`, this.currentTrackKey);
                this.currentTrackPageviewPending = false;
            }

            if (!this.playerTypeSent && !playerTypeAlreadySent) {
                const { isReturningPlayer } = await this.playerHistoryPromise;
                this.playerTypeSent = true;
                this.sessionFlags.set('playerTypeSent', '1');
                this.analytics.trackPlayerType(isReturningPlayer);
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
            this.prevPos.x = this.pos.x;
            this.prevPos.y = this.pos.y;
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

        this.resetCanvasPresentation();
        this.status = 'starting';
        this.ui.setHudPersonalBestsOpenAllowed(false);
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
            this.ui.hideStartLights();
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

    async loadTrack(trackKey, { trackPageview = true, countMapSelection = true } = {}) {
        const nextTrack = TRACKS[trackKey];
        if (!nextTrack) return;

        if (trackPageview) {
            this.analytics.trackPageview(`/track/${trackKey}`, trackKey);
            this.currentTrackPageviewPending = false;
        } else {
            this.currentTrackPageviewPending = true;
        }

        // Track map selection statistics
        if (countMapSelection) {
            this.mapStats[trackKey] = (this.mapStats[trackKey] || 0) + 1;
            this.currentTrackMapSelectionPending = false;
        } else {
            this.currentTrackMapSelectionPending = true;
        }

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
        const trackCanvasRuntime = buildTrackCanvas(this.currentTrack, this.activeGeometry);
        this.trackCanvas = trackCanvasRuntime.canvas;
        this.trackCanvasOrigin = trackCanvasRuntime.origin;

        // Stop the current run immediately so physics and collision checks
        // cannot continue against the new track geometry while storage loads.
        this.bestLapTime = null;
        // Show cached PB immediately so the HUD/carousel do not flash hidden between IDB reads.
        this.ui.setBestTime(this.ui.getCachedPersonalBestForTrack(trackKey));

        try {
            const [trackData, hasAnyData] = await Promise.all([
                getTrackData(trackKey),
                hasAnyTrackData()
            ]);
            if (requestId !== this.trackLoadRequestId) return;
            this.bestLapTime = trackData.bestTime;
            this.hasAnyData = hasAnyData;
            this.isReturningPlayer = this.playerStatus.isReturningPlayer(hasAnyData);
            this.ui.setBestTime(this.bestLapTime);
        } catch (error) {
            console.error('Error loading track data:', error);
            if (requestId !== this.trackLoadRequestId) return;
            this.bestLapTime = null;
            this.isReturningPlayer = false;
            this.ui.setBestTime(null);
        }

        this.reset();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    }

    handleKey(e, isDown) {
        if (!e.key) return;
        if (e.key.toLowerCase() === 'r' && isDown && this.ui.isModalActive()) {
            e.preventDefault();
            if (this.ui.isStandaloneRunsViewActive()) {
                this.ui.closeModal();
                return;
            }
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
            this.ui.setHudPersonalBestsOpenAllowed(true);
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
        this.isReturningPlayer = this.playerStatus.isReturningPlayer(true);
        this.ui.setBestTime(this.bestLapTime);
        this.ui.setHudPersonalBestsOpenAllowed(true);

        // Check if this is a new best
        const isNewBest = trackData.bestTime === finalTime && (previousBest === null || previousBest === undefined || finalTime < previousBest);
        const title = isNewBest ? 'New PB!' : trackSnapshot.name;

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
        // Keep the first modal frame cheap, then build the share preview after
        // the entrance transition has started. The UI reserves the win-modal
        // preview/share layout in advance so this async work no longer causes
        // a visible second-step resize when it completes.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.shareService.prepare(this.lastSharePayload).catch((error) => {
                    console.error('Error preparing share asset:', error);
                });
            });
        });
    }

    async showPersonalBests() {
        if (
            this.status === 'playing'
            || this.status === 'starting'
            || this.ui.isStandaloneRunsViewActive()
            || this.bestLapTime === null
            || this.bestLapTime === undefined
        ) return;

        const trackKey = this.currentTrackKey;
        const requestId = this.trackLoadRequestId;
        try {
            const trackData = await getTrackData(trackKey);
            if (requestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) return;
            if (!trackData.lapTimes?.length || trackData.bestTime === null || trackData.bestTime === undefined) return;
            const returnMode = this.ui.isModalActive() ? 'back' : 'close';
            this.ui.showRunsModal(trackData.lapTimes, trackData.bestTime, null, returnMode);
        } catch (error) {
            console.error('Error loading personal bests:', error);
        }
    }

    reset(autoStart = false) {
        // Clear any running start sequences
        this.clearTimers();
        if (this.pendingStartFrame !== null) {
            cancelAnimationFrame(this.pendingStartFrame);
            this.pendingStartFrame = null;
        }

        const wasModalActive = this.ui.isModalActive();

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
        this.shareService.reset({ visible: false, preservePreview: wasModalActive, preserveVisibility: wasModalActive });
        this.ui.setHudPersonalBestsOpenAllowed(!autoStart);

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
            this.resetCanvasPresentation();
        }
    }

    resetCanvasPresentation() {
        if (!this.canvas) return;
        this.canvas.classList.remove('canvas-opacity-instant');
        this.canvas.style.transition = '';
        this.canvas.style.opacity = '1';
    }

    applyPreviewPresentation({ opacity, instant }) {
        if (this.status !== 'ready' || !this.canvas) return;
        const c = this.canvas;
        if (instant) {
            c.classList.add('canvas-opacity-instant');
            c.style.opacity = String(opacity);
        } else {
            c.classList.remove('canvas-opacity-instant');
            c.style.opacity = String(opacity);
        }
    }

    _animateCanvasOpacity(target, durationMs) {
        return new Promise((resolve) => {
            const c = this.canvas;
            if (!c) {
                resolve();
                return;
            }
            c.classList.remove('canvas-opacity-instant');
            const ms = Math.max(0, durationMs);
            c.style.transition = `opacity ${ms}ms cubic-bezier(0.25, 0.82, 0.2, 1)`;
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                c.removeEventListener('transitionend', onEnd);
                resolve();
            };
            const onEnd = (e) => {
                if (e.target !== c || e.propertyName !== 'opacity') return;
                finish();
            };
            c.addEventListener('transitionend', onEnd);
            requestAnimationFrame(() => {
                c.style.opacity = String(target);
            });
            setTimeout(finish, ms + 70);
        });
    }

    async fadeThenLoadTrackForPreview(trackKey) {
        if (this.status !== 'ready' || !trackKey || trackKey === this.currentTrackKey) return;

        const op = ++this._previewPresentationOpId;
        try {
            await this._animateCanvasOpacity(0, 175);
            if (op !== this._previewPresentationOpId || this.status !== 'ready') return;
            await this.loadTrack(trackKey, { trackPageview: false, countMapSelection: false });
            if (op !== this._previewPresentationOpId || this.status !== 'ready') return;
            await this._animateCanvasOpacity(1, 320);
        } catch (error) {
            console.error('Error fading preview track:', error);
            if (this.status === 'ready') {
                this.resetCanvasPresentation();
            }
        }
    }

    recordRunPoint(point) {
        this.runHistory = recordRunPoint(this.runHistory, point, {
            frameSkip: this.frameSkip,
            qualityLevel: this.qualityLevel
        });
    }

    getDesiredLookAhead(speed, cw, ch, mobileCameraMode) {
        let targetLookAheadX = 0;
        let targetLookAheadY = 0;

        if (speed > 1) {
            const multiplier = mobileCameraMode ? 12 : 5;
            const maxOffset = mobileCameraMode ? Math.min(cw, ch) / 2.5 : Math.min(cw, ch) / 5;

            targetLookAheadX = this.velocity.x * multiplier;
            targetLookAheadY = this.velocity.y * multiplier;

            const magnitude = Math.hypot(targetLookAheadX, targetLookAheadY);
            if (magnitude > maxOffset) {
                targetLookAheadX = (targetLookAheadX / magnitude) * maxOffset;
                targetLookAheadY = (targetLookAheadY / magnitude) * maxOffset;
            }
        }

        return { x: targetLookAheadX, y: targetLookAheadY };
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
        const displayAngle = (this.status === 'playing') ? lerpAngle(this.prevAngle, this.angle, alpha) : this.angle;

        // 1. Fill Off-Track
        ctx.fillStyle = CONFIG.offTrackColor;
        ctx.fillRect(0, 0, cw, ch);

        // 2. Camera: dynamic look-ahead based on velocity to prevent whipping
        const speed = this.cachedSpeed;
        const mobileCameraMode = this.isCoarsePointer || this.isNarrowViewport;
        this.zoom = mobileCameraMode ? 0.75 : 1.0;

        const desiredLookAhead = this.getDesiredLookAhead(speed, cw, ch, mobileCameraMode);

        // Keep the original camera lead response; only the rendered car uses corrected interpolation.
        const lerpFactor = 1 - Math.exp(-dt * 4);

        this._lookAheadX += (desiredLookAhead.x - this._lookAheadX) * lerpFactor;
        this._lookAheadY += (desiredLookAhead.y - this._lookAheadY) * lerpFactor;

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
            const z = this.zoom;
            const cx = this.camera.x;
            const cy = this.camera.y;

            for (let i = startIdx; i < this.skidMarks.length; i++) {
                const m = this.skidMarks[i];
                const mx = m.x * gs;
                const my = m.y * gs;
                const cos = Math.cos(m.angle);
                const sin = Math.sin(m.angle);
                const a = z * cos;
                const b = z * sin;
                ctx.setTransform(a, b, -b, a, z * (mx - cx), z * (my - cy));
                ctx.fillRect(-10, -5, 4, 10);
                ctx.fillRect(-10, 5, 4, 10);
            }
            // Restore parent transform (zoom + camera offset)
            ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
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
            this.prevPos.x = this.pos.x;
            this.prevPos.y = this.pos.y;
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
