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
const SCOREBOARD_RANK_BUCKETS = [
    { cutoffField: 'top_25_ms', maxRank: 25, label: 'Top 25' },
    { cutoffField: 'top_50_ms', maxRank: 50, label: 'Top 50' },
    { cutoffField: 'top_100_ms', maxRank: 100, label: 'Top 100' },
    { cutoffField: 'top_500_ms', maxRank: 500, label: 'Top 500' },
    { cutoffField: 'top_1000_ms', maxRank: 1000, label: 'Top 1000' }
];

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

    return {
        submitUrl: `${supabaseUrl}/functions/v1/${submitFunctionName}`,
        scoresUrl: `${supabaseUrl}/rest/v1/scoreboard_best_times`,
        rankBucketsUrl: `${supabaseUrl}/rest/v1/scoreboard_rank_buckets`,
        supabaseAnonKey
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

async function fetchScoreboardRankBuckets(config, trackKey, mode) {
    const query = new URLSearchParams({
        track_key: `eq.${trackKey}`,
        mode: `eq.${mode}`,
        select: 'top_25_ms,top_50_ms,top_100_ms,top_500_ms,top_1000_ms,sample_count',
        limit: '1'
    });
    const response = await fetch(`${config.rankBucketsUrl}?${query.toString()}`, {
        method: 'GET',
        headers: getScoreboardHeaders(config)
    });

    if (!response.ok) {
        throw new Error(`Scoreboard rank bucket fetch failed: ${response.status}`);
    }

    const rows = await response.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
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

function formatPlayerRankBucketLabel(rankBucketRow, bestTimeMs) {
    if (!rankBucketRow || !Number.isFinite(bestTimeMs)) return null;

    const sampleCount = Number(rankBucketRow.sample_count);
    for (const rankBucket of SCOREBOARD_RANK_BUCKETS) {
        const cutoffMs = Number(rankBucketRow[rankBucket.cutoffField]);
        if (Number.isFinite(cutoffMs) && bestTimeMs <= cutoffMs) {
            return rankBucket.label;
        }
        if (!Number.isFinite(cutoffMs) && Number.isFinite(sampleCount) && sampleCount > 0 && sampleCount <= rankBucket.maxRank) {
            return rankBucket.label;
        }
    }

    return Number.isFinite(sampleCount) && sampleCount > 0 ? '1000+' : null;
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
    const config = getScoreboardConfig();
    if (!config || typeof fetch !== 'function') {
        return {
            topRows: [],
            nearbyRows: [],
            currentPlayerRow: null,
            totalCount: 0,
            playerRank: null,
            playerRankLabel: null
        };
    }
    if (!TRACKS[trackKey] || !isValidScoreboardMode(mode)) {
        return {
            topRows: [],
            nearbyRows: [],
            currentPlayerRow: null,
            totalCount: 0,
            playerRank: null,
            playerRankLabel: null
        };
    }

    const currentPlayerId = getOrCreatePlayerId();
    const safeLimit = Number.isFinite(limit)
        ? Math.min(Math.max(Math.trunc(limit), 1), MAX_SCOREBOARD_LIMIT)
        : DEFAULT_SCOREBOARD_PREVIEW_LIMIT;

    const topQuery = createScoreboardRowsQuery(trackKey, mode, { limit: safeLimit });
    const ownQuery = new URLSearchParams({
        player_id: `eq.${currentPlayerId}`,
        track_key: `eq.${trackKey}`,
        mode: `eq.${mode}`,
        select: 'player_id,best_time_ms,updated_at',
        limit: '1'
    });

    const [{ rows: topRowsRaw }, { rows: ownRows }, rankBucketRow] = await Promise.all([
        fetchScoreboardRows(config, topQuery),
        fetchScoreboardRows(config, ownQuery),
        fetchScoreboardRankBuckets(config, trackKey, mode)
    ]);

    const topRows = topRowsRaw
        .map((row, index) => {
            const mappedRow = mapScoreboardRow(row, index + 1);
            if (!mappedRow) return null;
            mappedRow.isCurrentPlayer = mappedRow.playerId === currentPlayerId;
            return mappedRow;
        })
        .filter(Boolean);

    const currentPlayerRow = mapScoreboardRow(ownRows[0], null);
    if (!currentPlayerRow) {
        return {
            topRows,
            nearbyRows: [],
            currentPlayerRow: null,
            totalCount: Number(rankBucketRow?.sample_count) || 0,
            playerRank: null,
            playerRankLabel: null
        };
    }

    currentPlayerRow.isCurrentPlayer = true;
    const playerRankInTopRows = topRows.find((row) => row.playerId === currentPlayerId)?.rank;
    if (playerRankInTopRows) {
        currentPlayerRow.rank = playerRankInTopRows;
        return {
            topRows,
            nearbyRows: [],
            currentPlayerRow,
            totalCount: Number(rankBucketRow?.sample_count) || 0,
            playerRank: playerRankInTopRows,
            playerRankLabel: formatPlayerRankLabel(playerRankInTopRows)
        };
    }

    const currentPlayerRank = await fetchCurrentPlayerRank(config, trackKey, mode, currentPlayerRow);
    if (currentPlayerRank) {
        currentPlayerRow.rank = currentPlayerRank;
        currentPlayerRow.rankLabel = formatPlayerRankLabel(currentPlayerRank);
    } else {
        currentPlayerRow.rankLabel = formatPlayerRankBucketLabel(rankBucketRow, currentPlayerRow.bestTimeMs);
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
        totalCount: Number(rankBucketRow?.sample_count) || 0,
        playerRank: currentPlayerRow.rank,
        playerRankLabel: currentPlayerRow.rankLabel
    };
}
