import { CONFIG } from '../config.js?v=1.36';
import { getPhysicsPresetForConfig } from '../physics-presets.js';
import { TRACKS } from '../tracks.js?v=1.36';
import {
    buildServiceHeaders,
    clampRequestLimit,
    getBaseSupabaseConfig,
    getOrCreatePlayerId,
    unwrapRpcPayload
} from './shared-client.js?v=1.0';

const DEFAULT_DAILY_SUBMIT_FUNCTION_NAME = 'daily-challenge-submit';
const DEFAULT_DAILY_ACTIVE_RPC_NAME = 'get_active_daily_challenge';
const DEFAULT_DAILY_SNAPSHOT_RPC_NAME = 'get_daily_challenge_snapshot';
const MIN_DAILY_TIME = 2.0;
const MAX_DAILY_TIME = 60 * 60;
const DEFAULT_DAILY_LIMIT = 10;
const SPEED_DISPLAY_SCALE = 20;
const PHYSICS_DT = 1 / 60;
const ACTIVE_DAILY_CACHE_KEY = 'VectorGpActiveDailyChallengeCache';

function toCachedActiveChallenge(challenge) {
    if (!challenge || typeof challenge !== 'object') return null;
    if (typeof challenge.id !== 'string' || !challenge.id) return null;
    if (typeof challenge.trackKey !== 'string' || !TRACKS[challenge.trackKey]) return null;

    return {
        id: challenge.id,
        trackKey: challenge.trackKey,
        objectiveType: typeof challenge.objectiveType === 'string' ? challenge.objectiveType : 'single_lap_fastest',
        endsAt: typeof challenge.endsAt === 'string' ? challenge.endsAt : null
    };
}

function readActiveDailyCacheStorable() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
        const raw = window.localStorage.getItem(ACTIVE_DAILY_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        console.error('Error reading active daily challenge cache:', error);
        return null;
    }
}

function clearActiveDailyCacheStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        window.localStorage.removeItem(ACTIVE_DAILY_CACHE_KEY);
    } catch (error) {
        console.error('Error clearing active daily challenge cache:', error);
    }
}

function writeActiveDailyCacheStorable(challenge) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        const cachedChallenge = toCachedActiveChallenge(challenge);
        if (!cachedChallenge) {
            clearActiveDailyCacheStorage();
            return;
        }
        window.localStorage.setItem(
            ACTIVE_DAILY_CACHE_KEY,
            JSON.stringify({ challenge: cachedChallenge })
        );
    } catch (error) {
        console.error('Error writing active daily challenge cache:', error);
    }
}

function isCachedChallengeStillActive(challenge) {
    if (!challenge?.endsAt || typeof challenge.endsAt !== 'string') return false;
    const endsMs = Date.parse(challenge.endsAt);
    if (!Number.isFinite(endsMs)) return false;
    return Date.now() < endsMs;
}

function getValidCachedActiveDailyChallenge() {
    const stored = readActiveDailyCacheStorable();
    if (!stored?.challenge || typeof stored.challenge !== 'object') return null;
    const challenge = normalizeDailyChallenge(stored.challenge);
    if (!challenge || !isCachedChallengeStillActive(challenge)) return null;
    return challenge;
}

function getDailyChallengeConfig() {
    const baseConfig = getBaseSupabaseConfig();
    const rawConfig = baseConfig?.rawConfig || null;
    if (!baseConfig) {
        return null;
    }

    const submitFunctionName = typeof rawConfig.dailySubmitFunctionName === 'string' && rawConfig.dailySubmitFunctionName.trim()
        ? rawConfig.dailySubmitFunctionName.trim()
        : DEFAULT_DAILY_SUBMIT_FUNCTION_NAME;
    const activeRpcName = typeof rawConfig.dailyActiveRpcName === 'string' && rawConfig.dailyActiveRpcName.trim()
        ? rawConfig.dailyActiveRpcName.trim()
        : DEFAULT_DAILY_ACTIVE_RPC_NAME;
    const snapshotRpcName = typeof rawConfig.dailySnapshotRpcName === 'string' && rawConfig.dailySnapshotRpcName.trim()
        ? rawConfig.dailySnapshotRpcName.trim()
        : DEFAULT_DAILY_SNAPSHOT_RPC_NAME;

    return {
        ...baseConfig,
        submitUrl: `${baseConfig.supabaseUrl}/functions/v1/${submitFunctionName}`,
        activeRpcName,
        snapshotRpcName
    };
}

function normalizeDailyChallenge(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.id !== 'string' || !raw.id) return null;
    if (typeof raw.trackKey !== 'string' || !TRACKS[raw.trackKey]) return null;

    return {
        id: raw.id,
        challengeDate: typeof raw.challengeDate === 'string' ? raw.challengeDate : null,
        trackKey: raw.trackKey,
        startsAt: typeof raw.startsAt === 'string' ? raw.startsAt : null,
        endsAt: typeof raw.endsAt === 'string' ? raw.endsAt : null,
        status: typeof raw.status === 'string' ? raw.status : 'active',
        objectiveType: typeof raw.objectiveType === 'string' ? raw.objectiveType : 'single_lap_fastest',
        objectiveParams: raw.objectiveParams && typeof raw.objectiveParams === 'object'
            ? raw.objectiveParams
            : {},
        physicsOverrides: raw.physicsOverrides && typeof raw.physicsOverrides === 'object'
            ? raw.physicsOverrides
            : {}
    };
}

