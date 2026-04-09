import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from '../modes.js?v=1.36';
import { TRACKS } from '../tracks.js?v=1.36';

const PLAYER_ID_STORAGE_KEY = 'VectorGpScoreboardPlayerId';
const DEFAULT_SUBMIT_FUNCTION_NAME = 'scoreboard-submit';
const MIN_SCOREBOARD_TIME = 2.0;
const MAX_SCOREBOARD_TIME = 60 * 60;
const DEFAULT_SCOREBOARD_LIMIT = 10;
const MAX_SCOREBOARD_LIMIT = 100;
const DEFAULT_SCOREBOARD_PREVIEW_LIMIT = 10;
const SCOREBOARD_TOP_SEGMENT_LIMIT = 5;
const SCOREBOARD_PLAYER_WINDOW_RADIUS = 2;
/** Same-key concurrent callers share one network round-trip (defense in depth vs duplicate UI/engine paths). */
const inflightScoreboardSnapshots = new Map();

function getScoreboardConfig() {
    const rawConfig = typeof window !== 'undefined' && window.VECTORGP_SCOREBOARD_CONFIG
        ? window.VECTORGP_SCOREBOARD_CONFIG
        : null;

    if (!rawConfig || typeof rawConfig !== 'object') {
        return null;
    }

    const supabaseUrl = typeof rawConfig.supabaseUrl === 'string'
        ? rawConfig.supabaseUrl.trim().replace(/\/+$/, '')
        : '';
    const supabaseAnonKey = typeof rawConfig.supabaseAnonKey === 'string'
        ? rawConfig.supabaseAnonKey.trim()
        : '';
    const submitFunctionName = typeof rawConfig.submitFunctionName === 'string' && rawConfig.submitFunctionName.trim()
        ? rawConfig.submitFunctionName.trim()
        : DEFAULT_SUBMIT_FUNCTION_NAME;

    if (!supabaseUrl || !supabaseAnonKey) {
        return null;
    }

    const useSnapshotRpc = rawConfig.useScoreboardSnapshotRpc !== false;
    const snapshotRpcName = typeof rawConfig.snapshotRpcName === 'string' && rawConfig.snapshotRpcName.trim()
        ? rawConfig.snapshotRpcName.trim()
        : 'get_scoreboard_snapshot';

    return {
        submitUrl: `${supabaseUrl}/functions/v1/${submitFunctionName}`,
        scoresUrl: `${supabaseUrl}/rest/v1/scoreboard_best_times`,
        restV1Url: `${supabaseUrl}/rest/v1`,
        supabaseAnonKey,
        useScoreboardSnapshotRpc: useSnapshotRpc,
        snapshotRpcName
    };
}

function createPlayerId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    const randomHex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
    return `${randomHex()}${randomHex()}-${randomHex()}-4${randomHex().slice(1)}-a${randomHex().slice(1)}-${randomHex()}${randomHex()}${randomHex()}`;
}

function getOrCreatePlayerId() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return createPlayerId();
    }

    try {
        const storedId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
        if (storedId) return storedId;

        const nextId = createPlayerId();
        window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, nextId);
        return nextId;
    } catch (error) {
        console.error('Error accessing scoreboard player id:', error);
        return createPlayerId();
    }
}

function isValidScoreboardMode(mode) {
    return mode === TRACK_MODE_STANDARD || mode === TRACK_MODE_PRACTICE;
}

function isValidScoreboardBestTime(bestTime) {
    return Number.isFinite(bestTime)
        && bestTime >= MIN_SCOREBOARD_TIME
        && bestTime <= MAX_SCOREBOARD_TIME;
}

function getScoreboardHeaders(config, extraHeaders = {}) {
    return {
        'apikey': config.supabaseAnonKey,
        ...extraHeaders
    };
}

function parseTotalCount(contentRange) {
    if (typeof contentRange !== 'string') return 0;
    const totalPart = contentRange.split('/')[1];
    const totalCount = Number(totalPart);
    return Number.isFinite(totalCount) ? totalCount : 0;
}

async function fetchScoreboardRows(config, queryParams, { count = false } = {}) {
    const headers = getScoreboardHeaders(
        config,
        count ? { 'Prefer': 'count=exact' } : {}
    );
    const response = await fetch(`${config.scoresUrl}?${queryParams.toString()}`, {
        method: 'GET',
        headers
    });

    if (!response.ok) {
        throw new Error(`Scoreboard fetch failed: ${response.status}`);
    }

    const rows = await response.json();
    return {
        rows: Array.isArray(rows) ? rows : [],
        totalCount: parseTotalCount(response.headers.get('content-range'))
    };
}

