const PLAYER_ID_STORAGE_KEY = 'VectorGpScoreboardPlayerId';

function getRawScoreboardConfig() {
    return typeof window !== 'undefined' && window.VECTORGP_SCOREBOARD_CONFIG
        ? window.VECTORGP_SCOREBOARD_CONFIG
        : null;
}

export function getBaseSupabaseConfig() {
    const rawConfig = getRawScoreboardConfig();
    if (!rawConfig || typeof rawConfig !== 'object') {
        return null;
    }

    const supabaseUrl = typeof rawConfig.supabaseUrl === 'string'
        ? rawConfig.supabaseUrl.trim().replace(/\/+$/, '')
        : '';
    const supabaseAnonKey = typeof rawConfig.supabaseAnonKey === 'string'
        ? rawConfig.supabaseAnonKey.trim()
        : '';
    if (!supabaseUrl || !supabaseAnonKey) {
        return null;
    }

    return {
        rawConfig,
        supabaseUrl,
        restV1Url: `${supabaseUrl}/rest/v1`,
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

export function getOrCreatePlayerId(logLabel = 'scoreboard') {
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
        console.error(`Error accessing ${logLabel} player id:`, error);
        return createPlayerId();
    }
}

export function buildServiceHeaders(config, extraHeaders = {}) {
    return {
        'apikey': config.supabaseAnonKey,
        ...extraHeaders
    };
}

export function clampRequestLimit(limit, { defaultLimit, maxLimit = 100 } = {}) {
    if (!Number.isFinite(limit)) {
        return defaultLimit;
    }
    return Math.min(Math.max(Math.trunc(limit), 1), maxLimit);
}

export function unwrapRpcPayload(data, rpcName) {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') return null;
    return row[rpcName] !== undefined ? row[rpcName] : row;
}
