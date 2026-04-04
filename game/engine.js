import { getIntersection } from './math.js?v=1.32';
import { CONFIG } from './config.js?v=1.32';
import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from './modes.js?v=1.32';

function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
}
import { TRACKS } from './tracks.js?v=1.32';
import { getTrackCanvasAsset, getTrackRuntimeAsset } from './core/track-assets.js?v=1.32';
import { updateSimulation } from './core/simulation.js?v=1.32';
import { RingBuffer } from './core/ring-buffer.js?v=1.32';
import { saveLapTime, saveBestTime, getTrackData, hasAnyTrackData } from './storage.js?v=1.32';
import { AnalyticsService } from './services/analytics.js?v=1.32';
import { PlayerStatusStore } from './services/player-status.js?v=1.32';
import { SessionFlagStore } from './services/session-flags.js?v=1.32';
import { getScoreboardSnapshot } from './services/scoreboard.js?v=1.32';
import { ShareService } from './services/share.js?v=1.32';
import { GameUi } from './ui.js?v=1.32';

const SCOREBOARD_REPLAY_MAX_FRAMES = 20000;

function shouldExposeDebugHooks() {
    if (typeof window === 'undefined') return false;

    const hostname = window.location?.hostname || '';
    return (
        hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1'
        || hostname === '0.0.0.0'
        || window.location?.protocol === 'file:'
    );
}

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
        this.collisionHash = null;
        this.trackCanvasOrigin = { x: 0, y: 0 };

        // Game State
        this.status = 'ready';
        this.currentTime = 0;
        this.nextCheckpointIndex = 0; // next checkpoint to pass this lap
        this.bestLapTime = null; // Best lap time for current track
        this.localBestTimesByMode = this.createEmptyBestTimesByMode();
        this.rankedBestTimesByMode = this.createEmptyBestTimesByMode();
        this.bestTimesByMode = this.createEmptyBestTimesByMode();
        this.currentModeKey = TRACK_MODE_STANDARD;
        this.currentIsRanked = false;
        this.practiceEndOnCrash = false;
        this.practiceSession = null;
        this.pendingPracticeBestSavePromise = null;
        this.hasAnyData = false; // Whether any track has ever been raced
        this.isReturningPlayer = false;
        this.activeTimers = []; // Keep track of active timeouts/intervals

        // Visuals — ring buffers with pre-allocated slots (zero alloc during gameplay)
        this.skidMarks = new RingBuffer(160, () => ({ x: 0, y: 0, cos: 0, sin: 0 }));
        this.routeTrace = new RingBuffer(480, () => ({ x: 0, y: 0 }));
        this.particles = [];
        this.trailTimer = 0;

        // Input
        this.keys = { left: false, right: false }; // Only steering
        this.steeringSources = { left: new Set(), right: new Set() };

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

        // Pre-computed friction factor (constant for fixed timestep)
        this.frictionFactor = Math.pow(CONFIG.friction, this.FIXED_DT * 60);

        this.runHistory = new RingBuffer(1400, () => ({ x: 0, y: 0 }));
        this.runHistoryTimer = 0;

        // Pre-allocated render objects (avoid per-frame allocation)
        this._displayPos = { x: 0, y: 0 };
        this._desiredLookAhead = { x: 0, y: 0 };
        this._boundLoop = (t) => this.loop(t);
        this._frameRequestId = null;
        this._needsRender = true;
        this.lastSharePayload = null;
        this.trackLoadRequestId = 0;
        this.pendingStartFrame = null;
        this.startButtonPending = false;
        this.relaunchDelayRemaining = 0;
        this.currentTrackPageviewPending = false;
        this.currentTrackMapSelectionPending = false;
        this.activeRunId = 0;
        this.scoreboardReplaySegments = [];
        this.scoreboardReplayFrameCount = 0;
        this.scoreboardReplayOverflowed = false;

        // Umami aggregates (sent once each on pagehide when that mode had any starts)
        this.trialRaceStats = {
            local: { start: 0, crash: 0, win: 0 },
            ranked: { start: 0, crash: 0, win: 0 }
        };
        this.sessionRaceStats = {
            local: { start: 0, crash: 0 },
            ranked: { start: 0, crash: 0 }
        };
        this.trialRaceEventSent = false;
        this.sessionRaceEventSent = false;
        this.playerTypeSent = false;
        this.mapStats = {};
        this.mapEventSent = false;
        this._previewPresentationOpId = 0;

        this.ui = new GameUi({
            isCoarsePointer: this.isCoarsePointer,
            onPreviewTrack: (trackKey) => {
                this.fadeThenLoadTrackForPreview(trackKey);
            },
            onPreviewPresentation: ({ opacity, instant }) => {
                this.applyPreviewPresentation({ opacity, instant });
            },
            onStart: (trackKey, trackPreferences) => this.handleStartButton(trackKey, trackPreferences),
            onShowPersonalBests: () => this.showPersonalBests(),
            onPausePractice: () => this.pausePracticeSession(),
            onSupportClick: () => this.analytics.trackSupportClick(),
            onHeaderMenuOpen: () => this.analytics.trackHeaderMenuOpen(),
            onHowToPlayOpen: () => {
                this.analytics.trackHowToPlayOpen();
                this.analytics.trackPageview('/how-to-play', 'How to Play');
            },
            onReset: () => {
                this.bumpRaceStartForCurrentMode();
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
                this.ui.refreshStartOverlay(this.status, this.hasAnyData, this.isReturningPlayer);
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
            this.sendRaceAnalytics();
            this.sendMapEvent();
        });
        this.ui.bindSteeringControls({
            onLeftDown: () => this.setTouchSteering('left', true),
            onLeftUp: () => this.setTouchSteering('left', false),
            onRightDown: () => this.setTouchSteering('right', true),
            onRightUp: () => this.setTouchSteering('right', false)
        });

        this.resize();
        this.loadTrack('circuit', { trackPageview: false, countMapSelection: false });
        if (shouldExposeDebugHooks()) {
            this.exposeTestHooks();
        } else {
            delete window.__RACER_DEBUG__;
        }

        this.lastTime = this.getNow();
        this.requestFrame();
    }

    bumpRaceStartForCurrentMode() {
        const scoreModeKey = this.getCurrentScoreModeAnalyticsKey();
        if (this.isPracticeMode()) {
            this.sessionRaceStats[scoreModeKey].start++;
        } else {
            this.trialRaceStats[scoreModeKey].start++;
        }
    }

    sendRaceAnalytics() {
        const trialRaceStartCount = this.trialRaceStats.local.start + this.trialRaceStats.ranked.start;
        if (!this.trialRaceEventSent && trialRaceStartCount > 0) {
            this.trialRaceEventSent = true;
            this.analytics.trackTrialRace(this.trialRaceStats);
        }
        const sessionRaceStartCount = this.sessionRaceStats.local.start + this.sessionRaceStats.ranked.start;
        if (!this.sessionRaceEventSent && sessionRaceStartCount > 0) {
            this.sessionRaceEventSent = true;
            this.analytics.trackSessionRace(this.sessionRaceStats);
        }
    }

    sendMapEvent() {
        const anyStarts =
            this.trialRaceStats.local.start
            + this.trialRaceStats.ranked.start
            + this.sessionRaceStats.local.start
            + this.sessionRaceStats.ranked.start;
        if (this.mapEventSent || anyStarts === 0 || Object.keys(this.mapStats).length === 0) return;
        this.mapEventSent = true;
        this.analytics.trackMapEvent(this.mapStats);
    }

    getCurrentScoreModeAnalyticsKey() {
        return this.currentIsRanked ? 'ranked' : 'local';
    }

    getCurrentMapStatsKey() {
        return `${this.currentTrackKey}_${this.getCurrentScoreModeAnalyticsKey()}`;
    }

    bumpMapSelectionForCurrentTrack() {
        const mapStatsKey = this.getCurrentMapStatsKey();
        this.mapStats[mapStatsKey] = (this.mapStats[mapStatsKey] || 0) + 1;
    }

    getNow() {
        return performance.now() + this.timeOffsetMs;
    }

    async handleStartButton(trackKey = this.currentTrackKey, trackPreferences = null) {
        if (this.status !== 'ready' || this.startButtonPending) return;

        this.resetCanvasPresentation();
        this.startButtonPending = true;
        const playerTypeAlreadySent = this.sessionFlags.get('playerTypeSent');
        try {
            if (trackKey && trackKey !== this.currentTrackKey) {
                await this.loadTrack(trackKey, { trackPageview: false, countMapSelection: true });
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

            this.applyRunPreferences(trackPreferences);
            if (this.currentTrackMapSelectionPending) {
                this.bumpMapSelectionForCurrentTrack();
                this.currentTrackMapSelectionPending = false;
            }
            this.bumpRaceStartForCurrentMode();
            this.startSequence();
        } finally {
            this.startButtonPending = false;
        }
    }

    applyRunPreferences(trackPreferences) {
        this.currentModeKey = trackPreferences?.mode === TRACK_MODE_PRACTICE
            ? TRACK_MODE_PRACTICE
            : TRACK_MODE_STANDARD;
        this.currentIsRanked = Boolean(trackPreferences?.ranked);
        this.practiceEndOnCrash = this.currentModeKey === TRACK_MODE_PRACTICE
            ? Boolean(this.currentTrack.practice?.endOnCrash)
            : false;
        this.practiceSession = null;
        this.ui.setPracticePauseVisible(false);
        this.refreshActiveBestTimes();
        this.ui.setBestTime(this.bestLapTime, {
            trackKey: this.currentTrackKey,
            mode: this.currentModeKey,
            ranked: this.currentIsRanked
        });
    }

    createEmptyBestTimesByMode() {
        return {
            [TRACK_MODE_STANDARD]: null,
            [TRACK_MODE_PRACTICE]: null
        };
    }

    setStoredBestTimes(trackData) {
        this.localBestTimesByMode = {
            ...this.createEmptyBestTimesByMode(),
            ...(trackData?.bestTimes || {})
        };
        this.rankedBestTimesByMode = {
            ...this.createEmptyBestTimesByMode(),
            ...(trackData?.rankedBestTimes || {})
        };
        this.refreshActiveBestTimes();
    }

    refreshActiveBestTimes() {
        const source = this.currentIsRanked
            ? this.rankedBestTimesByMode
            : this.localBestTimesByMode;
        this.bestTimesByMode = {
            ...this.createEmptyBestTimesByMode(),
            ...(source || {})
        };
        this.bestLapTime = this.bestTimesByMode[this.currentModeKey] ?? null;
    }

    createPracticeSession() {
        return {
            trackKey: this.currentTrackKey,
            endOnCrash: this.practiceEndOnCrash,
            lapCount: 0,
            hasNewPersonalBest: false,
            bestLap: null,
            bestLapRunHistory: null,
            recentLaps: []
        };
    }

    isPracticeMode() {
        return this.currentModeKey === TRACK_MODE_PRACTICE;
    }

    getPracticeSummary() {
        if (!this.practiceSession) {
            return {
                bestLap: null,
                laps: []
            };
        }

        return {
            bestLap: this.practiceSession.bestLap ? { ...this.practiceSession.bestLap } : null,
            laps: this.practiceSession.recentLaps.map((lap) => ({ ...lap }))
        };
    }

    exposeTestHooks() {
        window.__RACER_DEBUG__ = Object.freeze({
            renderGameToText: () => this.renderGameToText(),
            advanceTime: (ms) => this.advanceTime(ms)
        });
    }

    renderGameToText() {
        return JSON.stringify({
            coordinateSystem: 'origin top-left, x increases right, y increases down, units are track-grid cells',
            mode: this.status,
            runMode: this.currentModeKey,
            track: this.currentTrackKey,
            player: {
                x: Number(this.pos.x.toFixed(2)),
                y: Number(this.pos.y.toFixed(2)),
                angle: Number(this.angle.toFixed(3)),
                speed: Number(this.cachedSpeed.toFixed(2))
            },
            lapTime: Number(this.currentTime.toFixed(2)),
            practiceLaps: this.practiceSession?.recentLaps?.length || 0,
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
        this.ui.setPracticePauseVisible(false);
        this.practiceSession = this.isPracticeMode() ? this.createPracticeSession() : null;
        this.resetScoreboardReplay();
        this.ui.setBestTime(this.bestLapTime);
        this.runHistory.clear();
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
                this.activeRunId += 1;
                this.currentTime = 0;
                this.lastTime = t;
                this.resetFrameTimingHistory();
                this.frameSkip = 0;
                this.ui.setPracticePauseVisible(true);
                this.requestRender();

                // Cleanup visuals after start
                this.activeTimers.push(setTimeout(() => {
                    this.ui.resetCountdown();
                }, 1500));
            });
        }, 2500));
    }

    syncSteeringKeys() {
        this.keys.left = this.steeringSources.left.size > 0;
        this.keys.right = this.steeringSources.right.size > 0;
    }

    setSteeringSource(direction, sourceId, isDown) {
        const directionSources = this.steeringSources[direction];
        if (!directionSources || !sourceId) return;
        if (isDown) directionSources.add(sourceId);
        else directionSources.delete(sourceId);
        this.syncSteeringKeys();
    }

    setTouchSteering(direction, isDown) {
        this.setSteeringSource(direction, `touch:${direction}`, isDown);
    }

    getSteeringDirection(e) {
        const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
        const code = typeof e.code === 'string' ? e.code : '';

        if (key === 'a' || key === 'arrowleft' || key === 'left' || code === 'KeyA' || code === 'ArrowLeft') {
            return 'left';
        }
        if (key === 'd' || key === 'arrowright' || key === 'right' || code === 'KeyD' || code === 'ArrowRight') {
            return 'right';
        }
        return null;
    }

    getSteeringSourceId(e, direction) {
        if (typeof e.code === 'string' && e.code) {
            return `keyboard:${e.code}`;
        }
        if (typeof e.key === 'string' && e.key) {
            return `keyboard:${e.key.toLowerCase()}`;
        }
        return `keyboard:${direction}`;
    }

    clearSteeringInput() {
        this.steeringSources.left.clear();
        this.steeringSources.right.clear();
        this.syncSteeringKeys();
        this.ui.resetTouchControls();
    }

    armRelaunchDelay(delaySeconds) {
        this.clearSteeringInput();
        this.relaunchDelayRemaining = delaySeconds;
    }

    persistPracticeBestTime(bestTime) {
        const trackKey = this.currentTrackKey;
        const requestId = this.trackLoadRequestId;

        const replay = this.currentIsRanked
            ? this.getScoreboardReplayPayload(this.practiceSession?.lapCount || 1)
            : null;
        const savePromise = saveBestTime(trackKey, bestTime, TRACK_MODE_PRACTICE, {
            ranked: this.currentIsRanked,
            replay
        })
            .then((trackData) => {
                if (requestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) return;
                this.setStoredBestTimes(trackData);
                this.ui.setBestTime(this.bestLapTime, {
                    trackKey,
                    mode: this.currentModeKey,
                    ranked: this.currentIsRanked,
                    scoreboardSubmitPromise: trackData.scoreboardSubmitPromise || null
                });
                return trackData.scoreboardSubmitPromise || null;
            })
            .then((scoreboardSubmitPromise) => scoreboardSubmitPromise || null)
            .catch((error) => {
                console.error('Error saving practice best time:', error);
            })
            .finally(() => {
                if (this.pendingPracticeBestSavePromise === savePromise) {
                    this.pendingPracticeBestSavePromise = null;
                }
            });
        this.pendingPracticeBestSavePromise = savePromise;
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

    resetScoreboardReplay() {
        this.scoreboardReplaySegments = [];
        this.scoreboardReplayFrameCount = 0;
        this.scoreboardReplayOverflowed = false;
    }

    recordScoreboardReplayFrame() {
        if (this.scoreboardReplayOverflowed) return;

        if (this.scoreboardReplayFrameCount >= SCOREBOARD_REPLAY_MAX_FRAMES) {
            this.scoreboardReplayOverflowed = true;
            return;
        }

        const left = Boolean(this.keys.left);
        const right = Boolean(this.keys.right);
        const relaunchDelay = this.relaunchDelayRemaining > 0;
        const lastSegment = this.scoreboardReplaySegments[this.scoreboardReplaySegments.length - 1];

        if (
            lastSegment
            && lastSegment.left === left
            && lastSegment.right === right
            && lastSegment.relaunchDelay === relaunchDelay
        ) {
            lastSegment.frames += 1;
        } else {
            this.scoreboardReplaySegments.push({
                frames: 1,
                left,
                right,
                relaunchDelay
            });
        }

        this.scoreboardReplayFrameCount += 1;
    }

    getScoreboardReplayPayload(targetLapNumber = 1) {
        if (this.scoreboardReplayOverflowed || this.scoreboardReplayFrameCount <= 0) {
            return null;
        }

        return {
            targetLapNumber,
            inputs: this.scoreboardReplaySegments.map((segment) => ({ ...segment }))
        };
    }

    resize() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.isNarrowViewport = window.innerWidth <= 768;
        this.requestRender();
    }

    shouldAnimateFrame() {
        return this.status === 'playing' || this.particles.length > 0;
    }

    requestFrame() {
        if (this._frameRequestId !== null) return;
        this._frameRequestId = requestAnimationFrame(this._boundLoop);
    }

    requestRender() {
        this._needsRender = true;
        this.requestFrame();
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

        const requestId = ++this.trackLoadRequestId;
        this.currentTrack = nextTrack;
        this.currentTrackKey = trackKey;

        // Sync selector
        this.ui.setTrackSelection(trackKey);

        const trackAssetOptions = {
            qualityLevel: this.qualityLevel,
            frameSkip: this.frameSkip
        };
        const runtime = getTrackRuntimeAsset(trackKey, this.currentTrack, trackAssetOptions);
        this.activeGeometry.outer = runtime.outer;
        this.activeGeometry.inner = runtime.inner;
        this.collisionSegments = runtime.collisionSegments;
        this.collisionHash = runtime.collisionHash;
        const trackCanvasRuntime = getTrackCanvasAsset(trackKey, this.currentTrack, trackAssetOptions);
        this.trackCanvas = trackCanvasRuntime.canvas;
        this.trackCanvasOrigin = trackCanvasRuntime.origin;

        // Stop the current run immediately so physics and collision checks
        // cannot continue against the new track geometry while storage loads.
        this.bestLapTime = null;
        const previewPreferences = this.ui.getTrackPreferences(trackKey);
        const previewModeKey = previewPreferences.mode === TRACK_MODE_PRACTICE
            ? TRACK_MODE_PRACTICE
            : TRACK_MODE_STANDARD;
        this.currentModeKey = previewModeKey;
        this.currentIsRanked = Boolean(previewPreferences.ranked);

        // Track map selection statistics by actual score mode.
        if (countMapSelection) {
            this.bumpMapSelectionForCurrentTrack();
            this.currentTrackMapSelectionPending = false;
        } else {
            this.currentTrackMapSelectionPending = true;
        }
        // Show cached PB immediately so the HUD/carousel do not flash hidden between IDB reads.
        this.ui.setBestTime(this.ui.getCachedPersonalBestForTrack(trackKey), {
            persistToTrackCard: false
        });

        try {
            const [trackData, hasAnyData] = await Promise.all([
                getTrackData(trackKey),
                hasAnyTrackData()
            ]);
            if (requestId !== this.trackLoadRequestId) return;
            this.setStoredBestTimes(trackData);
            this.hasAnyData = hasAnyData;
            this.isReturningPlayer = this.playerStatus.isReturningPlayer(hasAnyData);
            this.ui.setBestTime(this.bestLapTime, {
                persistToTrackCard: false
            });
        } catch (error) {
            console.error('Error loading track data:', error);
            if (requestId !== this.trackLoadRequestId) return;
            this.localBestTimesByMode = this.createEmptyBestTimesByMode();
            this.rankedBestTimesByMode = this.createEmptyBestTimesByMode();
            this.refreshActiveBestTimes();
            this.isReturningPlayer = false;
            this.ui.setBestTime(null);
        }

        this.reset();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    }

    handleKey(e, isDown) {
        if (!e.key && !e.code) return;
        if (
            isDown
            && !this.isCoarsePointer
            && e.key === 'Escape'
            && this.status === 'playing'
        ) {
            e.preventDefault?.();
            this.pausePracticeSession();
            return;
        }
        if (e.key.toLowerCase() === 'r' && isDown && this.ui.isModalActive()) {
            e.preventDefault();
            if (this.ui.isPauseModalActive()) {
                return;
            }
            if (this.ui.isStandaloneRunsViewActive()) {
                this.ui.closeModal();
                return;
            }
            this.bumpRaceStartForCurrentMode();
            this.reset(true);
            return;
        }
        const steeringDirection = this.getSteeringDirection(e);
        if (steeringDirection) {
            e.preventDefault?.();
            this.setSteeringSource(steeringDirection, this.getSteeringSourceId(e, steeringDirection), isDown);
        }
    }

    async pausePracticeSession() {
        if (this.status !== 'playing') return;

        this.clearSteeringInput();
        this.status = 'paused';

        if (!this.isPracticeMode()) {
            const bestTime = this.bestTimesByMode[TRACK_MODE_STANDARD] ?? null;
            const deltaToBest = bestTime === null || bestTime === undefined
                ? null
                : this.currentTime - bestTime;
            this.lastSharePayload = null;
            this.ui.showModal('Paused', null, {
                variant: 'standard-pause',
                lapTime: this.currentTime,
                bestTime,
                deltaToBest
            }, false, {
                modalKind: 'practice-pause',
                primaryActionLabel: 'Resume',
                primaryShortcutLabel: null,
                primaryActionIcon: 'play',
                primaryAction: () => this.resumePracticeSession(),
                secondaryActionLabel: 'Done',
                secondaryActionIcon: 'done',
                secondaryAction: () => this.reset(false)
            });
            return;
        }

        const practiceSharePayload = this.getPracticeSharePayload();
        const practiceSummary = this.getPracticeSummary();
        const bestSessionLapTime = this.practiceSession?.bestLap?.time ?? null;
        const bestOverallPracticeTime = this.bestTimesByMode[TRACK_MODE_PRACTICE] ?? null;
        const deltaToBest = bestSessionLapTime === null || bestSessionLapTime === undefined
            || bestOverallPracticeTime === null || bestOverallPracticeTime === undefined
            ? null
            : bestSessionLapTime - bestOverallPracticeTime;
        const trackKey = this.currentTrackKey;
        const requestId = this.trackLoadRequestId;
        const hasPracticePb = Boolean(this.practiceSession?.hasNewPersonalBest);
        this.lastSharePayload = practiceSharePayload;
        this.ui.showModal('Paused', null, {
            variant: 'practice-pause',
            listData: practiceSummary,
            bestTime: bestSessionLapTime,
            sessionBestTime: bestSessionLapTime,
            practiceBestTime: bestOverallPracticeTime,
            deltaToBest,
            isNewBest: hasPracticePb,
            scoreboardTrackKey: trackKey,
            scoreboardSnapshot: hasPracticePb && this.currentIsRanked ? { isLoading: true } : null,
            scoreboardMode: TRACK_MODE_PRACTICE
        }, Boolean(practiceSharePayload), {
            modalKind: 'practice-pause',
            forceSharePanelVisible: true,
            primaryActionLabel: 'Resume',
            primaryShortcutLabel: null,
            primaryActionIcon: 'play',
            primaryAction: () => this.resumePracticeSession(),
            secondaryActionLabel: 'Done',
            secondaryActionIcon: 'done',
            secondaryAction: () => this.stopPracticeSession(),
            shareActionLabel: 'Challenge',
            shareActionIcon: 'save'
        });
        if (practiceSharePayload) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.shareService.prepare(practiceSharePayload).catch((error) => {
                        console.error('Error preparing practice share asset:', error);
                    });
                });
            });
        }

        if (!hasPracticePb || !this.currentIsRanked) return;

        Promise.resolve(this.pendingPracticeBestSavePromise || null)
            .then(() => getScoreboardSnapshot({
                trackKey,
                mode: TRACK_MODE_PRACTICE,
                limit: 10
            }))
            .then((scoreboardSnapshot) => {
                if (requestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) return;
                this.ui.updateModalScoreboardSnapshot(scoreboardSnapshot);
            })
            .catch((error) => {
                console.error('Error loading session PB leaderboard rank:', error);
                if (requestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) return;
                this.ui.updateModalScoreboardSnapshot(null);
            });
    }

    resumePracticeSession() {
        if (this.status !== 'paused') return;

        this.status = 'playing';
        this.armRelaunchDelay(CONFIG.resumeRelaunchDelay);
        this.accumulator = 0;
        this.lastTime = this.getNow();
        this.ui.closeModal();
        this.requestRender();
    }

    update(dt) {
        if (this.status === 'playing') {
            this.recordScoreboardReplayFrame();
        }

        // Mutate-in-place: simulation writes directly to `this.*` fields.
        // Only event flags are returned (via a reused object).
        const events = updateSimulation(
            this, dt, CONFIG, this.currentTrack, this.collisionSegments, getIntersection
        );

        if (events.practiceCrashReset) {
            this.sessionRaceStats[this.getCurrentScoreModeAnalyticsKey()].crash++;
            this.restartPracticeLapAfterCrash();
        } else if (events.crashEndedRun) {
            if (this.isPracticeMode()) {
                this.sessionRaceStats[this.getCurrentScoreModeAnalyticsKey()].crash++;
            } else {
                this.trialRaceStats[this.getCurrentScoreModeAnalyticsKey()].crash++;
            }
            this.ui.setPracticePauseVisible(false);
            if (this.isPracticeMode()) {
                this.endPracticeSession();
                return;
            }
            this.ui.setHudPersonalBestsOpenAllowed(true);
            this.ui.showModal('CRASHED', null, { isCrash: true, impact: events.crashImpact }, false, {
                modalKind: 'crash',
                primaryActionLabel: 'Retry',
                primaryShortcutLabel: null,
                primaryActionIcon: 'retry',
                secondaryActionLabel: 'Done',
                secondaryAction: () => this.reset(false),
                secondaryActionIcon: 'done'
            });
        }
        if (events.lapCompleted) {
            this.handlePracticeLapCompleted(events.completedLapTime);
        }
        if (events.winTriggered) {
            this.handleWin(events.winData);
        }
    }

    handlePracticeLapCompleted(lapTime) {
        if (!this.isPracticeMode() || !this.practiceSession || lapTime === null || lapTime === undefined) return;

        const lapNumber = this.practiceSession.lapCount + 1;
        this.recordRunPoint(this.pos);
        const runHistorySnapshot = this.runHistory.toArray();
        const bestLapBeforeCurrent = this.bestTimesByMode[TRACK_MODE_PRACTICE];
        const lapRecord = {
            lapNumber,
            time: lapTime,
            deltaVsBest: bestLapBeforeCurrent === null || bestLapBeforeCurrent === undefined
                ? null
                : lapTime - bestLapBeforeCurrent
        };

        this.practiceSession.lapCount = lapNumber;
        this.practiceSession.recentLaps.push(lapRecord);
        if (this.practiceSession.recentLaps.length > 10) {
            this.practiceSession.recentLaps = this.practiceSession.recentLaps.slice(-10);
        }

        const currentPersistedPracticeBest = this.bestTimesByMode[TRACK_MODE_PRACTICE];
        const isPersistedBest = currentPersistedPracticeBest === null
            || currentPersistedPracticeBest === undefined
            || lapTime < currentPersistedPracticeBest;
        if (isPersistedBest) {
            this.bestTimesByMode[TRACK_MODE_PRACTICE] = lapTime;
            this.bestLapTime = this.currentModeKey === TRACK_MODE_PRACTICE ? lapTime : this.bestLapTime;
            this.practiceSession.hasNewPersonalBest = true;
            this.persistPracticeBestTime(lapTime);
        }

        if (!this.practiceSession.bestLap || lapTime < this.practiceSession.bestLap.time) {
            this.practiceSession.bestLap = {
                lapNumber,
                time: lapTime
            };
            this.practiceSession.bestLapRunHistory = runHistorySnapshot;
            this.lastSharePayload = this.getPracticeSharePayload();
            this.shareService.reset({ visible: false });
        }
        const isBestLap = this.practiceSession.bestLap.lapNumber === lapNumber;

        this.routeTrace.clear();
        this.runHistory.clear();
        this.runHistoryTimer = 0;
        this.trailTimer = 0;
        this.recordRunPoint(this.pos);
        this.ui.setBestTime(this.bestLapTime, {
            trackKey: this.currentTrackKey,
            mode: TRACK_MODE_PRACTICE,
            ranked: this.currentIsRanked
        });
        this.ui.setHudPersonalBestsOpenAllowed(true);
        this.ui.showPracticeLapFlash({
            lapNumber,
            lapTime,
            deltaVsBest: lapRecord.deltaVsBest,
            isBest: isBestLap,
            isNewBest: isPersistedBest
        });
        this.ui.syncHud({ time: this.currentTime, speed: this.cachedSpeed, force: true });
        this.requestRender();
    }

    restartPracticeLapAfterCrash() {
        if (!this.isPracticeMode()) return;

        this.pos = { ...this.currentTrack.startPos };
        this.prevPos = { ...this.currentTrack.startPos };
        this.velocity = { x: 0, y: 0 };
        this.angle = this.currentTrack.startAngle;
        this.prevAngle = this.currentTrack.startAngle;
        this.cachedSpeed = 0;
        this.currentTime = 0;
        this.armRelaunchDelay(CONFIG.crashRelaunchDelay);
        this.nextCheckpointIndex = 0;
        this.skidMarks.clear();
        this.routeTrace.clear();
        this.runHistory.clear();
        this.runHistoryTimer = 0;
        this.trailTimer = 0;
        this.recordRunPoint(this.pos);
        this.ui.syncHud({ time: 0, speed: 0, force: true });
        this.requestRender();
    }

    stopPracticeSession() {
        if (!this.isPracticeMode() || (this.status !== 'playing' && this.status !== 'starting' && this.status !== 'paused')) return;

        this.endPracticeSession();
    }

    endPracticeSession() {
        if (!this.isPracticeMode()) return;

        this.ui.closeModal();
        this.reset(false);
    }

    getPracticeSharePayload() {
        const bestSessionLap = this.practiceSession?.bestLap;
        const bestSessionRunHistory = this.practiceSession?.bestLapRunHistory;
        if (!bestSessionLap || !bestSessionRunHistory?.length) return null;

        return {
            title: 'Session',
            shareRunKind: 'session',
            trackName: this.currentTrack.name,
            trackKey: this.currentTrackKey,
            lapTime: bestSessionLap.time,
            bestTime: bestSessionLap.time,
            isNewBest: false,
            runHistory: bestSessionRunHistory.slice(),
            trackGeometry: {
                outer: this.activeGeometry.outer.map(({ x, y }) => ({ x, y })),
                inner: this.activeGeometry.inner.map(({ x, y }) => ({ x, y }))
            },
            startLine: {
                p1: { ...this.currentTrack.startLine.p1 },
                p2: { ...this.currentTrack.startLine.p2 }
            },
            startPos: { ...this.currentTrack.startPos },
            startAngle: this.currentTrack.startAngle
        };
    }

    isValidatedWinData(winData) {
        if (!winData || typeof winData !== 'object') return false;
        if (this.status !== 'won') return false;
        if (winData.trackKey !== this.currentTrackKey) return false;
        if (winData.runId !== this.activeRunId) return false;

        const checkpointCount = this.currentTrack.checkpoints?.length || 0;
        if (winData.checkpointCount !== checkpointCount) return false;
        if (winData.completedCheckpointCount < checkpointCount) return false;
        if (!Number.isFinite(winData.lapTime) || winData.lapTime < 2.0) return false;

        return true;
    }

    async handleWin(winData) {
        if (!this.isValidatedWinData(winData)) {
            return;
        }

        this.status = 'won';
        this.trialRaceStats[this.getCurrentScoreModeAnalyticsKey()].win++;
        const finalTime = winData.lapTime;
        const trackKey = winData.trackKey;
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
        const runHistorySnapshot = this.runHistory.toArray();

        // Save lap time
        let trackData;
        const previousBest = this.bestTimesByMode[TRACK_MODE_STANDARD];
        try {
            trackData = await saveLapTime(
                trackKey,
                finalTime,
                {
                    ranked: this.currentIsRanked,
                    replay: this.currentIsRanked ? this.getScoreboardReplayPayload(1) : null
                }
            );
        } catch (error) {
            console.error('Error saving lap time:', error);
            // Fallback display
            trackData = {
                lapTimes: [finalTime],
                bestTime: this.localBestTimesByMode[TRACK_MODE_STANDARD] ?? finalTime,
                bestTimes: {
                    ...this.localBestTimesByMode,
                    [TRACK_MODE_STANDARD]: this.localBestTimesByMode[TRACK_MODE_STANDARD] ?? finalTime
                },
                rankedLapTimes: [finalTime],
                rankedBestTime: this.rankedBestTimesByMode[TRACK_MODE_STANDARD] ?? finalTime,
                rankedBestTimes: {
                    ...this.rankedBestTimesByMode,
                    [TRACK_MODE_STANDARD]: this.rankedBestTimesByMode[TRACK_MODE_STANDARD] ?? finalTime
                }
            };
            if (finalTime < (previousBest ?? Infinity)) {
                if (this.currentIsRanked) {
                    trackData.rankedBestTime = finalTime;
                    trackData.rankedBestTimes[TRACK_MODE_STANDARD] = finalTime;
                } else {
                    trackData.bestTime = finalTime;
                    trackData.bestTimes[TRACK_MODE_STANDARD] = finalTime;
                }
            }
        }

        if (trackLoadRequestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) {
            return;
        }

        // Update best lap time in memory/UI only if the player is still on the same track.
        this.setStoredBestTimes(trackData);
        this.hasAnyData = true;
        this.isReturningPlayer = this.playerStatus.isReturningPlayer(true);
        this.ui.setBestTime(this.bestLapTime, {
            trackKey,
            mode: TRACK_MODE_STANDARD,
            ranked: this.currentIsRanked,
            scoreboardSubmitPromise: trackData.scoreboardSubmitPromise || null
        });
        this.ui.setHudPersonalBestsOpenAllowed(true);

        const activeLapTimes = this.currentIsRanked
            ? trackData.rankedLapTimes
            : trackData.lapTimes;
        const activeBestTime = this.currentIsRanked
            ? trackData.rankedBestTime
            : trackData.bestTime;

        // Check if this is a new best
        const isNewBest = activeBestTime === finalTime && (previousBest === null || previousBest === undefined || finalTime < previousBest);
        const title = isNewBest ? 'New PB!' : trackSnapshot.name;

        this.lastSharePayload = {
            title,
            shareRunKind: 'trial',
            trackName: trackSnapshot.name,
            trackKey,
            lapTime: finalTime,
            bestTime: activeBestTime ?? finalTime,
            isNewBest,
            runHistory: runHistorySnapshot,
            trackGeometry: geometrySnapshot,
            startLine: startLineSnapshot,
            startPos: startPosSnapshot
        };
        this.ui.showModal(title, null, {
            lapTime: finalTime,
            bestTime: activeBestTime ?? finalTime,
            lapTimesArray: activeLapTimes || [],
            isNewBest,
            scoreboardTrackKey: trackKey,
            scoreboardSnapshot: isNewBest && this.currentIsRanked ? { isLoading: true } : null,
            scoreboardMode: TRACK_MODE_STANDARD
        }, Boolean(this.lastSharePayload), {
            modalKind: 'standard-win',
            primaryActionLabel: 'Retry',
            primaryShortcutLabel: null,
            primaryActionIcon: 'retry',
            secondaryActionLabel: 'Done',
            secondaryActionIcon: 'done',
            secondaryAction: () => this.reset(false),
            shareActionLabel: 'Challenge',
            shareActionIcon: 'save'
        });
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

        if (!isNewBest || !this.currentIsRanked) return;

        Promise.resolve(trackData.scoreboardSubmitPromise || null)
            .then(() => getScoreboardSnapshot({
                trackKey,
                mode: TRACK_MODE_STANDARD,
                limit: 10
            }))
            .then((scoreboardSnapshot) => {
                if (trackLoadRequestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) return;
                this.ui.updateModalScoreboardSnapshot(scoreboardSnapshot);
            })
            .catch((error) => {
                console.error('Error loading new PB leaderboard rank:', error);
                if (trackLoadRequestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) return;
                this.ui.updateModalScoreboardSnapshot(null);
            });
    }

    async showPersonalBests() {
        if (
            this.status === 'playing'
            || this.status === 'starting'
            || this.status === 'paused'
            || this.ui.isStandaloneRunsViewActive()
        ) return;

        if (this.isPracticeMode()) {
            const practiceSummary = this.getPracticeSummary();
            if (!practiceSummary.bestLap) return;
            const trackKey = this.currentTrackKey;
            const requestId = this.trackLoadRequestId;
            const returnMode = this.ui.isModalActive() ? 'back' : 'close';
            const scoreboardSnapshot = this.currentIsRanked
                ? await getScoreboardSnapshot({
                    trackKey,
                    mode: TRACK_MODE_PRACTICE,
                    limit: 10
                }).catch((error) => {
                    console.error('Error loading session leaderboard:', error);
                    return null;
                })
                : null;
            if (requestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) return;
            this.ui.showRunsModal(practiceSummary, practiceSummary.bestLap.time, null, returnMode, {
                scoreboardSnapshot,
                scoreboardMode: TRACK_MODE_PRACTICE,
                scoreboardTrackKey: trackKey
            });
            return;
        }

        if (this.bestLapTime === null || this.bestLapTime === undefined) return;

        const trackKey = this.currentTrackKey;
        const requestId = this.trackLoadRequestId;
        try {
            const [trackData, scoreboardSnapshot] = await Promise.all([
                getTrackData(trackKey),
                this.currentIsRanked
                    ? getScoreboardSnapshot({
                        trackKey,
                        mode: TRACK_MODE_STANDARD,
                        limit: 10
                    }).catch((error) => {
                        console.error('Error loading time trial leaderboard:', error);
                        return null;
                    })
                    : Promise.resolve(null)
            ]);
            if (requestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) return;
            const lapTimes = this.currentIsRanked ? trackData.rankedLapTimes : trackData.lapTimes;
            const bestTime = this.currentIsRanked ? trackData.rankedBestTime : trackData.bestTime;
            if (!lapTimes?.length || bestTime === null || bestTime === undefined) return;
            const returnMode = this.ui.isModalActive() ? 'back' : 'close';
            this.ui.showRunsModal(lapTimes, bestTime, null, returnMode, {
                scoreboardSnapshot,
                scoreboardMode: TRACK_MODE_STANDARD,
                scoreboardTrackKey: trackKey
            });
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
        this.relaunchDelayRemaining = 0;
        this.status = 'ready'; // Reset to ready state
        this.activeRunId += 1;
        this.nextCheckpointIndex = 0;
        this.accumulator = 0;
        this.currentTime = 0;
        this.skidMarks.clear();
        this.routeTrace.clear();
        this.runHistory.clear();
        this.runHistoryTimer = 0;
        this.particles = [];
        this.lastSharePayload = null;
        this.practiceSession = null;
        this.ui.closeModal();
        this.shareService.reset({ visible: false, preservePreview: wasModalActive, preserveVisibility: wasModalActive });
        this.ui.setHudPersonalBestsOpenAllowed(!autoStart);
        this.ui.setPracticePauseVisible(false);

        // Reset Visuals
        this.ui.resetCountdown();
        this.ui.resetHud();
        this.ui.setBestTime(this.bestLapTime, {
            persistToTrackCard: false
        });

        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const gs = CONFIG.gridSize;
        this.camera.x = (this.pos.x * gs) - cw / 2 / this.zoom;
        this.camera.y = (this.pos.y * gs) - ch / 2 / this.zoom;
        this._lookAheadX = 0;
        this._lookAheadY = 0;
        this.requestRender();

        if (autoStart) {
            this.ui.hideStartOverlay();
            this.startSequence();
        } else {
            this.ui.showStartOverlay(this.hasAnyData, this.isReturningPlayer);
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
        const rx = Math.round(point.x * 1000) / 1000;
        const ry = Math.round(point.y * 1000) / 1000;
        const last = this.runHistory.last();
        if (last && Math.abs(last.x - rx) < 0.001 && Math.abs(last.y - ry) < 0.001) return;
        const slot = this.runHistory.write();
        slot.x = rx;
        slot.y = ry;
    }

    getDesiredLookAhead(speed, cw, ch, mobileCameraMode) {
        const out = this._desiredLookAhead;
        out.x = 0;
        out.y = 0;

        if (speed > 1) {
            const multiplier = mobileCameraMode ? 12 : 5;
            const maxOffset = mobileCameraMode ? Math.min(cw, ch) / 2.5 : Math.min(cw, ch) / 5;

            out.x = this.velocity.x * multiplier;
            out.y = this.velocity.y * multiplier;

            const magnitude = Math.hypot(out.x, out.y);
            if (magnitude > maxOffset) {
                out.x = (out.x / magnitude) * maxOffset;
                out.y = (out.y / magnitude) * maxOffset;
            }
        }

        return out;
    }

    render(dt, alpha = 1) {
        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const gs = CONFIG.gridSize;

        // Interpolated display position (reuse pre-allocated object)
        const displayPos = this._displayPos;
        if (this.status === 'playing') {
            displayPos.x = this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha;
            displayPos.y = this.prevPos.y + (this.pos.y - this.prevPos.y) * alpha;
        } else {
            displayPos.x = this.pos.x;
            displayPos.y = this.pos.y;
        }
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
        // Mobile uses a softer smoothing constant to absorb frame-rate variance (12x multiplier amplifies jitter).
        const smoothSpeed = mobileCameraMode ? 2 : 4;
        const lerpFactor = 1 - Math.exp(-dt * smoothSpeed);

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

        // 4. Skid Marks — ring buffer with pre-computed cos/sin
        if (this.skidMarks.length > 0) {
            ctx.fillStyle = CONFIG.skidColor;
            const startIdx = this.frameSkip > 0 ? Math.max(0, this.skidMarks.length - 50) : 0;
            const z = this.zoom;
            const cx = this.camera.x;
            const cy = this.camera.y;

            for (let i = startIdx; i < this.skidMarks.length; i++) {
                const m = this.skidMarks.get(i);
                const mx = m.x * gs;
                const my = m.y * gs;
                const a = z * m.cos;
                const b = z * m.sin;
                ctx.setTransform(a, b, -b, a, z * (mx - cx), z * (my - cy));
                ctx.fillRect(-10, -5, 4, 10);
                ctx.fillRect(-10, 5, 4, 10);
            }
            // Restore parent transform (zoom + camera offset)
            ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
        }

        // 4.5 Route Trace (Always Visible) — ring buffer iteration
        if (this.routeTrace.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = "rgba(56, 189, 248, 0.5)"; // Light Blue
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            const firstPt = this.routeTrace.get(0);
            ctx.moveTo(firstPt.x * gs, firstPt.y * gs);
            const traceStep = Math.max(this.frameSkip > 0 ? 2 : 1, Math.ceil(this.routeTrace.length / 240));
            for (let i = traceStep; i < this.routeTrace.length; i += traceStep) {
                const pt = this.routeTrace.get(i);
                ctx.lineTo(pt.x * gs, pt.y * gs);
            }
            const lastTracePoint = this.routeTrace.get(this.routeTrace.length - 1);
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
        this._frameRequestId = null;

        const rawDt = Math.min((now - this.lastTime) / 1000, 0.1);
        const frameTime = now - this.lastTime;
        this.lastTime = now;

        const animateFrame = this.shouldAnimateFrame();
        if (animateFrame) {
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
            this._needsRender = false;

            if (this.status === 'playing') {
                this.ui.syncHud({ time: this.currentTime, speed: this.cachedSpeed });
            }
        } else if (this._needsRender) {
            this.render(0, 1);
            this._needsRender = false;
        }

        if (this._needsRender || this.shouldAnimateFrame()) {
            this.requestFrame();
        }
    }
}