function mapScoreboardRow(row, rank = null) {
    const bestTimeMs = Number(row?.best_time_ms);
    const playerId = typeof row?.player_id === 'string' ? row.player_id : '';
    if (!Number.isFinite(bestTimeMs) || !playerId) return null;

    return {
        rank,
        rankLabel: null,
        playerId,
        bestTime: bestTimeMs / 1000,
        bestTimeMs,
        updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : null,
        isCurrentPlayer: false
    };
}

function formatPlayerRankLabel(playerRank) {
    if (!Number.isFinite(playerRank) || playerRank < 1) {
        return null;
    }
    return `#${playerRank}`;
}

function createScoreboardRowsQuery(trackKey, mode, { limit, offset = 0, select = 'player_id,best_time_ms,updated_at' } = {}) {
    const query = new URLSearchParams({
        track_key: `eq.${trackKey}`,
        mode: `eq.${mode}`,
        select,
        order: 'best_time_ms.asc,updated_at.asc,player_id.asc',
        limit: String(limit)
    });
    if (Number.isFinite(offset) && offset > 0) {
        query.set('offset', String(Math.trunc(offset)));
    }
    return query;
}

/** PostgREST string literal for filter atoms that need quoting (timestamps, UUIDs, etc.). */
function postgrestQuotedFilterValue(value) {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * One count query for rows strictly before this player in leaderboard order
 * (best_time_ms asc, updated_at asc, player_id asc). Replaces three parallel count requests.
 */
function createStrictlyBeforePlayerCountQuery(trackKey, mode, row) {
    const t = row.bestTimeMs;
    const tk = postgrestQuotedFilterValue(trackKey);
    const u = postgrestQuotedFilterValue(row.updatedAt);
    const p = postgrestQuotedFilterValue(row.playerId);
    const orBranches = [
        `best_time_ms.lt.${t}`,
        `and(best_time_ms.eq.${t},updated_at.lt.${u})`,
        `and(best_time_ms.eq.${t},updated_at.eq.${u},player_id.lt.${p})`
    ].join(',');
    const andExpr = `(track_key.eq.${tk},mode.eq.${mode},or(${orBranches}))`;
    return new URLSearchParams({
        and: andExpr,
        select: 'player_id',
        limit: '1'
    });
}

async function fetchCurrentPlayerRankLegacy(config, trackKey, mode, currentPlayerRow) {
    const createCountQuery = (extraParams = {}) => new URLSearchParams({
        track_key: `eq.${trackKey}`,
        mode: `eq.${mode}`,
        select: 'player_id',
        limit: '1',
        ...extraParams
    });

    const [
        fasterRowsResult,
        sameTimeEarlierRowsResult,
        sameMomentEarlierPlayerResult
    ] = await Promise.all([
        fetchScoreboardRows(
            config,
            createCountQuery({
                best_time_ms: `lt.${currentPlayerRow.bestTimeMs}`
            }),
            { count: true }
        ),
        fetchScoreboardRows(
            config,
            createCountQuery({
                best_time_ms: `eq.${currentPlayerRow.bestTimeMs}`,
                updated_at: `lt.${currentPlayerRow.updatedAt}`
            }),
            { count: true }
        ),
        fetchScoreboardRows(
            config,
            createCountQuery({
                best_time_ms: `eq.${currentPlayerRow.bestTimeMs}`,
                updated_at: `eq.${currentPlayerRow.updatedAt}`,
                player_id: `lt.${currentPlayerRow.playerId}`
            }),
            { count: true }
        )
    ]);

    const fasterCount = Number(fasterRowsResult?.totalCount) || 0;
    const sameTimeEarlierCount = Number(sameTimeEarlierRowsResult?.totalCount) || 0;
    const sameMomentEarlierCount = Number(sameMomentEarlierPlayerResult?.totalCount) || 0;
    return fasterCount + sameTimeEarlierCount + sameMomentEarlierCount + 1;
}

async function fetchCurrentPlayerRank(config, trackKey, mode, currentPlayerRow) {
    if (
        !config
        || !TRACKS[trackKey]
        || !isValidScoreboardMode(mode)
        || !currentPlayerRow
        || !Number.isFinite(currentPlayerRow.bestTimeMs)
        || typeof currentPlayerRow.updatedAt !== 'string'
        || !currentPlayerRow.updatedAt
        || typeof currentPlayerRow.playerId !== 'string'
        || !currentPlayerRow.playerId
    ) {
        return null;
    }

    try {
        const query = createStrictlyBeforePlayerCountQuery(trackKey, mode, currentPlayerRow);
        const { totalCount } = await fetchScoreboardRows(config, query, { count: true });
        return (Number(totalCount) || 0) + 1;
    } catch (error) {
        console.warn('Scoreboard compound rank query failed, using split counts:', error);
        return fetchCurrentPlayerRankLegacy(config, trackKey, mode, currentPlayerRow);
    }
}

function normalizeScoreboardRpcPayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
        topRows: Array.isArray(raw.topRows) ? raw.topRows : [],
        nearbyRows: Array.isArray(raw.nearbyRows) ? raw.nearbyRows : [],
        currentPlayerRow: raw.currentPlayerRow && typeof raw.currentPlayerRow === 'object'
            ? raw.currentPlayerRow
            : null,
        totalCount: Number(raw.totalCount) || 0,
        playerRank: raw.playerRank != null && Number.isFinite(Number(raw.playerRank))
            ? Number(raw.playerRank)
            : null,
        playerRankLabel: raw.playerRankLabel != null ? String(raw.playerRankLabel) : null
    };
}

