import { CONFIG } from './config.js?v=1.91';
import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from './modes.js?v=1.91';

function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
}
import { TRACKS } from './tracks.js?v=1.91';
import { getTrackCanvasAsset, getTrackRuntimeAsset } from './core/track-assets.js?v=1.91';
import { drawViewportPresentationBackground } from './core/track-canvas.js?v=1.91';
import {
    createDailyChallengePresentationEvent,
    resolveTrackPresentation,
    TRACK_PRESENTATION_SURFACES
} from './track-presentation.js?v=1.91';
import { configureCanvasViewport } from './core/canvas-resolution.js?v=1.91';
import { updateSimulation } from './core/simulation.js?v=1.91';
import { RingBuffer } from './core/ring-buffer.js?v=1.91';
import { getTrackData, hasAnyTrackData, saveLapTime, saveBestTime, syncBestTime } from './storage.js?v=1.91';
import { getDailyChallengeData, setDailyChallengeBestTime } from './daily-challenge-storage.js?v=1.91';
import {
    buildLapRecord,
    createModalActions,
    isNewBestResult,
    pushRecentLap
} from './result-flow.js?v=1.91';
import { createRunPolicy } from './run-policy.js?v=1.91';
import { getPhysicsPresetForConfig } from './physics-presets.js';
import { AnalyticsService } from './services/analytics.js?v=1.91';
import { PlayerStatusStore } from './services/player-status.js?v=1.91';
import { SessionFlagStore } from './services/session-flags.js?v=1.91';
import { ShareService } from './services/share.js?v=1.91';
import {
    formatDailyChallengeResultLabel,
    getActiveDailyChallenge,
    getDailyChallengeCopyLabels,
    getDailyChallengeMaxCrashes,
    getDailyChallengeModifierBadges,
    getDailyChallengeModifierLabel,
    getDailyChallengeObjectiveLabel,
    getDailyChallengeRequiredLaps,
    getDailyChallengeSnapshot,
    getDailyChallengeTrackName,
    isCrashBudgetDailyChallenge,
    submitDailyChallengeBestTime
} from './services/daily-challenge.js?v=1.91';
import { submitScoreboardBestTime } from './services/scoreboard.js?v=1.91';
import {
    clearDailyChallengeVerification,
    clearScoreboardVerification,
    enqueueDailyChallengeVerification,
    enqueueScoreboardVerification,
    getDueDailyChallengeVerifications,
    getDueScoreboardVerifications,
    getDailyChallengeVerificationEntry,
    getNextVerificationAttemptAt,
    getScoreboardVerificationEntry,
    getVerificationRetryDelayMs,
    markDailyChallengeVerificationPending,
    markDailyChallengeVerificationRejected,
    markScoreboardVerificationPending,
    markScoreboardVerificationRejected
} from './services/verification-queue.js';
import { GameUi } from './ui.js?v=1.91';

const SCOREBOARD_REPLAY_MAX_FRAMES = 20000;

/** Camera look-ahead uses clamped dt so uneven frame times don't swing smoothing strength. */
const CAMERA_DT_MIN_S = 1 / 120;
const CAMERA_DT_MAX_S = 1 / 45;
/** Adaptive quality: hysteresis on rolling avg frame time (ms) to avoid frameSkip flicker. */
const FRAME_SKIP_ENTER_MS = 22;
const FRAME_SKIP_EXIT_MS = 18;
/** Wait briefly before committing canvas backing-store resizes so live window drags keep the old track visible. */
const CANVAS_RESIZE_SETTLE_MS = 120;
/** Skid polyline: break stroke when consecutive samples are farther apart (new skid after a gap). Grid units². */
const SKID_GAP_BREAK_DIST_SQ = 0.45 * 0.45;
const SPACE_WARP_MIN_SPEED = 8.25;
const SPACE_WARP_MAX_SPEED = 11.2;
const SPACE_EXHAUST_MAX_SPEED = 11.5;
const SHIP_ASSET_EFFECT_PATTERN = /(^|\/)vgp_ship(?:_\d+)?\.(?:png|webp)$/i;

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function getSpaceSkinStrength(presentation, speed) {
    if (presentation?.backgroundStyle !== 'space') return 0;
    if (!Number.isFinite(speed) || speed <= SPACE_WARP_MIN_SPEED) return 0;
    return clamp01((speed - SPACE_WARP_MIN_SPEED) / (SPACE_WARP_MAX_SPEED - SPACE_WARP_MIN_SPEED));
}

function resolveCarSpriteEffects(assetName) {
    const hasShipFx = typeof assetName === 'string' && SHIP_ASSET_EFFECT_PATTERN.test(assetName);
    return {
        hasMainExhaust: hasShipFx,
        hasRcsThrusters: hasShipFx
    };
}