function normalizeSnapshot(raw) {
    if (!raw || typeof raw !== 'object') {
        return {
            topRows: [],
            nearbyRows: [],
            currentPlayerRow: null,
            totalCount: 0,
            objectiveType: null,
            playerRank: null,
            playerRankLabel: null
        };
    }

    return {
        topRows: Array.isArray(raw.topRows) ? raw.topRows : [],
        nearbyRows: Array.isArray(raw.nearbyRows) ? raw.nearbyRows : [],
        currentPlayerRow: raw.currentPlayerRow && typeof raw.currentPlayerRow === 'object'
            ? raw.currentPlayerRow
            : null,
        totalCount: Number(raw.totalCount) || 0,
        objectiveType: typeof raw.objectiveType === 'string' ? raw.objectiveType : null,
        playerRank: raw.playerRank != null && Number.isFinite(Number(raw.playerRank))
            ? Number(raw.playerRank)
            : null,
        playerRankLabel: raw.playerRankLabel != null ? String(raw.playerRankLabel) : null
    };
}

function getObjectiveRequiredLaps(challenge) {
    if (challenge?.objectiveType === 'multi_lap_total') {
        return Math.max(2, Math.trunc(challenge.objectiveParams?.lapCount || 2));
    }
    return 1;
}

export function isCrashBudgetDailyChallenge(challenge) {
    return challenge?.objectiveType === 'finish_with_crash_budget';
}

export function getDailyChallengeTrackName(challenge) {
    return TRACKS[challenge?.trackKey]?.name || 'Unknown Track';
}

export function getDailyChallengeObjectiveLabel(challenge) {
    if (!challenge) return 'Daily Challenge';

    if (challenge.objectiveType === 'multi_lap_total') {
        return `${getObjectiveRequiredLaps(challenge)} laps`;
    }

    if (isCrashBudgetDailyChallenge(challenge)) {
        const maxCrashes = Math.max(0, Math.trunc(challenge.objectiveParams?.maxCrashes || 0));
        return `Most laps before ${maxCrashes} crash${maxCrashes === 1 ? '' : 'es'}`;
    }

    return '1 lap';
}

/** Short line for the mode-select Daily GP row (track name • …). */
export function getDailyChallengeModeSelectObjectiveLine(challenge) {
    return getDailyChallengeCopyLabels(challenge).modeSelectLine;
}

export function getDailyChallengeCopyLabels(challenge) {
    const objectiveType = challenge?.objectiveType || 'single_lap_fastest';

    if (objectiveType === 'finish_with_crash_budget') {
        return {
            hudPrimaryLabel: 'LAPS',
            primaryStatLabel: 'Laps',
            bestSummaryLabel: 'Best Laps',
            modeSelectLine: 'Most laps'
        };
    }

    if (objectiveType === 'multi_lap_total') {
        return {
            hudPrimaryLabel: 'RACE',
            primaryStatLabel: 'Race Time',
            bestSummaryLabel: 'Best Race',
            modeSelectLine: 'Best race time'
        };
    }

    return {
        hudPrimaryLabel: 'LAP',
        primaryStatLabel: 'Lap Time',
        bestSummaryLabel: 'Best Lap',
        modeSelectLine: 'Best lap time'
    };
}

export function formatDailyChallengeResultLabel(challenge, result) {
    if (!result || typeof result !== 'object') {
        return '--';
    }
    const bestTime = Number.isFinite(result?.bestTime) ? Number(result.bestTime) : null;
    if (isCrashBudgetDailyChallenge(challenge)) {
        const completedLaps = Math.max(0, Math.trunc(result?.completedLaps || 0));
        if (completedLaps <= 0) {
            return '--';
        }
        return `${completedLaps} lap${completedLaps === 1 ? '' : 's'}`;
    }

    return bestTime !== null ? `${bestTime.toFixed(2)}s` : '--';
}