async function fetchScoreboardSnapshotRpc(config, trackKey, mode, playerId, safeLimit) {
    const name = config.snapshotRpcName || 'get_scoreboard_snapshot';
    const response = await fetch(`${config.restV1Url}/rpc/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: {
            ...getScoreboardHeaders(config),
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            p_track_key: trackKey,
            p_mode: mode,
            p_player_id: playerId,
            p_limit: safeLimit
        })
    });
    if (!response.ok) {
        const err = new Error(`Scoreboard RPC failed: ${response.status}`);
        err.status = response.status;
        throw err;
    }
    const data = await response.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') return null;
    return row[name] !== undefined ? row[name] : row;
}

async function loadScoreboardSnapshotViaRest(config, trackKey, mode, safeLimit, currentPlayerId) {
        const topQuery = createScoreboardRowsQuery(trackKey, mode, { limit: safeLimit });
        const { rows: topRowsRaw, totalCount: boardTotalCount } = await fetchScoreboardRows(
            config,
            topQuery,
            { count: true }
        );
        const totalCount = Number(boardTotalCount) || 0;

        const topRows = topRowsRaw
            .map((row, index) => {
                const mappedRow = mapScoreboardRow(row, index + 1);
                if (!mappedRow) return null;
                mappedRow.isCurrentPlayer = mappedRow.playerId === currentPlayerId;
                return mappedRow;
            })
            .filter(Boolean);

        const playerInTop = topRows.find((row) => row.playerId === currentPlayerId);
        if (playerInTop) {
            const currentPlayerRow = { ...playerInTop, isCurrentPlayer: true };
            return {
                topRows,
                nearbyRows: [],
                currentPlayerRow,
                totalCount,
                playerRank: playerInTop.rank,
                playerRankLabel: formatPlayerRankLabel(playerInTop.rank)
            };
        }

        const ownQuery = new URLSearchParams({
            player_id: `eq.${currentPlayerId}`,
            track_key: `eq.${trackKey}`,
            mode: `eq.${mode}`,
            select: 'player_id,best_time_ms,updated_at',
            limit: '1'
        });
        const { rows: ownRows } = await fetchScoreboardRows(config, ownQuery);

        const currentPlayerRow = mapScoreboardRow(ownRows[0], null);
        if (!currentPlayerRow) {
            return {
                topRows,
                nearbyRows: [],
                currentPlayerRow: null,
                totalCount,
                playerRank: null,
                playerRankLabel: null
            };
        }

        currentPlayerRow.isCurrentPlayer = true;

        const currentPlayerRank = await fetchCurrentPlayerRank(config, trackKey, mode, currentPlayerRow);
        if (currentPlayerRank) {
            currentPlayerRow.rank = currentPlayerRank;
            currentPlayerRow.rankLabel = formatPlayerRankLabel(currentPlayerRank);
        }

        let nearbyRows = [];
        if (Number.isFinite(currentPlayerRow.rank) && currentPlayerRow.rank > safeLimit) {
            const nearbyOffset = Math.max(0, currentPlayerRow.rank - SCOREBOARD_PLAYER_WINDOW_RADIUS - 1);
            const nearbyLimit = (SCOREBOARD_PLAYER_WINDOW_RADIUS * 2) + 1;
            const nearbyQuery = createScoreboardRowsQuery(trackKey, mode, {
                limit: nearbyLimit,
                offset: nearbyOffset
            });
            const { rows: nearbyRowsRaw } = await fetchScoreboardRows(config, nearbyQuery);
            nearbyRows = nearbyRowsRaw
                .map((row, index) => {
                    const mappedRow = mapScoreboardRow(row, nearbyOffset + index + 1);
                    if (!mappedRow) return null;
                    mappedRow.isCurrentPlayer = mappedRow.playerId === currentPlayerId;
                    return mappedRow;
                })
                .filter(Boolean);
        }

        return {
            topRows: Number.isFinite(currentPlayerRow.rank) && currentPlayerRow.rank > safeLimit
                ? topRows.slice(0, SCOREBOARD_TOP_SEGMENT_LIMIT)
                : topRows,
            nearbyRows,
            currentPlayerRow,
            totalCount,
            playerRank: currentPlayerRow.rank,
            playerRankLabel: currentPlayerRow.rankLabel
        };
}

export async function submitScoreboardBestTime({ trackKey, mode, bestTime, replay } = {}) {
    const config = getScoreboardConfig();
    if (!config || typeof fetch !== 'function') return null;
    if (
        !TRACKS[trackKey]
        || !isValidScoreboardMode(mode)
        || !isValidScoreboardBestTime(bestTime)
        || !replay
    ) {
        return null;
    }

    const response = await fetch(config.submitUrl, {
        method: 'POST',
        headers: {
            ...getScoreboardHeaders(config),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            playerId: getOrCreatePlayerId(),
            trackKey,
            mode,
            bestTime,
            replay
        })
    });

    if (!response.ok) {
        throw new Error(`Scoreboard submission failed: ${response.status}`);
    }

    return response.json().catch(() => null);
}

export async function getScoreboardBestTimes({ trackKey, mode, limit = DEFAULT_SCOREBOARD_LIMIT } = {}) {
    const config = getScoreboardConfig();
    if (!config || typeof fetch !== 'function') return [];
    if (!TRACKS[trackKey] || !isValidScoreboardMode(mode)) return [];

    const safeLimit = Number.isFinite(limit)
        ? Math.min(Math.max(Math.trunc(limit), 1), MAX_SCOREBOARD_LIMIT)
        : DEFAULT_SCOREBOARD_LIMIT;
    const query = createScoreboardRowsQuery(trackKey, mode, { limit: safeLimit });
    const currentPlayerId = getOrCreatePlayerId();
    const { rows } = await fetchScoreboardRows(config, query);

    return rows
        .map((row, index) => {
            const mappedRow = mapScoreboardRow(row, index + 1);
            if (!mappedRow) return null;
            mappedRow.isCurrentPlayer = mappedRow.playerId === currentPlayerId;
            return mappedRow;
        })
        .filter(Boolean);
}

export async function getScoreboardSnapshot({ trackKey, mode, limit = DEFAULT_SCOREBOARD_PREVIEW_LIMIT } = {}) {
    const emptySnapshot = () => ({
        topRows: [],
        nearbyRows: [],
        currentPlayerRow: null,
        totalCount: 0,
        playerRank: null,
        playerRankLabel: null
    });

    const config = getScoreboardConfig();
    if (!config || typeof fetch !== 'function') {
        return emptySnapshot();
    }
    if (!TRACKS[trackKey] || !isValidScoreboardMode(mode)) {
        return emptySnapshot();
    }

    const safeLimit = Number.isFinite(limit)
        ? Math.min(Math.max(Math.trunc(limit), 1), MAX_SCOREBOARD_LIMIT)
        : DEFAULT_SCOREBOARD_PREVIEW_LIMIT;
    const dedupeKey = `${trackKey}\u0000${mode}\u0000${safeLimit}`;
    const inflight = inflightScoreboardSnapshots.get(dedupeKey);
    if (inflight) return inflight;

    const promise = (async () => {
        const currentPlayerId = getOrCreatePlayerId();

        if (config.useScoreboardSnapshotRpc !== false && config.restV1Url) {
            try {
                const raw = await fetchScoreboardSnapshotRpc(
                    config,
                    trackKey,
                    mode,
                    currentPlayerId,
                    safeLimit
                );
                const normalized = normalizeScoreboardRpcPayload(raw);
                if (normalized) {
                    return normalized;
                }
            } catch (error) {
                console.warn('Scoreboard snapshot RPC unavailable, using REST:', error);
            }
        }

        return loadScoreboardSnapshotViaRest(config, trackKey, mode, safeLimit, currentPlayerId);
    })();

    inflightScoreboardSnapshots.set(dedupeKey, promise);
    promise.finally(() => {
        if (inflightScoreboardSnapshots.get(dedupeKey) === promise) {
            inflightScoreboardSnapshots.delete(dedupeKey);
        }
    });
    return promise;
}