export function drawSpaceMainExhaust(ctx, {
    shipEffects = null,
    speed = 0,
    drawWidth = 52,
    drawHeight = 52,
    time = 0,
    steering = 0,
    steeringBurst = 0
} = {}) {
    if (!ctx || !shipEffects?.hasMainExhaust) return false;

    const numericSpeed = Number(speed) || 0;
    const speedStrength = clamp01(numericSpeed / SPACE_EXHAUST_MAX_SPEED);
    if (speedStrength <= 0.02) return false;

    // --- Turbulence: multi-frequency sine noise for organic motion ---
    const t = time;
    const turb1 = Math.sin(t * 14.3) * 0.6 + Math.sin(t * 23.7) * 0.4;          // fast shimmer
    const turb2 = Math.sin(t * 8.1 + 1.3) * 0.5 + Math.cos(t * 17.9) * 0.5;     // mid flicker
    const turb3 = Math.sin(t * 4.7 + 2.6) * 0.7 + Math.sin(t * 11.2 + 0.8) * 0.3; // slow sway
    const pulseBase = 0.92 + turb1 * 0.06 + turb2 * 0.04;

    // --- Speed-reactive plume sizing (full range, not just warp speeds) ---
    const plumeLength = drawWidth * (0.18 + speedStrength * 1.22) * pulseBase;
    const nozzleX = -drawWidth * 0.18;
    const halfWidth = drawHeight * (0.048 + speedStrength * 0.048);
    const tailWidth = halfWidth * (1.35 + turb2 * 0.15);

    // --- Steering bend: plume drifts opposite to turn direction ---
    const steerDir = Math.sign(Number(steering) || 0);
    const burstMag = clamp01(Number(steeringBurst) || 0);
    const steerInfluence = steerDir * (0.3 + burstMag * 0.7);
    // Vertical deflection increases along the plume length
    const bendMid = plumeLength * steerInfluence * 0.12 + turb3 * halfWidth * 0.45;
    const bendTip = plumeLength * steerInfluence * 0.22 + turb3 * halfWidth * 0.7;

    // --- Twist: asymmetric widening on one side during swerves ---
    const twistFactor = steerInfluence * 0.18 + turb1 * 0.08;
    const topWiden = 1 + twistFactor;
    const botWiden = 1 - twistFactor;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // --- Outer glow plume (bezier curves for organic shape) ---
    const outerGradient = ctx.createLinearGradient(nozzleX, 0, nozzleX - plumeLength, 0);
    const outerAlpha0 = 0.14 + speedStrength * 0.14;
    const outerAlphaMid = 0.10 + speedStrength * 0.12;
    outerGradient.addColorStop(0, `rgba(125, 211, 252, ${outerAlpha0})`);
    outerGradient.addColorStop(0.4, `rgba(147, 197, 253, ${outerAlphaMid})`);
    outerGradient.addColorStop(1, 'rgba(147, 197, 253, 0)');
    ctx.fillStyle = outerGradient;
    ctx.beginPath();
    ctx.moveTo(nozzleX, -halfWidth * topWiden);
    ctx.quadraticCurveTo(
        nozzleX - plumeLength * 0.3, -tailWidth * topWiden + bendMid,
        nozzleX - plumeLength, bendTip
    );
    ctx.quadraticCurveTo(
        nozzleX - plumeLength * 0.3, tailWidth * botWiden + bendMid,
        nozzleX, halfWidth * botWiden
    );
    ctx.closePath();
    ctx.fill();

    // --- Inner core plume (brighter, shorter, also curved) ---
    const coreLength = plumeLength * (0.62 + turb2 * 0.08);
    const coreWidth = halfWidth * 0.52;
    const coreBendMid = bendMid * 0.55;
    const coreBendTip = bendTip * 0.5;
    const coreGradient = ctx.createLinearGradient(nozzleX, 0, nozzleX - coreLength, 0);
    coreGradient.addColorStop(0, `rgba(224, 242, 254, ${0.18 + speedStrength * 0.18})`);
    coreGradient.addColorStop(0.5, `rgba(191, 219, 254, ${0.12 + speedStrength * 0.12})`);
    coreGradient.addColorStop(1, 'rgba(224, 242, 254, 0)');
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.moveTo(nozzleX + drawWidth * 0.02, -coreWidth * topWiden);
    ctx.quadraticCurveTo(
        nozzleX - coreLength * 0.28, -coreWidth * 1.18 * topWiden + coreBendMid,
        nozzleX - coreLength, coreBendTip
    );
    ctx.quadraticCurveTo(
        nozzleX - coreLength * 0.28, coreWidth * 1.18 * botWiden + coreBendMid,
        nozzleX + drawWidth * 0.02, coreWidth * botWiden
    );
    ctx.closePath();
    ctx.fill();

    // --- Hot-spot flicker: a small bright dot near the nozzle that shimmers ---
    const flickerAlpha = 0.12 + speedStrength * 0.14 + turb1 * 0.06;
    const flickerRadius = halfWidth * (0.4 + turb2 * 0.15);
    const flickerGrad = ctx.createRadialGradient(
        nozzleX, bendMid * 0.1, 0,
        nozzleX, bendMid * 0.1, flickerRadius
    );
    flickerGrad.addColorStop(0, `rgba(240, 249, 255, ${flickerAlpha})`);
    flickerGrad.addColorStop(1, 'rgba(186, 230, 253, 0)');
    ctx.fillStyle = flickerGrad;
    ctx.beginPath();
    ctx.arc(nozzleX, bendMid * 0.1, flickerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return true;
}

export function drawSpaceRcsThrusters(ctx, {
    shipEffects = null,
    steeringCommand = 0,
    steeringBurst = 0,
    drawWidth = 52,
    drawHeight = 52,
    time = 0
} = {}) {
    if (!ctx || !shipEffects?.hasRcsThrusters) return false;
    const direction = Math.sign(Number(steeringCommand) || 0);
    const burst = clamp01(Number(steeringBurst) || 0);
    if (!direction || burst <= 0.03) return false;

    const pulse = 0.95 + Math.sin(time * 30) * 0.05;
    const length = drawWidth * (0.1 + burst * 0.28) * pulse;
    const sideY = direction > 0 ? -drawHeight * 0.1 : drawHeight * 0.1;
    const nozzleX = drawWidth * 0.2;
    const nozzleHalfWidth = drawWidth * 0.035;
    const tipY = direction > 0 ? sideY - length : sideY + length;
    const sideTipOffset = drawWidth * (0.038 + burst * 0.028);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const outerGradient = ctx.createLinearGradient(nozzleX, sideY, nozzleX, tipY);
    outerGradient.addColorStop(0, `rgba(125, 211, 252, ${0.16 + burst * 0.18})`);
    outerGradient.addColorStop(0.45, `rgba(191, 219, 254, ${0.14 + burst * 0.12})`);
    outerGradient.addColorStop(1, 'rgba(125, 211, 252, 0)');
    ctx.fillStyle = outerGradient;
    ctx.beginPath();
    ctx.moveTo(nozzleX - nozzleHalfWidth, sideY);
    ctx.lineTo(nozzleX - sideTipOffset, tipY);
    ctx.lineTo(nozzleX + sideTipOffset, tipY);
    ctx.lineTo(nozzleX + nozzleHalfWidth, sideY);
    ctx.closePath();
    ctx.fill();

    const coreGradient = ctx.createLinearGradient(nozzleX, sideY, nozzleX, tipY);
    coreGradient.addColorStop(0, `rgba(224, 242, 254, ${0.22 + burst * 0.18})`);
    coreGradient.addColorStop(1, 'rgba(224, 242, 254, 0)');
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.moveTo(nozzleX - nozzleHalfWidth * 0.48, sideY);
    ctx.lineTo(nozzleX - sideTipOffset * 0.42, sideY + (tipY - sideY) * 0.82);
    ctx.lineTo(nozzleX + sideTipOffset * 0.42, sideY + (tipY - sideY) * 0.82);
    ctx.lineTo(nozzleX + nozzleHalfWidth * 0.48, sideY);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    return true;
}

function updateSpaceRcsState(engine, dt) {
    const currentSteeringCommand = (engine.keys.right ? 1 : 0) - (engine.keys.left ? 1 : 0);
    const previousSteeringCommand = Number.isFinite(engine._prevSteeringCommand) ? engine._prevSteeringCommand : 0;
    const steeringDelta = Math.abs(currentSteeringCommand - previousSteeringCommand);
    const safeDt = Math.max(0, Number(dt) || 0);
    const previousHoldTime = Number(engine._spaceRcsHoldTime) || 0;
    const holdTime = currentSteeringCommand !== 0
        ? previousHoldTime + safeDt
        : Math.max(0, previousHoldTime - safeDt * 4);
    const holdStrength = clamp01(holdTime / 0.18);
    const decay = Math.exp(-safeDt * 8);
    let burst = (Number(engine._spaceRcsBurst) || 0) * decay;

    if (currentSteeringCommand !== 0) {
        const snapStrength = currentSteeringCommand !== previousSteeringCommand
            ? Math.min(1, 0.42 + steeringDelta * 0.28)
            : 0;
        burst = Math.max(burst, holdStrength, snapStrength);
    } else {
        burst *= 0.25;
    }

    engine._spaceRcsHoldTime = holdTime;
    engine._prevSteeringCommand = currentSteeringCommand;
    engine._spaceRcsBurst = clamp01(burst);
    return {
        steeringCommand: currentSteeringCommand,
        steeringBurst: engine._spaceRcsBurst
    };
}

export function drawSpaceWarpEffect(ctx, {
    shipEffects = null,
    speed = 0,
    drawWidth = 52,
    drawHeight = 52,
    steering = 0,
    steeringBurst = 0,
    time = 0
} = {}) {
    if (!ctx) return false;
    // Main exhaust renders at any speed (its own threshold is speedStrength > 0.02)
    const drewMainExhaust = drawSpaceMainExhaust(ctx, {
        shipEffects,
        speed,
        drawWidth,
        drawHeight,
        time,
        steering,
        steeringBurst
    });
    const drewRcs = drawSpaceRcsThrusters(ctx, {
        shipEffects,
        steeringCommand: steering,
        steeringBurst,
        drawWidth,
        drawHeight,
        time
    });
    return drewMainExhaust || drewRcs;
}

function createVerificationSnapshot({
    statusText = '',
    verificationState = 'pending',
    isLoading = true
} = {}) {
    return {
        isLoading,
        verificationState,
        statusText
    };
}

const VERIFICATION_REJECTED_SNAPSHOT = createVerificationSnapshot({
    statusText: 'Rejected',
    verificationState: 'rejected',
    isLoading: false
});

const VERIFICATION_ACCEPTED_PENDING_SNAPSHOT = createVerificationSnapshot({
    statusText: 'Pending verification',
    verificationState: 'pending',
    isLoading: false
});

function getVerificationSnapshotFromQueueEntry(entry) {
    if (!entry) return null;
    if (entry.verificationState === 'rejected') {
        return VERIFICATION_REJECTED_SNAPSHOT;
    }
    return VERIFICATION_ACCEPTED_PENDING_SNAPSHOT;
}

function isLocalEnvironment() {
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

function shouldExposeDebugHooks() {
    return isLocalEnvironment();
}

function shouldAutoRetryVerificationQueue() {
    return !isLocalEnvironment();
}

function readCanvasDevicePixelRatio() {
    if (typeof window === 'undefined') return 1;
    return window.devicePixelRatio || 1;
}

// --- Game Engine ---
export class RealTimeRacer {
    constructor() {
        this.trackLayerCanvas = document.getElementById('trackLayerCanvas');
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: true }) || this.canvas.getContext('2d');
        this.container = document.getElementById('game-container');
        this.isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
        this.trackLayerWorker = null;
        this.trackLayerWorkerReady = false;
        this.trackLayerBitmapVersion = 0;
        this.trackLayerBitmapPromise = null;
        this.trackLayerCtx = null;
        this.viewportWidth = 0;
        this.viewportHeight = 0;
        this.viewportDevicePixelRatio = 1;
        this.setupTrackLayerRenderer();

        // Settings Controls (trace route is always enabled)

        // Generate Internal Car Sprite
        this.carSprite = this.createCarSprite();
        this.carSpriteDrawWidth = 64;
        this.carSpriteDrawHeight = 32;
        this.carSpriteAssetKey = null;
        this.carSpriteLoadToken = 0;
        this.carSpriteAssetCache = new Map();
        this.syncCarSpriteAsset();

        // Physics State
        this.currentTrack = TRACKS.circuit;
        this.currentTrackKey = 'circuit';
        this.currentTrackPresentation = resolveTrackPresentation('circuit', {
            surface: TRACK_PRESENTATION_SURFACES.RACE
        });
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
        this.currentRunPolicy = createRunPolicy({ modeKey: this.currentModeKey });
        this.practiceSession = null;
        this.runtimeConfig = { ...CONFIG };
        this.activeDailyChallenge = null;
        this.currentChallengeRun = null;
        this.dailyChallengeBestResult = null;
        this.verificationQueueTimer = null;
        this.isProcessingVerificationQueue = false;
        this.hasAnyData = false; // Whether any track has ever been raced
        this.isReturningPlayer = false;
        this.activeTimers = []; // Keep track of active timeouts/intervals
        this.resizeCommitTimer = null;

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
        this._prevSteeringCommand = 0;
        this._spaceRcsHoldTime = 0;
        this._spaceRcsBurst = 0;

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
        this.frictionFactor = Math.pow(this.runtimeConfig.friction, this.FIXED_DT * 60);

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
        this.practiceLapReplaySegments = [];
        this.practiceLapReplayFrameCount = 0;
        this.practiceLapReplayOverflowed = false;
        this.practiceLapReplayStartState = {
            pos: { ...this.pos },
            velocity: { ...this.velocity },
            angle: this.angle,
            nextCheckpointIndex: this.nextCheckpointIndex,
            currentTime: this.currentTime,
            relaunchDelayRemaining: this.relaunchDelayRemaining
        };

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
            onStartDailyChallenge: () => this.handleStartDailyChallenge(),
            onModeSelected: (mode) => this.trackModeSelection(mode),
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
        this.dailyChallengePromise = this.loadDailyChallenge();
        Promise.allSettled([this.playerHistoryPromise, this.dailyChallengePromise]).finally(() => {
            this.ui.refreshAllReturningTrackPersonalBests();
            this.ui.refreshDailyChallengeVerificationState();
            this.scheduleVerificationQueueProcessing(0);
        });

        // Listeners
        new ResizeObserver(() => this.scheduleResizeCommit()).observe(this.container);
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
        window.addEventListener('online', () => {
            this.scheduleVerificationQueueProcessing(0);
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

    setupTrackLayerRenderer() {
        const canUseOffscreenWorker = Boolean(
            !this.isCoarsePointer
            && this.trackLayerCanvas
            && typeof Worker !== 'undefined'
            && typeof this.trackLayerCanvas.transferControlToOffscreen === 'function'
            && typeof createImageBitmap === 'function'
        );

        if (!canUseOffscreenWorker) {
            this.trackLayerCtx = this.trackLayerCanvas?.getContext('2d', { alpha: false, desynchronized: true })
                || this.trackLayerCanvas?.getContext('2d')
                || null;
            return;
        }

        try {
            const offscreenCanvas = this.trackLayerCanvas.transferControlToOffscreen();
            this.trackLayerWorker = new Worker(new URL('./workers/track-layer-worker.js', import.meta.url), {
                type: 'module'
            });
            this.trackLayerWorker.postMessage({
                type: 'init',
                canvas: offscreenCanvas
            }, [offscreenCanvas]);
            this.trackLayerWorkerReady = true;
        } catch (error) {
            console.error('Error initializing track-layer worker:', error);
            this.trackLayerWorker = null;
            this.trackLayerWorkerReady = false;
            this.trackLayerCtx = this.trackLayerCanvas?.getContext('2d', { alpha: false, desynchronized: true })
                || this.trackLayerCanvas?.getContext('2d')
                || null;
        }
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

    getModeAnalyticsPayload(mode, {
        trackKey = this.currentTrackKey,
        ranked = null
    } = {}) {
        const normalizedMode = mode === 'daily'
            ? 'daily'
            : (mode === TRACK_MODE_PRACTICE ? TRACK_MODE_PRACTICE : TRACK_MODE_STANDARD);

        const payload = {
            mode: normalizedMode,
            trackKey: trackKey || null
        };

        if (normalizedMode !== 'daily') {
            const resolvedRanked = ranked === null ? this.currentIsRanked : Boolean(ranked);
            payload.scoreMode = resolvedRanked ? 'ranked' : 'local';
        }

        return payload;
    }

    trackModeSelection(mode) {
        this.analytics.trackModeSelected(this.getModeAnalyticsPayload(mode));
        if (mode === 'daily') {
            this.prefetchCarSpriteAsset(this.getDailyChallengeCarAssetName());
        }
    }

    trackModeStart(mode, options = {}) {
        this.analytics.trackModeStarted(this.getModeAnalyticsPayload(mode, options));
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

    getCanvasDevicePixelRatio() {
        return readCanvasDevicePixelRatio();
    }

    setRuntimeConfig(overrides = null) {
        this.runtimeConfig = {
            ...CONFIG,
            ...(overrides && typeof overrides === 'object' ? overrides : {})
        };
        this.frictionFactor = Math.pow(this.runtimeConfig.friction, this.FIXED_DT * 60);
        this.syncCarSpriteAsset();
    }

    syncCurrentRunPolicy() {
        this.currentRunPolicy = createRunPolicy({
            modeKey: this.currentModeKey,
            practiceEndOnCrash: this.practiceEndOnCrash,
            challengeRun: this.currentChallengeRun
        });
    }

    isDailyChallengeRun() {
        return Boolean(this.currentRunPolicy?.isDaily);
    }

    getTrackPresentation(trackKey = this.currentTrackKey, {
        surface = TRACK_PRESENTATION_SURFACES.RACE
    } = {}) {
        return resolveTrackPresentation(trackKey, {
            surface,
            event: createDailyChallengePresentationEvent(this.activeDailyChallenge)
        });
    }

    async refreshTrackPresentation(trackLoadRequestId = this.trackLoadRequestId) {
        if (!this.currentTrackKey || !this.currentTrack) return;

        const presentation = this.getTrackPresentation(this.currentTrackKey, {
            surface: TRACK_PRESENTATION_SURFACES.RACE
        });
        this.currentTrackPresentation = presentation;
        const trackCanvasRuntime = getTrackCanvasAsset(this.currentTrackKey, this.currentTrack, {
            qualityLevel: this.qualityLevel,
            frameSkip: this.frameSkip,
            presentation
        });
        this.trackCanvas = trackCanvasRuntime.canvas;
        this.trackCanvasOrigin = trackCanvasRuntime.origin;
        await this.syncTrackLayerBitmap(trackLoadRequestId);
        this.requestRender();
    }

    getChallengeRunTitle() {
        return this.activeDailyChallenge ? getDailyChallengeTrackName(this.activeDailyChallenge) : 'Daily';
    }

    isCrashBudgetDailyChallenge(challenge = this.activeDailyChallenge) {
        return isCrashBudgetDailyChallenge(challenge);
    }

    syncChallengeHudPrimaryStats() {
        const copyLabels = getDailyChallengeCopyLabels(this.activeDailyChallenge);
        if (this.isCrashBudgetDailyChallenge()) {
            const currentLaps = Math.max(0, Math.trunc(this.currentChallengeRun?.completedLaps || 0));
            const bestLaps = Math.max(0, Math.trunc(this.dailyChallengeBestResult?.completedLaps || 0));
            this.ui.setHudPrimaryMetric({
                label: copyLabels.hudPrimaryLabel,
                value: `${currentLaps}`,
                useTimer: false,
                visible: true
            });
            this.ui.setHudBestMetric({
                label: 'BEST LAPS',
                value: `${bestLaps}`,
                visible: true
            });
            return;
        }

        this.ui.setHudPrimaryMetric({
            label: copyLabels.hudPrimaryLabel,
            useTimer: true,
            visible: true
        });
        this.ui.setBestTime(this.bestLapTime, { persistToTrackCard: false });
    }

    getDailyChallengeProgressText() {
        if (!this.currentChallengeRun) return '';

        const requiredLaps = this.currentChallengeRun.requiredLaps || 1;
        if (this.currentChallengeRun.objectiveType === 'finish_with_crash_budget') {
            const crashesLeft = Math.max(0, this.currentChallengeRun.maxCrashes - this.currentChallengeRun.crashCount);
            return `Crashes left ${crashesLeft}`;
        }
        if (requiredLaps > 1) {
            return `Lap ${Math.min(this.currentChallengeRun.completedLaps + 1, requiredLaps)} / ${requiredLaps}`;
        }
        return 'Fastest lap wins';
    }

    updateDailyChallengeHud() {
        if (!this.currentChallengeRun || this.status === 'ready') {
            this.ui.setDailyChallengeHud(null);
            return;
        }

        this.syncChallengeHudPrimaryStats();

        this.ui.setDailyChallengeHud({
            visible: true,
            progressText: this.getDailyChallengeProgressText()
        });
    }

    async loadDailyChallenge() {
        try {
            const challenge = await getActiveDailyChallenge();
            this.activeDailyChallenge = challenge || null;
            await this.refreshDailyChallengeSummary();
            await this.refreshTrackPresentation();
            return challenge;
        } catch (error) {
            console.error('Error loading daily challenge:', error);
            this.activeDailyChallenge = null;
            this.ui.setDailyChallengeSummary(null);
            await this.refreshTrackPresentation();
            return null;
        }
    }

    async refreshDailyChallengeSummary() {
        const challenge = this.activeDailyChallenge;
        if (!challenge) {
            this.ui.setDailyChallengeSummary(null);
            return null;
        }

        const localData = getDailyChallengeData(challenge.id);
        this.dailyChallengeBestResult = localData ? { ...localData } : null;
        this.bestLapTime = Number.isFinite(localData?.bestTime) ? localData.bestTime : null;
        let snapshot = null;
        try {
            snapshot = await getDailyChallengeSnapshot({ challengeId: challenge.id });
        } catch (error) {
            console.error('Error loading daily challenge snapshot:', error);
        }

        const bestTime = Number.isFinite(localData?.bestTime) ? localData.bestTime : null;
        const rankLabel = snapshot?.playerRankLabel || '--';
        const crashBudget = Math.max(0, Math.trunc(challenge.objectiveParams?.maxCrashes || 0));
        const objectiveLabel = challenge.objectiveType === 'finish_with_crash_budget'
            ? `${crashBudget} crash${crashBudget === 1 ? '' : 'es'}`
            : getDailyChallengeObjectiveLabel(challenge);
        this.ui.setDailyChallengeSummary({
            available: true,
            challengeId: challenge.id,
            title: getDailyChallengeTrackName(challenge),
            trackKey: challenge.trackKey,
            skin: challenge.skin,
            trackName: getDailyChallengeTrackName(challenge),
            objectiveLabel,
            modifierBadges: getDailyChallengeModifierBadges(challenge),
            modifierLabel: getDailyChallengeModifierLabel(challenge),
            bestTime,
            bestLabel: formatDailyChallengeResultLabel(challenge, localData),
            rankLabel,
            scoreboardSnapshot: snapshot,
            objectiveType: challenge.objectiveType,
            endsAt: challenge.endsAt
        });
        return snapshot;
    }

    createDailyChallengeRun(challenge) {
        return {
            challengeId: challenge.id,
            objectiveType: challenge.objectiveType,
            requiredLaps: getDailyChallengeRequiredLaps(challenge),
            maxCrashes: getDailyChallengeMaxCrashes(challenge),
            completedLaps: 0,
            crashCount: 0,
            elapsedTime: 0,
            lastLapAt: 0,
            bestLap: null,
            recentLaps: []
        };
    }

    applyDailyChallenge(challenge) {
        this.currentModeKey = TRACK_MODE_STANDARD;
        this.currentIsRanked = false;
        this.practiceEndOnCrash = false;
        this.practiceSession = null;
        this.currentChallengeRun = this.createDailyChallengeRun(challenge);
        this.syncCurrentRunPolicy();
        this.setRuntimeConfig(challenge.physicsOverrides || null);

        const storedDaily = getDailyChallengeData(challenge.id);
        this.dailyChallengeBestResult = storedDaily ? { ...storedDaily } : null;
        this.bestLapTime = Number.isFinite(storedDaily?.bestTime) ? storedDaily.bestTime : null;
        this.ui.setPracticePauseVisible(false);
        this.ui.setHudPersonalBestsOpenAllowed(false);
        this.syncChallengeHudPrimaryStats();
        this.updateDailyChallengeHud();
    }

    clearDailyChallengeRun() {
        const hadChallengeRun = Boolean(this.currentChallengeRun);
        this.currentChallengeRun = null;
        this.dailyChallengeBestResult = null;
        this.syncCurrentRunPolicy();
        this.setRuntimeConfig(null);
        this.ui.setHudPrimaryMetric({
            label: 'LAP',
            useTimer: true,
            visible: true
        });
        this.ui.setHudBestMetric({ visible: false });
        if (hadChallengeRun) {
            this.refreshActiveBestTimes();
        }
        this.updateDailyChallengeHud();
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
            this.trackModeStart(this.currentModeKey, {
                trackKey: this.currentTrackKey,
                ranked: this.currentIsRanked
            });
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

    async handleStartDailyChallenge() {
        if (this.status !== 'ready' || this.startButtonPending || !this.activeDailyChallenge) return;

        this.resetCanvasPresentation();
        this.startButtonPending = true;
        const playerTypeAlreadySent = this.sessionFlags.get('playerTypeSent');
        try {
            const challenge = this.activeDailyChallenge;
            if (challenge.trackKey && challenge.trackKey !== this.currentTrackKey) {
                await this.loadTrack(challenge.trackKey, { trackPageview: false, countMapSelection: true });
            }

            if (this.currentTrackPageviewPending) {
                this.analytics.trackPageview(`/track/${this.currentTrackKey}`, `${this.currentTrackKey} Daily`);
                this.currentTrackPageviewPending = false;
            }

            if (!this.playerTypeSent && !playerTypeAlreadySent) {
                const { isReturningPlayer } = await this.playerHistoryPromise;
                this.playerTypeSent = true;
                this.sessionFlags.set('playerTypeSent', '1');
                this.analytics.trackPlayerType(isReturningPlayer);
            }

            this.applyDailyChallenge(challenge);
            this.trackModeStart('daily', {
                trackKey: challenge.trackKey
            });
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
        this.clearDailyChallengeRun();
        this.currentModeKey = trackPreferences?.mode === TRACK_MODE_PRACTICE
            ? TRACK_MODE_PRACTICE
            : TRACK_MODE_STANDARD;
        this.currentIsRanked = Boolean(trackPreferences?.ranked);
        this.practiceEndOnCrash = this.currentModeKey === TRACK_MODE_PRACTICE
            ? Boolean(this.currentTrack.practice?.endOnCrash)
            : false;
        this.practiceSession = null;
        this.syncCurrentRunPolicy();
        this.ui.setPracticePauseVisible(false);
        this.refreshActiveBestTimes();
        this.setRuntimeConfig(null);
        this.ui.setBestTime(this.bestLapTime, {
            trackKey: this.currentTrackKey,
            mode: this.currentModeKey,
            ranked: this.currentIsRanked,
            persistToTrackCard: false
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

    scheduleVerificationQueueProcessing(delayMs = null) {
        if (this.verificationQueueTimer !== null) {
            clearTimeout(this.verificationQueueTimer);
            this.verificationQueueTimer = null;
        }

        const resolvedDelay = delayMs === null
            ? (() => {
                const nextAttemptAt = getNextVerificationAttemptAt();
                return nextAttemptAt === null ? null : Math.max(0, nextAttemptAt - Date.now());
            })()
            : Math.max(0, delayMs);

        if (resolvedDelay === null) return;
        if (resolvedDelay > 0 && !shouldAutoRetryVerificationQueue()) return;

        this.verificationQueueTimer = window.setTimeout(() => {
            this.verificationQueueTimer = null;
            this.processVerificationQueue().catch((error) => {
                console.error('Error processing verification queue:', error);
                this.scheduleVerificationQueueProcessing(getVerificationRetryDelayMs());
            });
        }, resolvedDelay);
    }

    async processVerificationQueue() {
        if (this.isProcessingVerificationQueue) return;
        this.isProcessingVerificationQueue = true;

        try {
            const dueScoreboardEntries = getDueScoreboardVerifications();
            for (const entry of dueScoreboardEntries) {
                await this.processScoreboardVerificationEntry(entry);
            }

            const dueDailyEntries = getDueDailyChallengeVerifications();
            for (const entry of dueDailyEntries) {
                await this.processDailyChallengeVerificationEntry(entry);
            }
        } finally {
            this.isProcessingVerificationQueue = false;
            this.scheduleVerificationQueueProcessing(null);
        }
    }

    async processScoreboardVerificationEntry(entry) {
        if (!entry?.trackKey || !entry?.mode || !Number.isFinite(entry?.bestTime) || !entry?.replay) {
            return;
        }

        if (this.ui.matchesModalScoreboardContext({ trackKey: entry.trackKey, mode: entry.mode })) {
            this.ui.updateModalScoreboardSnapshot(createVerificationSnapshot({
                statusText: 'Verifying...',
                verificationState: 'pending',
                isLoading: true
            }));
        }

        try {
            const result = await submitScoreboardBestTime({
                trackKey: entry.trackKey,
                mode: entry.mode,
                bestTime: entry.bestTime,
                replay: entry.replay
            });
            await this.handleScoreboardVerificationResult(entry, result);
        } catch (error) {
            console.error('Error submitting queued scoreboard time:', error);
            markScoreboardVerificationPending(
                entry.trackKey,
                entry.mode,
                Date.now() + getVerificationRetryDelayMs()
            );
            this.ui.refreshReturningTrackPersonalBest(entry.trackKey);
            if (this.ui.matchesModalScoreboardContext({ trackKey: entry.trackKey, mode: entry.mode })) {
                this.ui.updateModalScoreboardSnapshot(createVerificationSnapshot({
                    statusText: 'Queued for retry',
                    verificationState: 'pending',
                    isLoading: true
                }));
            }
        }
    }

    async handleScoreboardVerificationResult(entry, result) {
        const currentEntry = getScoreboardVerificationEntry(entry.trackKey, entry.mode);
        if (!currentEntry || currentEntry.updatedAt !== entry.updatedAt || currentEntry.bestTime !== entry.bestTime) {
            return;
        }

        const body = result?.body || null;
        if (result?.ok && body?.throttled) {
            markScoreboardVerificationPending(
                entry.trackKey,
                entry.mode,
                Date.now() + ((Number(body?.retryAfterSeconds) || 1) * 1000)
            );
            this.ui.refreshReturningTrackPersonalBest(entry.trackKey);
            if (this.ui.matchesModalScoreboardContext({ trackKey: entry.trackKey, mode: entry.mode })) {
                this.ui.updateModalScoreboardSnapshot(createVerificationSnapshot({
                    statusText: 'Retrying soon',
                    verificationState: 'pending',
                    isLoading: true
                }));
            }
            return;
        }

        if (result?.ok && body?.accepted && Number.isFinite(body?.bestTimeMs)) {
            const canonicalBestTime = body.bestTimeMs / 1000;
            const trackData = await syncBestTime(
                entry.trackKey,
                canonicalBestTime,
                entry.mode,
                {
                    ranked: true,
                    appendLapTime: entry.mode === TRACK_MODE_STANDARD && body.updated === true
                }
            );
            clearScoreboardVerification(entry.trackKey, entry.mode);
            this.applyVerifiedTrackData(entry.trackKey, entry.mode, trackData, canonicalBestTime);
            if (this.ui.matchesModalScoreboardContext({ trackKey: entry.trackKey, mode: entry.mode })) {
                this.ui.updateModalScoreboardSnapshot(VERIFICATION_ACCEPTED_PENDING_SNAPSHOT);
                this.ui.updateModalRunSummary({
                    bestTime: canonicalBestTime,
                    currentTime: canonicalBestTime,
                    lapTimesArray: entry.mode === TRACK_MODE_STANDARD
                        ? (trackData?.rankedLapTimes || [])
                        : undefined
                });
            }
            await this.refreshVerifiedTrackSnapshot(entry.trackKey, entry.mode);
            return;
        }

        if (result?.status === 422) {
            markScoreboardVerificationRejected(entry.trackKey, entry.mode);
            this.ui.refreshReturningTrackPersonalBest(entry.trackKey);
            if (this.ui.matchesModalScoreboardContext({ trackKey: entry.trackKey, mode: entry.mode })) {
                this.ui.updateModalScoreboardSnapshot(VERIFICATION_REJECTED_SNAPSHOT);
            }
            return;
        }

        markScoreboardVerificationPending(
            entry.trackKey,
            entry.mode,
            Date.now() + getVerificationRetryDelayMs()
        );
        this.ui.refreshReturningTrackPersonalBest(entry.trackKey);
        if (this.ui.matchesModalScoreboardContext({ trackKey: entry.trackKey, mode: entry.mode })) {
            this.ui.updateModalScoreboardSnapshot(createVerificationSnapshot({
                statusText: 'Queued for retry',
                verificationState: 'pending',
                isLoading: true
            }));
        }
    }

    applyVerifiedTrackData(trackKey, mode, trackData, canonicalBestTime) {
        this.hasAnyData = true;
        this.isReturningPlayer = this.playerStatus.isReturningPlayer(true);
        this.ui.refreshStartOverlay(this.status, this.hasAnyData, this.isReturningPlayer);
        if (this.currentTrackKey === trackKey) {
            this.setStoredBestTimes(trackData);
            this.ui.setBestTime(this.bestLapTime, { persistToTrackCard: false });
        }

        this.ui.updateReturningTrackPersonalBest(trackKey, canonicalBestTime, mode, true);
        this.ui.refreshReturningTrackPersonalBest(trackKey);
    }

    async refreshVerifiedTrackSnapshot(trackKey, mode) {
        this.ui.invalidateReturningTrackRankSnapshot(trackKey, mode, true);
        let scoreboardSnapshot = null;

        try {
            scoreboardSnapshot = await this.ui.requestReturningTrackRankSnapshot(trackKey, mode, true);
        } catch (error) {
            console.error('Error refreshing verified track snapshot:', error);
        }

        this.ui.refreshReturningTrackPersonalBest(trackKey);
        if (this.ui.matchesModalScoreboardContext({ trackKey, mode })) {
            this.ui.updateModalScoreboardSnapshot(
                scoreboardSnapshot?.playerRankLabel
                    ? scoreboardSnapshot
                    : VERIFICATION_ACCEPTED_PENDING_SNAPSHOT
            );
        }
    }

    async processDailyChallengeVerificationEntry(entry) {
        if (!entry?.challengeId || !Number.isFinite(entry?.bestTime) || !entry?.replay) {
            return;
        }

        if (this.ui.matchesModalScoreboardContext({ challengeId: entry.challengeId })) {
            this.ui.updateModalScoreboardSnapshot(createVerificationSnapshot({
                statusText: 'Verifying...',
                verificationState: 'pending',
                isLoading: true
            }));
        }

        try {
            const result = await submitDailyChallengeBestTime({
                challengeId: entry.challengeId,
                bestTime: entry.bestTime,
                replay: entry.replay
            });
            await this.handleDailyChallengeVerificationResult(entry, result);
        } catch (error) {
            console.error('Error submitting queued daily challenge time:', error);
            markDailyChallengeVerificationPending(
                entry.challengeId,
                Date.now() + getVerificationRetryDelayMs()
            );
            this.ui.refreshDailyChallengeVerificationState(entry.challengeId);
            if (this.ui.matchesModalScoreboardContext({ challengeId: entry.challengeId })) {
                this.ui.updateModalScoreboardSnapshot(createVerificationSnapshot({
                    statusText: 'Queued for retry',
                    verificationState: 'pending',
                    isLoading: true
                }));
            }
        }
    }

    async handleDailyChallengeVerificationResult(entry, result) {
        const currentEntry = getDailyChallengeVerificationEntry(entry.challengeId);
        if (!currentEntry || currentEntry.updatedAt !== entry.updatedAt || currentEntry.bestTime !== entry.bestTime) {
            return;
        }

        const body = result?.body || null;
        if (result?.ok && body?.throttled) {
            markDailyChallengeVerificationPending(
                entry.challengeId,
                Date.now() + ((Number(body?.retryAfterSeconds) || 1) * 1000)
            );
            this.ui.refreshDailyChallengeVerificationState(entry.challengeId);
            if (this.ui.matchesModalScoreboardContext({ challengeId: entry.challengeId })) {
                this.ui.updateModalScoreboardSnapshot(createVerificationSnapshot({
                    statusText: 'Retrying soon',
                    verificationState: 'pending',
                    isLoading: true
                }));
            }
            return;
        }

        if (result?.ok && body?.accepted && Number.isFinite(body?.bestTimeMs)) {
            const challenge = {
                id: entry.challengeId,
                challengeDate: entry.challengeDate,
                trackKey: entry.trackKey,
                objectiveType: entry.objectiveType
            };
            setDailyChallengeBestTime(
                challenge,
                body.bestTimeMs / 1000,
                Number.isFinite(body?.completedLaps) ? body.completedLaps : entry.completedLaps
            );
            clearDailyChallengeVerification(entry.challengeId);

            if (this.activeDailyChallenge?.id === entry.challengeId) {
                const scoreboardSnapshot = await this.refreshDailyChallengeSummary();
                if (this.ui.matchesModalScoreboardContext({ challengeId: entry.challengeId })) {
                    this.ui.updateModalScoreboardSnapshot(scoreboardSnapshot);
                }
            } else {
                this.ui.refreshDailyChallengeVerificationState(entry.challengeId);
            }
            return;
        }

        if (result?.status === 422) {
            markDailyChallengeVerificationRejected(entry.challengeId);
            this.ui.refreshDailyChallengeVerificationState(entry.challengeId);
            if (this.ui.matchesModalScoreboardContext({ challengeId: entry.challengeId })) {
                this.ui.updateModalScoreboardSnapshot(VERIFICATION_REJECTED_SNAPSHOT);
            }
            return;
        }

        markDailyChallengeVerificationPending(
            entry.challengeId,
            Date.now() + getVerificationRetryDelayMs()
        );
        this.ui.refreshDailyChallengeVerificationState(entry.challengeId);
        if (this.ui.matchesModalScoreboardContext({ challengeId: entry.challengeId })) {
            this.ui.updateModalScoreboardSnapshot(createVerificationSnapshot({
                statusText: 'Queued for retry',
                verificationState: 'pending',
                isLoading: true
            }));
        }
    }

    enqueueScoreboardVerificationSubmission({ trackKey, mode, bestTime, replay } = {}) {
        const { enqueued } = enqueueScoreboardVerification({ trackKey, mode, bestTime, replay });
        this.ui.refreshReturningTrackPersonalBest(trackKey);
        if (enqueued) {
            this.scheduleVerificationQueueProcessing(0);
        }
        return enqueued;
    }

    enqueueDailyChallengeVerificationSubmission({ challenge, bestTime, completedLaps = null, replay } = {}) {
        const { enqueued } = enqueueDailyChallengeVerification({
            challengeId: challenge?.id,
            bestTime,
            completedLaps,
            replay,
            objectiveType: challenge?.objectiveType,
            challengeDate: challenge?.challengeDate,
            trackKey: challenge?.trackKey
        });
        this.ui.refreshDailyChallengeVerificationState(challenge?.id);
        if (enqueued) {
            this.scheduleVerificationQueueProcessing(0);
        }
        return enqueued;
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
        return Boolean(this.currentRunPolicy?.isPractice);
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

    snapRenderPoseToCurrentPose() {
        this.prevPos.x = this.pos.x;
        this.prevPos.y = this.pos.y;
        this.prevAngle = this.angle;
    }

    /**
     * Practice lap boundary: clears the blue route trace, run-history line, and trail sample timer.
     * Daily GP multi-lap uses the same path so both modes stay identical.
     */
    _resetLapTrailStateFromPracticeLap({ resetPracticeMicroReplay = false } = {}) {
        this.routeTrace.clear();
        this.runHistory.clear();
        this.runHistoryTimer = 0;
        this.trailTimer = 0;
        if (resetPracticeMicroReplay) {
            this.resetPracticeLapReplay();
        }
        this.recordRunPoint(this.pos);
    }

    startSequence() {
        if (this.status !== 'ready') return;

        this.resetCanvasPresentation();
        this.status = 'starting';
        this.ui.setHudPersonalBestsOpenAllowed(false);
        this.ui.setPracticePauseVisible(false);
        this.practiceSession = this.isPracticeMode() ? this.createPracticeSession() : null;
        this.resetScoreboardReplay();
        if (this.isDailyChallengeRun()) {
            this.syncChallengeHudPrimaryStats();
        } else {
            this.ui.setBestTime(this.bestLapTime);
        }
        this.runHistory.clear();
        this.runHistoryTimer = 0;
        this.recordRunPoint(this.pos);
        this.ui.hideStartOverlay();
        this.ui.showStartLights();

        // Sequence: 3 red lights, then GO.
        this.activeTimers.push(setTimeout(() => this.ui.turnOnCountdownLight(0), 240));
        this.activeTimers.push(setTimeout(() => this.ui.turnOnCountdownLight(1), 660));
        this.activeTimers.push(setTimeout(() => this.ui.turnOnCountdownLight(2), 1080));

        this.activeTimers.push(setTimeout(() => {
            this.ui.hideStartLights();
            this.ui.showGoMessage();

            // Defer status transition to the next rAF tick so the DOM mutations
            // above flush before the game loop sees 'playing', and lastTime gets a
            // clean baseline with no stale frameTimeHistory from the countdown.
            this.pendingStartFrame = requestAnimationFrame((t) => {
                this.pendingStartFrame = null;
                this.snapRenderPoseToCurrentPose();
                this.accumulator = 0;
                this.status = 'playing';
                this.activeRunId += 1;
                this.currentTime = 0;
                this.lastTime = t;
                this.resetFrameTimingHistory();
                this.frameSkip = 0;
                this.ui.setPracticePauseVisible(true);
                this.updateDailyChallengeHud();
                this.requestRender();

                // Cleanup visuals after start
                this.activeTimers.push(setTimeout(() => {
                    this.ui.resetCountdown();
                }, 1500));
            });
        }, 1500));
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

    resetRunToTrackStart({
        currentTime = 0,
        relaunchDelay = 0,
        resetPracticeMicroReplay = false
    } = {}) {
        this.pos = { ...this.currentTrack.startPos };
        this.prevPos = { ...this.currentTrack.startPos };
        this.velocity = { x: 0, y: 0 };
        this.angle = this.currentTrack.startAngle;
        this.prevAngle = this.currentTrack.startAngle;
        this.cachedSpeed = 0;
        this.currentTime = currentTime;
        this.armRelaunchDelay(relaunchDelay);
        this.nextCheckpointIndex = 0;
        this.skidMarks.clear();
        this._resetLapTrailStateFromPracticeLap({ resetPracticeMicroReplay });
    }

    persistPracticeBestTime(bestTime, replay = null) {
        const trackKey = this.currentTrackKey;
        if (this.currentIsRanked) {
            this.enqueueScoreboardVerificationSubmission({
                trackKey,
                mode: TRACK_MODE_PRACTICE,
                bestTime,
                replay
            });
            return;
        }

        saveBestTime(trackKey, bestTime, TRACK_MODE_PRACTICE)
            .then((trackData) => {
                if (this.currentTrackKey !== trackKey) return;
                this.setStoredBestTimes(trackData);
                this.ui.setBestTime(this.bestLapTime, {
                    trackKey,
                    mode: this.currentModeKey,
                    ranked: false
                });
            })
            .catch((error) => {
                console.error('Error saving practice best time:', error);
            });
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

    getCarAssetNameForPresetConfig(runtimeConfig) {
        const preset = getPhysicsPresetForConfig(runtimeConfig);
        switch (preset?.key) {
        case 'muscle':
            return 'cars/webp/vgp_muscle.webp';
        case 'hyper':
            return 'cars/webp/vgp_hyper.webp';
        case 'ship':
            return 'cars/webp/vgp_ship.webp';
        case 'tuner':
            return 'cars/webp/vgp_tuner.webp';
        default:
            return 'cars/webp/vgp_stock.webp';
        }
    }

    getSelectedCarAssetName() {
        if (!this.currentChallengeRun) return 'cars/webp/vgp_stock.webp';
        return this.getCarAssetNameForPresetConfig(this.runtimeConfig);
    }

    getDailyChallengeCarAssetName() {
        if (!this.activeDailyChallenge) return null;
        return this.getCarAssetNameForPresetConfig(this.activeDailyChallenge.physicsOverrides);
    }

    syncCarSpriteAsset() {
        this.loadCarSpriteAsset(this.getSelectedCarAssetName());
    }

    prefetchCarSpriteAsset(assetName) {
        if (!assetName) return null;

        const cachedAsset = this.carSpriteAssetCache.get(assetName);
        if (cachedAsset) return cachedAsset;

        const image = new Image();
        image.decoding = 'async';
        const cachedRecord = {
            image,
            status: 'pending',
            promise: null
        };
        cachedRecord.promise = new Promise((resolve, reject) => {
            image.addEventListener('load', () => {
                cachedRecord.status = 'loaded';
                resolve(image);
            }, { once: true });
            image.addEventListener('error', () => {
                this.carSpriteAssetCache.delete(assetName);
                reject(new Error(`Unable to load ${assetName}`));
            }, { once: true });
        });
        this.carSpriteAssetCache.set(assetName, cachedRecord);
        image.src = new URL(`../${assetName}`, import.meta.url).href;
        return cachedRecord;
    }

    sanitizeCarSpriteAsset(image) {
        const width = image?.naturalWidth || image?.width || 0;
        const height = image?.naturalHeight || image?.height || 0;
        if (!width || !height || typeof document === 'undefined') return image;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return image;

        ctx.drawImage(image, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const { data } = imageData;
        let changed = false;

        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha === 0) continue;

            if (alpha < 14) {
                data[i + 3] = 0;
                changed = true;
                continue;
            }

            if (alpha >= 224) continue;

            const luminance = (data[i] * 0.2126) + (data[i + 1] * 0.7152) + (data[i + 2] * 0.0722);
            if (luminance < 168) continue;

            const edgeFactor = alpha / 255;
            data[i] = Math.round(data[i] * edgeFactor);
            data[i + 1] = Math.round(data[i + 1] * edgeFactor);
            data[i + 2] = Math.round(data[i + 2] * edgeFactor);

            if (alpha < 104) {
                data[i + 3] = Math.max(0, alpha - 24);
            }

            changed = true;
        }

        if (!changed) return image;

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    loadCarSpriteAsset(assetName) {
        if (!assetName || this.carSpriteAssetKey === assetName) return;

        const loadToken = ++this.carSpriteLoadToken;
        const cachedAsset = this.prefetchCarSpriteAsset(assetName);
        if (!cachedAsset) return;

        const applyLoadedAsset = (image) => {
            if (loadToken !== this.carSpriteLoadToken) return;
            this.carSprite = this.sanitizeCarSpriteAsset(image);
            this.carSpriteDrawWidth = 52;
            this.carSpriteDrawHeight = 52;
            this.carSpriteAssetKey = assetName;
            this.requestRender();
        };

        if (cachedAsset.status === 'loaded') {
            applyLoadedAsset(cachedAsset.image);
            return;
        }

        cachedAsset.promise.then((image) => {
            applyLoadedAsset(image);
        }).catch(() => {
            if (loadToken !== this.carSpriteLoadToken) return;
            console.warn(`Unable to load ${assetName}; using fallback car sprite.`);
            this.carSpriteAssetKey = null;
        });
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
        this.resetPracticeLapReplay();
    }

    resetPracticeLapReplay() {
        this.practiceLapReplaySegments = [];
        this.practiceLapReplayFrameCount = 0;
        this.practiceLapReplayOverflowed = false;
        // Authoritative pose when this lap's recording window opens (server must match this, not grid).
        this.practiceLapReplayStartState = {
            pos: { x: this.pos.x, y: this.pos.y },
            velocity: { x: this.velocity.x, y: this.velocity.y },
            angle: this.angle,
            nextCheckpointIndex: this.nextCheckpointIndex,
            currentTime: this.currentTime,
            relaunchDelayRemaining: this.relaunchDelayRemaining
        };
    }

    recordReplayFrameToBuffer(segmentsKey, frameCountKey, overflowedKey, left, right, relaunchDelay) {
        if (this[overflowedKey]) return;

        if (this[frameCountKey] >= SCOREBOARD_REPLAY_MAX_FRAMES) {
            this[overflowedKey] = true;
            return;
        }

        const segments = this[segmentsKey];
        const lastSegment = segments[segments.length - 1];

        if (
            lastSegment
            && lastSegment.left === left
            && lastSegment.right === right
            && lastSegment.relaunchDelay === relaunchDelay
        ) {
            lastSegment.frames += 1;
        } else {
            segments.push({
                frames: 1,
                left,
                right,
                relaunchDelay
            });
        }

        this[frameCountKey] += 1;
    }

    recordScoreboardReplayFrame() {
        const left = Boolean(this.keys.left);
        const right = Boolean(this.keys.right);
        const relaunchDelay = this.relaunchDelayRemaining > 0;
        this.recordReplayFrameToBuffer(
            'scoreboardReplaySegments',
            'scoreboardReplayFrameCount',
            'scoreboardReplayOverflowed',
            left,
            right,
            relaunchDelay
        );
        if (this.isPracticeMode()) {
            this.recordReplayFrameToBuffer(
                'practiceLapReplaySegments',
                'practiceLapReplayFrameCount',
                'practiceLapReplayOverflowed',
                left,
                right,
                relaunchDelay
            );
        }
    }

    getReplayPayload(segmentsKey, frameCountKey, overflowedKey, targetLapNumber = 1) {
        if (this[overflowedKey] || this[frameCountKey] <= 0) {
            return null;
        }

        return {
            targetLapNumber,
            inputs: this[segmentsKey].map((segment) => ({ ...segment }))
        };
    }

    getScoreboardReplayPayload(targetLapNumber = 1) {
        return this.getReplayPayload(
            'scoreboardReplaySegments',
            'scoreboardReplayFrameCount',
            'scoreboardReplayOverflowed',
            targetLapNumber
        );
    }

    getPracticeLapReplayPayload() {
        if (this.practiceLapReplayOverflowed || this.practiceLapReplayFrameCount <= 0) {
            return null;
        }

        return {
            targetLapNumber: 1,
            initialState: this.practiceLapReplayStartState,
            inputs: this.practiceLapReplaySegments.map((segment) => ({ ...segment }))
        };
    }

    updateTrackLayerViewportSize(devicePixelRatio = null) {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const resolvedDevicePixelRatio = devicePixelRatio || readCanvasDevicePixelRatio();

        if (this.trackLayerWorkerReady && this.trackLayerWorker) {
            // Worker-backed track layers are resized inside the render message so
            // the clear and repaint happen as one visible update.
            return;
        }

        if (this.trackLayerCanvas && this.trackLayerCtx) {
            configureCanvasViewport(
                this.trackLayerCanvas,
                this.trackLayerCtx,
                width,
                height,
                resolvedDevicePixelRatio
            );
        }
    }

    scheduleResizeCommit() {
        this.isNarrowViewport = window.innerWidth <= 768;
        if (this.resizeCommitTimer !== null) {
            clearTimeout(this.resizeCommitTimer);
        }
        this.resizeCommitTimer = setTimeout(() => {
            this.resizeCommitTimer = null;
            this.resize();
        }, CANVAS_RESIZE_SETTLE_MS);
    }

    resize({ render = true } = {}) {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width <= 0 || height <= 0) return;

        const devicePixelRatio = typeof this.getCanvasDevicePixelRatio === 'function'
            ? this.getCanvasDevicePixelRatio()
            : readCanvasDevicePixelRatio();
        this.updateTrackLayerViewportSize(devicePixelRatio);
        const viewport = configureCanvasViewport(
            this.canvas,
            this.ctx,
            width,
            height,
            devicePixelRatio
        );
        this.viewportWidth = viewport.cssWidth;
        this.viewportHeight = viewport.cssHeight;
        this.viewportDevicePixelRatio = viewport.devicePixelRatio;
        this.isNarrowViewport = window.innerWidth <= 768;
        if (render) {
            this.render(0, 1);
            this._needsRender = false;
        }
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
        this.clearDailyChallengeRun();

        // Sync carousel highlight only — do not prefetch leaderboard (that is for the track picker).
        this.ui.setTrackSelection(trackKey, { refreshRankSnapshots: false });

        const trackAssetOptions = {
            qualityLevel: this.qualityLevel,
            frameSkip: this.frameSkip
        };
        const runtime = getTrackRuntimeAsset(trackKey, this.currentTrack, trackAssetOptions);
        this.activeGeometry.outer = runtime.outer;
        this.activeGeometry.inner = runtime.inner;
        this.collisionSegments = runtime.collisionSegments;
        this.collisionHash = runtime.collisionHash;
        await this.refreshTrackPresentation(requestId);

        // Stop the current run immediately so physics and collision checks
        // cannot continue against the new track geometry while storage loads.
        this.bestLapTime = null;
        const previewPreferences = this.ui.getTrackPreferences(trackKey);
        const previewModeKey = previewPreferences.mode === TRACK_MODE_PRACTICE
            ? TRACK_MODE_PRACTICE
            : TRACK_MODE_STANDARD;
        this.currentModeKey = previewModeKey;
        this.currentIsRanked = Boolean(previewPreferences.ranked);
        this.practiceEndOnCrash = this.currentModeKey === TRACK_MODE_PRACTICE
            ? Boolean(nextTrack.practice?.endOnCrash)
            : false;
        this.syncCurrentRunPolicy();

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
            if (this.isDailyChallengeRun()) {
                this.restartDailyChallenge();
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
            if (this.isDailyChallengeRun() && this.isCrashBudgetDailyChallenge()) {
                const completedLaps = Math.max(0, Math.trunc(this.currentChallengeRun?.completedLaps || 0));
                const crashesLeft = Math.max(0, (this.currentChallengeRun?.maxCrashes || 0) - (this.currentChallengeRun?.crashCount || 0));
                this.lastSharePayload = null;
                this.ui.showModal('Paused', null, {
                    variant: 'daily-crash-budget-pause',
                    completedLaps,
                    crashesLeft
                }, false, createModalActions({
                    modalKind: 'practice-pause',
                    primaryActionLabel: 'Resume',
                    primaryAction: () => this.resumePracticeSession(),
                    primaryActionIcon: 'play',
                    secondaryActionLabel: 'Done',
                    secondaryActionIcon: 'done',
                    secondaryAction: () => this.reset(false)
                }));
                return;
            }

            const bestTime = this.isDailyChallengeRun()
                ? this.bestLapTime
                : (this.bestTimesByMode[TRACK_MODE_STANDARD] ?? null);
            const deltaToBest = bestTime === null || bestTime === undefined
                ? null
                : this.currentTime - bestTime;
            this.lastSharePayload = null;
            this.ui.showModal('Paused', null, {
                variant: 'standard-pause',
                lapTime: this.currentTime,
                bestTime,
                deltaToBest,
                primaryStatLabel: this.isDailyChallengeRun()
                    ? getDailyChallengeCopyLabels(this.activeDailyChallenge).primaryStatLabel
                    : 'Lap Time'
            }, false, createModalActions({
                modalKind: 'practice-pause',
                primaryActionLabel: 'Resume',
                primaryActionIcon: 'play',
                primaryAction: () => this.resumePracticeSession(),
                secondaryActionLabel: 'Done',
                secondaryActionIcon: 'done',
                secondaryAction: () => this.reset(false)
            }));
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
        const practiceVerificationEntry = hasPracticePb && this.currentIsRanked
            ? getScoreboardVerificationEntry(trackKey, TRACK_MODE_PRACTICE)
            : null;
        const practiceScoreboardSnapshot = hasPracticePb && this.currentIsRanked
            ? (
                getVerificationSnapshotFromQueueEntry(practiceVerificationEntry)
                || this.ui.getCachedTrackCardScoreboardSnapshot(trackKey, TRACK_MODE_PRACTICE, true)
                || VERIFICATION_ACCEPTED_PENDING_SNAPSHOT
            )
            : null;
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
            scoreboardSnapshot: practiceScoreboardSnapshot,
            scoreboardMode: TRACK_MODE_PRACTICE
        }, Boolean(practiceSharePayload), createModalActions({
            modalKind: 'practice-pause',
            forceSharePanelVisible: true,
            primaryActionLabel: 'Resume',
            primaryActionIcon: 'play',
            primaryAction: () => this.resumePracticeSession(),
            secondaryActionLabel: 'Done',
            secondaryActionIcon: 'done',
            secondaryAction: () => this.stopPracticeSession(),
            shareActionLabel: 'Challenge',
            shareActionIcon: 'save'
        }));
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
    }

    resumePracticeSession() {
        if (this.status !== 'paused') return;

        this.status = 'playing';
        this.armRelaunchDelay(this.runtimeConfig.resumeRelaunchDelay);
        this.accumulator = 0;
        this.lastTime = this.getNow();
        this.ui.closeModal();
        this.updateDailyChallengeHud();
        this.requestRender();
    }

    update(dt) {
        if (this.status === 'playing') {
            this.recordScoreboardReplayFrame();
        }

        // Mutate-in-place: simulation writes directly to `this.*` fields.
        // Only event flags are returned (via a reused object).
        const events = updateSimulation(
            this, dt, this.runtimeConfig, this.currentTrack, this.collisionSegments
        );

        // Lap / win before practice crash reset so the same frame can both finish a legal lap
        // and trigger a wall reset without wiping the practice replay buffer first (must match
        // replay-validation.ts, which applies lap completion before practiceCrashReset).
        if (events.lapCompleted) {
            this.handlePracticeLapCompleted(events.completedLapTime);
        }
        if (events.challengeLapCompleted) {
            this.handleDailyChallengeLapCompleted(events.challengeCompletedLapTime);
        }
        if (events.winTriggered) {
            if (this.isDailyChallengeRun()) {
                this.handleDailyChallengeWin(events.winData);
            } else {
                this.handleWin(events.winData);
            }
        }
        if (events.challengeCrashReset) {
            this.restartDailyChallengeAfterCrash();
            return;
        }
        if (events.challengeFailed) {
            this.handleDailyChallengeFailure(events.challengeFailureReason, events.crashImpact);
            return;
        }
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
            this.ui.showModal('CRASHED', null, { isCrash: true, impact: events.crashImpact }, false, createModalActions({
                modalKind: 'crash',
                primaryActionLabel: 'Retry',
                primaryActionIcon: 'retry',
                secondaryActionLabel: 'Done',
                secondaryAction: () => this.reset(false),
                secondaryActionIcon: 'done'
            }));
        }
    }

    handlePracticeLapCompleted(lapTime) {
        if (!this.isPracticeMode() || !this.practiceSession || lapTime === null || lapTime === undefined) return;

        const lapNumber = this.practiceSession.lapCount + 1;
        const completedLapReplay = this.currentIsRanked
            ? this.getPracticeLapReplayPayload()
            : null;
        this.recordRunPoint(this.pos);
        const runHistorySnapshot = this.runHistory.toArray();
        const lapRecord = buildLapRecord(lapNumber, lapTime, this.bestTimesByMode[TRACK_MODE_PRACTICE]);

        this.practiceSession.lapCount = lapNumber;
        pushRecentLap(this.practiceSession.recentLaps, lapRecord);

        const currentPersistedPracticeBest = this.bestTimesByMode[TRACK_MODE_PRACTICE];
        const isPersistedBest = currentPersistedPracticeBest === null
            || currentPersistedPracticeBest === undefined
            || lapTime < currentPersistedPracticeBest;
        if (isPersistedBest) {
            this.practiceSession.hasNewPersonalBest = true;
            if (!this.currentIsRanked) {
                this.bestTimesByMode[TRACK_MODE_PRACTICE] = lapTime;
                this.bestLapTime = this.currentModeKey === TRACK_MODE_PRACTICE ? lapTime : this.bestLapTime;
            }
            this.persistPracticeBestTime(lapTime, completedLapReplay);
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

        this._resetLapTrailStateFromPracticeLap({ resetPracticeMicroReplay: true });
        this.ui.setBestTime(this.bestLapTime, {
            trackKey: this.currentTrackKey,
            mode: TRACK_MODE_PRACTICE,
            ranked: this.currentIsRanked,
            persistToTrackCard: isPersistedBest && !this.currentIsRanked
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

        this.resetRunToTrackStart({
            currentTime: 0,
            relaunchDelay: this.runtimeConfig.crashRelaunchDelay,
            resetPracticeMicroReplay: true
        });
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

    handleDailyChallengeLapCompleted(lapTime) {
        if (!this.currentChallengeRun || !Number.isFinite(lapTime)) {
            this.updateDailyChallengeHud();
            this.requestRender();
            return;
        }

        const lapNumber = this.currentChallengeRun.completedLaps || 0;
        const lapRecord = buildLapRecord(lapNumber, lapTime, this.currentChallengeRun.bestLap?.time ?? null);

        pushRecentLap(this.currentChallengeRun.recentLaps, lapRecord);

        if (!this.currentChallengeRun.bestLap || lapTime < this.currentChallengeRun.bestLap.time) {
            this.currentChallengeRun.bestLap = {
                lapNumber,
                time: lapTime
            };
        }

        this.ui.showPracticeLapFlash({
            lapNumber,
            lapTime,
            deltaVsBest: lapRecord.deltaVsBest,
            isBest: false,
            isNewBest: false
        });
        this._resetLapTrailStateFromPracticeLap();
        this.updateDailyChallengeHud();
        this.requestRender();
    }

    restartDailyChallengeAfterCrash() {
        if (!this.currentChallengeRun) return;

        this.resetRunToTrackStart({
            currentTime: this.currentTime,
            relaunchDelay: this.runtimeConfig.crashRelaunchDelay
        });
        this.ui.syncHud({ time: this.currentTime, speed: 0, force: true });
        this.updateDailyChallengeHud();
        this.requestRender();
    }

    handleDailyChallengeFailure(reason, crashImpact = null) {
        if (!this.currentChallengeRun) return;

        this.ui.setPracticePauseVisible(false);
        this.ui.setHudPersonalBestsOpenAllowed(true);
        this.lastSharePayload = null;
        this.ui.showModal('CRASHED', null, {
            isCrash: true,
            impact: crashImpact
        }, false, createModalActions({
            modalKind: 'crash',
            primaryActionLabel: 'Retry',
            primaryAction: () => this.restartDailyChallenge(),
            primaryActionIcon: 'retry',
            secondaryActionLabel: 'Done',
            secondaryActionIcon: 'done',
            secondaryAction: () => this.reset(false)
        }));
    }

    handleDailyChallengeWin(winData) {
        if (!this.isValidatedWinData(winData) || !this.currentChallengeRun || !this.activeDailyChallenge) {
            return;
        }

        this.status = 'won';
        const finalTime = winData.lapTime;
        const challenge = this.activeDailyChallenge;
        const completedLaps = Math.max(0, Math.trunc(winData.completedLaps || 0));
        const previousBest = this.dailyChallengeBestResult;
        const isCrashBudget = this.isCrashBudgetDailyChallenge(challenge);
        const isNewBest = isNewBestResult(
            this.currentRunPolicy,
            { bestTime: finalTime, completedLaps },
            previousBest
        );
        this.ui.syncHud({ time: finalTime, speed: this.cachedSpeed, force: true });
        this.ui.setBestTime(isCrashBudget ? null : this.bestLapTime, { persistToTrackCard: false });
        this.ui.setHudPersonalBestsOpenAllowed(false);

        this.lastSharePayload = null;
        const existingScoreboardSnapshot = this.ui.getDailyChallengeScoreboardSnapshot();
        this.ui.showModal('Daily GP Complete', null, {
            lapTime: finalTime,
            bestTime: this.bestLapTime,
            completedLaps,
            isNewBest,
            primaryStatLabel: getDailyChallengeCopyLabels(challenge).primaryStatLabel,
            variant: isCrashBudget ? 'daily-crash-budget' : null,
            scoreboardSnapshot: isNewBest
                ? createVerificationSnapshot({
                    statusText: 'Submitting...',
                    verificationState: 'pending',
                    isLoading: true
                })
                : existingScoreboardSnapshot,
            scoreboardChallengeId: challenge.id,
            scoreboardDailyChallengeSkin: typeof challenge.skin === 'string' && challenge.skin.trim()
                ? challenge.skin.trim()
                : null,
            showGlobalLeaderboard: false,
            allowLeaderboardOpen: true
        }, false, createModalActions({
            modalKind: 'standard-win',
            primaryActionLabel: 'Retry',
            primaryAction: () => this.restartDailyChallenge(),
            primaryActionIcon: 'retry',
            secondaryActionLabel: 'Done',
            secondaryActionIcon: 'done',
            secondaryAction: () => this.reset(false)
        }));
        if (this.ui.modalMsg) {
            this.ui.modalMsg.style.display = '';
            this.ui.modalMsg.textContent = isCrashBudget
                ? `${completedLaps} lap${completedLaps === 1 ? '' : 's'} before the final crash`
                : `${getDailyChallengeTrackName(challenge)} • ${getDailyChallengeObjectiveLabel(challenge)}`;
        }

        if (isNewBest) {
            this.enqueueDailyChallengeVerificationSubmission({
                challenge,
                bestTime: finalTime,
                completedLaps,
                replay: this.getScoreboardReplayPayload(1)
            });
        }
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
            startAngle: this.currentTrack.startAngle,
            presentation: this.getTrackPresentation(this.currentTrackKey, {
                surface: TRACK_PRESENTATION_SURFACES.SHARE
            })
        };
    }

    isValidatedWinData(winData) {
        if (!winData || typeof winData !== 'object') return false;
        if (this.status !== 'won') return false;
        if (winData.trackKey !== this.currentTrackKey) return false;
        if (winData.runId !== this.activeRunId) return false;

        const checkpointCount = this.currentTrack.checkpoints?.length || 0;
        if (winData.checkpointCount !== checkpointCount) return false;
        const endedOnCrash = Boolean(winData.challengeEndedOnCrash && this.isCrashBudgetDailyChallenge());
        if (!endedOnCrash && winData.completedCheckpointCount < checkpointCount) return false;
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
            if (this.currentIsRanked) {
                trackData = await getTrackData(trackKey);
            } else {
                trackData = await saveLapTime(trackKey, finalTime);
            }
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
                rankedLapTimes: [],
                rankedBestTime: this.rankedBestTimesByMode[TRACK_MODE_STANDARD] ?? null,
                rankedBestTimes: {
                    ...this.rankedBestTimesByMode,
                    [TRACK_MODE_STANDARD]: this.rankedBestTimesByMode[TRACK_MODE_STANDARD] ?? null
                }
            };
            if (!this.currentIsRanked && finalTime < (previousBest ?? Infinity)) {
                trackData.bestTime = finalTime;
                trackData.bestTimes[TRACK_MODE_STANDARD] = finalTime;
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
            persistToTrackCard: !this.currentIsRanked
        });
        this.ui.setHudPersonalBestsOpenAllowed(true);

        const activeLapTimes = this.currentIsRanked
            ? trackData.rankedLapTimes
            : trackData.lapTimes;
        const activeBestTime = this.currentIsRanked
            ? trackData.rankedBestTime
            : trackData.bestTime;

        // Check if this is a new best
        const isNewBest = isNewBestResult(
            this.currentRunPolicy,
            { bestTime: finalTime },
            { bestTime: previousBest }
        );
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
            startPos: startPosSnapshot,
            presentation: this.getTrackPresentation(trackKey, {
                surface: TRACK_PRESENTATION_SURFACES.SHARE
            })
        };
        this.ui.showModal(title, null, {
            lapTime: finalTime,
            bestTime: activeBestTime ?? finalTime,
            lapTimesArray: activeLapTimes || [],
            isNewBest,
            scoreboardTrackKey: trackKey,
            scoreboardSnapshot: isNewBest && this.currentIsRanked
                ? createVerificationSnapshot({
                    statusText: 'Submitting...',
                    verificationState: 'pending',
                    isLoading: true
                })
                : null,
            scoreboardMode: TRACK_MODE_STANDARD
        }, Boolean(this.lastSharePayload), createModalActions({
            modalKind: 'standard-win',
            primaryActionLabel: 'Retry',
            primaryActionIcon: 'retry',
            secondaryActionLabel: 'Done',
            secondaryActionIcon: 'done',
            secondaryAction: () => this.reset(false),
            shareActionLabel: 'Challenge',
            shareActionIcon: 'save'
        }));
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

        this.enqueueScoreboardVerificationSubmission({
            trackKey,
            mode: TRACK_MODE_STANDARD,
            bestTime: finalTime,
            replay: this.getScoreboardReplayPayload(1)
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
            const returnMode = this.ui.isModalActive() ? 'back' : 'close';
            this.ui.showRunsModal(practiceSummary, practiceSummary.bestLap.time, null, returnMode, {
                showGlobalLeaderboard: false,
                scoreboardMode: TRACK_MODE_PRACTICE,
                scoreboardTrackKey: this.currentTrackKey
            });
            return;
        }

        if (this.bestLapTime === null || this.bestLapTime === undefined) return;

        const trackKey = this.currentTrackKey;
        const requestId = this.trackLoadRequestId;
        try {
            const trackData = await getTrackData(trackKey);
            if (requestId !== this.trackLoadRequestId || this.currentTrackKey !== trackKey) return;
            const lapTimes = this.currentIsRanked ? trackData.rankedLapTimes : trackData.lapTimes;
            const bestTime = this.currentIsRanked ? trackData.rankedBestTime : trackData.bestTime;
            if (!lapTimes?.length || bestTime === null || bestTime === undefined) return;
            const returnMode = this.ui.isModalActive() ? 'back' : 'close';
            this.ui.showRunsModal(lapTimes, bestTime, null, returnMode, {
                showGlobalLeaderboard: false,
                scoreboardMode: TRACK_MODE_STANDARD,
                scoreboardTrackKey: trackKey
            });
        } catch (error) {
            console.error('Error loading personal bests:', error);
        }
    }

    reset(autoStart = false, { preserveDailyChallenge = false } = {}) {
        // Clear any running start sequences
        this.clearTimers();
        if (this.pendingStartFrame !== null) {
            cancelAnimationFrame(this.pendingStartFrame);
            this.pendingStartFrame = null;
        }

        const wasModalActive = this.ui.isModalActive();
        const dailyChallengeToRestore = preserveDailyChallenge ? this.activeDailyChallenge : null;

        this.pos = { ...this.currentTrack.startPos };
        this.prevPos = { ...this.currentTrack.startPos };
        this.velocity = { x: 0, y: 0 };
        this.angle = this.currentTrack.startAngle;
        this.prevAngle = this.currentTrack.startAngle;
        this.cachedSpeed = 0;
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
        if (dailyChallengeToRestore) {
            this.currentChallengeRun = null;
            this.dailyChallengeBestResult = null;
            this.syncCurrentRunPolicy();
        } else {
            this.clearDailyChallengeRun();
        }
        this.ui.closeModal();
        this.shareService.reset({ visible: false, preservePreview: wasModalActive, preserveVisibility: wasModalActive });
        this.ui.setHudPersonalBestsOpenAllowed(!autoStart);
        this.ui.setPracticePauseVisible(false);

        // Reset Visuals
        this.ui.resetCountdown();
        this.ui.resetHud();
        if (dailyChallengeToRestore) {
            this.applyDailyChallenge(dailyChallengeToRestore);
        } else {
            this.ui.setBestTime(this.bestLapTime, {
                persistToTrackCard: false
            });
        }

        this._lookAheadX = 0;
        this._lookAheadY = 0;
        this._prevSteeringCommand = 0;
        this._spaceRcsHoldTime = 0;
        this._spaceRcsBurst = 0;

        if (autoStart) {
            this.ui.hideStartOverlay();
        } else {
            this.ui.showStartOverlay(this.hasAnyData, this.isReturningPlayer);
            this.resetCanvasPresentation();
        }

        this.resize({ render: false });
        const cw = this.viewportWidth || this.container.clientWidth || this.canvas.width;
        const ch = this.viewportHeight || this.container.clientHeight || this.canvas.height;
        const gs = CONFIG.gridSize;
        this.camera.x = (this.pos.x * gs) - cw / 2 / this.zoom;
        this.camera.y = (this.pos.y * gs) - ch / 2 / this.zoom;
        this.requestRender();

        if (autoStart) {
            this.startSequence();
        }
    }

    restartDailyChallenge() {
        if (!this.activeDailyChallenge) return;

        this.trackModeStart('daily', {
            trackKey: this.activeDailyChallenge.trackKey
        });
        this.bumpRaceStartForCurrentMode();
        this.reset(true, { preserveDailyChallenge: true });
    }

    resetCanvasPresentation() {
        [this.trackLayerCanvas, this.canvas].forEach((canvas) => {
            if (!canvas) return;
            canvas.classList.remove('canvas-opacity-instant');
            canvas.style.transition = '';
            canvas.style.opacity = '1';
        });
    }

    applyPreviewPresentation({ opacity, instant }) {
        if (this.status !== 'ready') return;
        [this.trackLayerCanvas, this.canvas].forEach((canvas) => {
            if (!canvas) return;
            if (instant) {
                canvas.classList.add('canvas-opacity-instant');
                canvas.style.opacity = String(opacity);
            } else {
                canvas.classList.remove('canvas-opacity-instant');
                canvas.style.opacity = String(opacity);
            }
        });
    }

    _animateCanvasOpacity(target, durationMs) {
        return new Promise((resolve) => {
            const canvases = [this.trackLayerCanvas, this.canvas].filter(Boolean);
            if (!canvases.length) {
                resolve();
                return;
            }
            const ms = Math.max(0, durationMs);
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                canvases.forEach((canvas) => canvas.removeEventListener('transitionend', onEnd));
                resolve();
            };
            const onEnd = (e) => {
                if (e.target !== canvases[0] || e.propertyName !== 'opacity') return;
                finish();
            };
            canvases.forEach((canvas) => {
                canvas.classList.remove('canvas-opacity-instant');
                canvas.style.transition = `opacity ${ms}ms cubic-bezier(0.25, 0.82, 0.2, 1)`;
                canvas.addEventListener('transitionend', onEnd);
            });
            requestAnimationFrame(() => {
                canvases.forEach((canvas) => {
                    canvas.style.opacity = String(target);
                });
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

    async syncTrackLayerBitmap(trackLoadRequestId = this.trackLoadRequestId) {
        if (!this.trackCanvas) return;

        if (!this.trackLayerWorkerReady || !this.trackLayerWorker || typeof createImageBitmap !== 'function') {
            return;
        }

        const bitmapVersion = ++this.trackLayerBitmapVersion;
        const bitmapPromise = createImageBitmap(this.trackCanvas);
        this.trackLayerBitmapPromise = bitmapPromise;

        try {
            const bitmap = await bitmapPromise;
            if (
                trackLoadRequestId !== this.trackLoadRequestId
                || bitmapVersion !== this.trackLayerBitmapVersion
                || !this.trackLayerWorker
            ) {
                bitmap.close?.();
                return;
            }

            this.trackLayerWorker.postMessage({
                type: 'track',
                bitmap,
                origin: this.trackCanvasOrigin,
                offTrackColor: this.currentTrackPresentation?.offTrackColor || CONFIG.offTrackColor,
                presentation: this.currentTrackPresentation || null
            }, [bitmap]);
        } catch (error) {
            console.error('Error syncing track-layer bitmap:', error);
        } finally {
            if (this.trackLayerBitmapPromise === bitmapPromise) {
                this.trackLayerBitmapPromise = null;
            }
        }
    }

    drawVisibleTrackCanvas() {
        const worldLeft = this.camera.x;
        const worldTop = this.camera.y;
        const canvasWidth = this.trackLayerWorkerReady
            ? this.viewportWidth || this.container.clientWidth
            : (this.viewportWidth || this.trackLayerCanvas?.width || this.canvas.width);
        const canvasHeight = this.trackLayerWorkerReady
            ? this.viewportHeight || this.container.clientHeight
            : (this.viewportHeight || this.trackLayerCanvas?.height || this.canvas.height);

        if (this.trackLayerWorkerReady && this.trackLayerWorker) {
            this.trackLayerWorker.postMessage({
                type: 'render',
                camera: {
                    x: worldLeft,
                    y: worldTop
                },
                zoom: this.zoom,
                viewport: {
                    width: canvasWidth,
                    height: canvasHeight,
                    devicePixelRatio: this.viewportDevicePixelRatio
                }
            });
            return;
        }

        const ctx = this.trackLayerCtx;
        if (!ctx || !this.trackCanvas) return;

        const worldWidth = canvasWidth / this.zoom;
        const worldHeight = canvasHeight / this.zoom;
        const sourceLeft = Math.max(0, worldLeft - this.trackCanvasOrigin.x);
        const sourceTop = Math.max(0, worldTop - this.trackCanvasOrigin.y);
        const sourceRight = Math.min(
            this.trackCanvas.width,
            (worldLeft + worldWidth) - this.trackCanvasOrigin.x
        );
        const sourceBottom = Math.min(
            this.trackCanvas.height,
            (worldTop + worldHeight) - this.trackCanvasOrigin.y
        );
        const sourceWidth = sourceRight - sourceLeft;
        const sourceHeight = sourceBottom - sourceTop;

        drawViewportPresentationBackground(
            ctx,
            canvasWidth,
            canvasHeight,
            { x: worldLeft, y: worldTop },
            this.zoom,
            this.currentTrackPresentation || {}
        );
        if (sourceWidth <= 0 || sourceHeight <= 0) return;

        const destX = (this.trackCanvasOrigin.x + sourceLeft - worldLeft) * this.zoom;
        const destY = (this.trackCanvasOrigin.y + sourceTop - worldTop) * this.zoom;

        ctx.drawImage(
            this.trackCanvas,
            sourceLeft,
            sourceTop,
            sourceWidth,
            sourceHeight,
            destX,
            destY,
            sourceWidth * this.zoom,
            sourceHeight * this.zoom
        );
    }

    render(dt, alpha = 1) {
        const ctx = this.ctx;
        const cw = this.viewportWidth || this.container.clientWidth || this.canvas.width;
        const ch = this.viewportHeight || this.container.clientHeight || this.canvas.height;
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

        // 1. Clear dynamic layer; static layer is painted separately.
        ctx.clearRect(0, 0, cw, ch);

        // 2. Camera: dynamic look-ahead based on velocity to prevent whipping
        const speed = this.cachedSpeed;
        const mobileCameraMode = this.isCoarsePointer || this.isNarrowViewport;
        this.zoom = mobileCameraMode ? 0.75 : 1.0;

        const desiredLookAhead = this.getDesiredLookAhead(speed, cw, ch, mobileCameraMode);

        const smoothSpeed = mobileCameraMode ? 2 : 4;
        const cameraDt = dt > 0
            ? Math.min(Math.max(dt, CAMERA_DT_MIN_S), CAMERA_DT_MAX_S)
            : 0;
        const lerpFactor = cameraDt > 0 ? 1 - Math.exp(-cameraDt * smoothSpeed) : 0;

        this._lookAheadX += (desiredLookAhead.x - this._lookAheadX) * lerpFactor;
        this._lookAheadY += (desiredLookAhead.y - this._lookAheadY) * lerpFactor;

        this.camera.x = (displayPos.x * gs) + this._lookAheadX - (cw / 2 / this.zoom);
        this.camera.y = (displayPos.y * gs) + this._lookAheadY - (ch / 2 / this.zoom);



        // 3. Draw static track elements via offscreen canvas
        this.drawVisibleTrackCanvas();

        ctx.save();
        // Apply Zoom and Camera Transform
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        // 4. Skid marks — two stroked polylines (perp offset from stored heading); cheap vs hundreds of setTransform+fillRect.
        if (this.skidMarks.length > 0) {
            const startIdx = this.frameSkip > 0 ? Math.max(0, this.skidMarks.length - 50) : 0;
            const len = this.skidMarks.length;
            const tw = 0.17;
            const z = this.zoom;

            ctx.save();
            ctx.strokeStyle = CONFIG.skidColor;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(3.4, 4.2 / z);

            const m0 = this.skidMarks.get(startIdx);
            ctx.beginPath();
            ctx.moveTo((m0.x - m0.sin * tw) * gs, (m0.y + m0.cos * tw) * gs);
            for (let i = startIdx + 1; i < len; i++) {
                const prev = this.skidMarks.get(i - 1);
                const m = this.skidMarks.get(i);
                const dx = m.x - prev.x;
                const dy = m.y - prev.y;
                const lx = (m.x - m.sin * tw) * gs;
                const ly = (m.y + m.cos * tw) * gs;
                if (dx * dx + dy * dy > SKID_GAP_BREAK_DIST_SQ) ctx.moveTo(lx, ly);
                else ctx.lineTo(lx, ly);
            }
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo((m0.x + m0.sin * tw) * gs, (m0.y - m0.cos * tw) * gs);
            for (let i = startIdx + 1; i < len; i++) {
                const prev = this.skidMarks.get(i - 1);
                const m = this.skidMarks.get(i);
                const dx = m.x - prev.x;
                const dy = m.y - prev.y;
                const rx = (m.x + m.sin * tw) * gs;
                const ry = (m.y - m.cos * tw) * gs;
                if (dx * dx + dy * dy > SKID_GAP_BREAK_DIST_SQ) ctx.moveTo(rx, ry);
                else ctx.lineTo(rx, ry);
            }
            ctx.stroke();
            ctx.restore();
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

        // 8. Particles — batch by color + quantized alpha to cut fill() calls
        if (this.particles.length > 0) {
            const buckets = new Map();
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];
                const rawA = p.maxLife > 0 ? p.life / p.maxLife : 0;
                const aQ = Math.round(rawA * 12) / 12;
                const key = `${p.color}\0${aQ}`;
                let list = buckets.get(key);
                if (!list) {
                    list = [];
                    buckets.set(key, list);
                }
                list.push(p);
            }
            for (const [key, list] of buckets) {
                const sep = key.indexOf('\0');
                const color = key.slice(0, sep);
                const alpha = Number(key.slice(sep + 1));
                ctx.fillStyle = color;
                ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                ctx.beginPath();
                for (let j = 0; j < list.length; j++) {
                    const p = list[j];
                    const px = p.x * gs;
                    const py = p.y * gs;
                    ctx.moveTo(px + p.size, py);
                    ctx.arc(px, py, p.size, 0, Math.PI * 2);
                }
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }

        // 9. Player F1 Car (use interpolated position/angle)
        const px = displayPos.x * gs;
        const py = displayPos.y * gs;
        const rcsState = updateSpaceRcsState(this, dt);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(displayAngle);

        const scale = 1.0;
        const drawWidth = this.carSpriteDrawWidth * scale;
        const drawHeight = this.carSpriteDrawHeight * scale;
        const activeCarSpriteAssetName = this.carSpriteAssetKey
            || (typeof this.getSelectedCarAssetName === 'function' ? this.getSelectedCarAssetName() : null);
        const carSpriteEffects = resolveCarSpriteEffects(activeCarSpriteAssetName);
        drawSpaceWarpEffect(ctx, {
            shipEffects: carSpriteEffects,
            speed: this.cachedSpeed,
            drawWidth,
            drawHeight,
            steering: rcsState.steeringCommand,
            steeringBurst: rcsState.steeringBurst,
            time: this.currentTime
        });
        ctx.drawImage(this.carSprite, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

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

            const avgFrameTime = this.frameTimeTotal / this.frameTimeHistory.length;
            if (this.frameSkip) {
                if (avgFrameTime < FRAME_SKIP_EXIT_MS) this.frameSkip = 0;
            } else if (avgFrameTime > FRAME_SKIP_ENTER_MS) {
                this.frameSkip = 1;
            }

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