export function getDailyChallengeModifierBadges(challenge) {
    if (!challenge?.physicsOverrides || typeof challenge.physicsOverrides !== 'object') {
        return ['Stock'];
    }

    const preset = getPhysicsPresetForConfig(challenge.physicsOverrides);
    if (preset) {
        return [preset.label];
    }

    const estimateTopSpeedKph = (accel, friction) => {
        let speed = 0;
        for (let frame = 0; frame < 1200; frame += 1) {
            speed = (speed + accel * PHYSICS_DT) * friction;
        }
        return Math.round(speed * SPEED_DISPLAY_SCALE);
    };

    const estimateTimeToTargetKph = (accel, friction, targetKph) => {
        const targetSpeed = targetKph / SPEED_DISPLAY_SCALE;
        let speed = 0;
        for (let frame = 1; frame <= 1200; frame += 1) {
            speed = (speed + accel * PHYSICS_DT) * friction;
            if (speed >= targetSpeed) {
                return `${(frame * PHYSICS_DT).toFixed(1)}s`;
            }
        }
        return null;
    };

    const formatPercentDelta = (value, baseValue) => {
        const delta = ((Number(value) - Number(baseValue)) / Number(baseValue)) * 100;
        const rounded = Math.round(delta);
        return `${rounded > 0 ? '+' : ''}${rounded}%`;
    };

    const badges = [];
    const tunedAccel = Number.isFinite(challenge.physicsOverrides.accel)
        ? Number(challenge.physicsOverrides.accel)
        : CONFIG.accel;
    const tunedFriction = Number.isFinite(challenge.physicsOverrides.friction)
        ? Number(challenge.physicsOverrides.friction)
        : CONFIG.friction;
    if (
        Number.isFinite(challenge.physicsOverrides.accel)
        || Number.isFinite(challenge.physicsOverrides.friction)
    ) {
        badges.push(`${estimateTopSpeedKph(tunedAccel, tunedFriction)} kph`);
        const zeroToTwoHundred = estimateTimeToTargetKph(tunedAccel, tunedFriction, 200);
        if (zeroToTwoHundred) {
            badges.push(`0-200 ${zeroToTwoHundred}`);
        }
    }
    if (Number.isFinite(challenge.physicsOverrides.turnSpeed)) {
        badges.push(`Steering ${formatPercentDelta(challenge.physicsOverrides.turnSpeed, CONFIG.turnSpeed)}`);
    }

    return badges.length ? badges : ['Stock'];
}

export function getDailyChallengeModifierLabel(challenge) {
    return getDailyChallengeModifierBadges(challenge).join(' • ');
}

export function getDailyChallengeRequiredLaps(challenge) {
    return getObjectiveRequiredLaps(challenge);
}

export function getDailyChallengeMaxCrashes(challenge) {
    if (challenge?.objectiveType !== 'finish_with_crash_budget') return null;
    return Math.max(0, Math.trunc(challenge.objectiveParams?.maxCrashes || 0));
}

export async function getActiveDailyChallenge() {
    const cachedChallenge = getValidCachedActiveDailyChallenge();

    const config = getDailyChallengeConfig();
    if (!config || typeof fetch !== 'function') return cachedChallenge;

    try {
        const response = await fetch(`${config.restV1Url}/rpc/${encodeURIComponent(config.activeRpcName)}`, {
            method: 'POST',
            headers: {
                ...buildServiceHeaders(config),
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({})
        });

        if (!response.ok) {
            throw new Error(`Active daily challenge fetch failed: ${response.status}`);
        }

        const challenge = normalizeDailyChallenge(unwrapRpcPayload(await response.json(), config.activeRpcName));
        if (challenge) {
            writeActiveDailyCacheStorable(challenge);
        } else {
            clearActiveDailyCacheStorage();
        }

        return challenge;
    } catch (error) {
        if (cachedChallenge) {
            return cachedChallenge;
        }
        throw error;
    }
}

export async function getDailyChallengeSnapshot({ challengeId, limit = DEFAULT_DAILY_LIMIT } = {}) {
    const config = getDailyChallengeConfig();
    if (!config || typeof fetch !== 'function' || !challengeId) {
        return normalizeSnapshot(null);
    }

    const safeLimit = clampRequestLimit(limit, { defaultLimit: DEFAULT_DAILY_LIMIT });
    const response = await fetch(`${config.restV1Url}/rpc/${encodeURIComponent(config.snapshotRpcName)}`, {
        method: 'POST',
        headers: {
            ...buildServiceHeaders(config),
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            p_challenge_id: challengeId,
            p_player_id: getOrCreatePlayerId('daily challenge'),
            p_limit: safeLimit
        })
    });

    if (!response.ok) {
        throw new Error(`Daily challenge snapshot fetch failed: ${response.status}`);
    }

    const snapshot = normalizeSnapshot(unwrapRpcPayload(await response.json(), config.snapshotRpcName));
    return snapshot;
}

export async function submitDailyChallengeBestTime({ challengeId, bestTime, replay } = {}) {
    const config = getDailyChallengeConfig();
    if (!config || typeof fetch !== 'function') return null;
    if (
        typeof challengeId !== 'string'
        || !challengeId
        || !Number.isFinite(bestTime)
        || bestTime < MIN_DAILY_TIME
        || bestTime > MAX_DAILY_TIME
        || !replay
    ) {
        return null;
    }

    const response = await fetch(config.submitUrl, {
        method: 'POST',
        headers: {
            ...buildServiceHeaders(config),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            playerId: getOrCreatePlayerId('daily challenge'),
            challengeId,
            bestTime,
            replay
        })
    });

    return {
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => null)
    };
}
