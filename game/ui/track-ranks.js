import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from '../modes.js?v=1.90';
import { getScoreboardSnapshot } from '../services/scoreboard.js?v=1.90';
import { getTrackData, writeTrackCardRankSnapshots } from '../storage.js?v=1.90';
import { TRACKS } from '../tracks.js?v=1.90';
import { getTrackResultNamespace, resolveTrackPreferenceScope } from './track-scope.js?v=1.90';

const TRACK_CARD_RANK_CACHE_MS = 10 * 60 * 1000;
const TRACK_CARD_LEADERBOARD_TOP_LIMIT = 10;
const TRACK_CARD_RANK_PREFETCH_COUNT = 3;

export function getTrackCardRankCacheKey(trackKey, mode, ranked = false) {
    return `${trackKey}:${mode}:${getTrackResultNamespace(ranked)}`;
}

export function getTrackCardRankRequestVersion(cacheKey) {
    return this._returningTrackRankRequestVersions.get(cacheKey) || 0;
}

export function bumpTrackCardRankRequestVersion(cacheKey) {
    const nextVersion = this.getTrackCardRankRequestVersion(cacheKey) + 1;
    this._returningTrackRankRequestVersions.set(cacheKey, nextVersion);
    return nextVersion;
}

export function getTrackCardRankPrefetchKeys(trackKey) {
    const currentIndex = this._returningTrackKeys.indexOf(trackKey);
    if (currentIndex === -1) return [];
    return this._returningTrackKeys.slice(
        currentIndex,
        Math.min(this._returningTrackKeys.length, currentIndex + TRACK_CARD_RANK_PREFETCH_COUNT)
    );
}

export function invalidateReturningTrackRankSnapshot(trackKey, mode, ranked = false) {
    const cacheKey = this.getTrackCardRankCacheKey(trackKey, mode, ranked);
    this._returningTrackRankSnapshots.delete(cacheKey);
    this._pendingReturningTrackRankRequests.delete(cacheKey);
    this.bumpTrackCardRankRequestVersion(cacheKey);
    writeTrackCardRankSnapshots(this._returningTrackRankSnapshots);
}

export function getFreshReturningTrackRankCache(trackKey, mode, ranked = false) {
    const cacheKey = this.getTrackCardRankCacheKey(trackKey, mode, ranked);
    const cached = this._returningTrackRankSnapshots.get(cacheKey);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > TRACK_CARD_RANK_CACHE_MS) {
        this._returningTrackRankSnapshots.delete(cacheKey);
        writeTrackCardRankSnapshots(this._returningTrackRankSnapshots);
        return null;
    }
    return cached;
}

export function setPendingReturningTrackRankSubmission(trackKey, mode, ranked = false, submitPromise = null) {
    const cacheKey = this.getTrackCardRankCacheKey(trackKey, mode, ranked);
    if (!ranked || !submitPromise) {
        this._pendingReturningTrackRankSubmissions.delete(cacheKey);
        return;
    }

    const trackedPromise = Promise.resolve(submitPromise)
        .catch((error) => {
            console.error('Error waiting for track card rank submission:', error);
            return null;
        })
        .finally(() => {
            if (this._pendingReturningTrackRankSubmissions.get(cacheKey) === trackedPromise) {
                this._pendingReturningTrackRankSubmissions.delete(cacheKey);
            }
        });
    this._pendingReturningTrackRankSubmissions.set(cacheKey, trackedPromise);
}

export function getCachedTrackCardRankLabel(trackKey, mode, ranked = false) {
    return this.getFreshReturningTrackRankCache(trackKey, mode, ranked)?.rankLabel || null;
}

export function hasFreshTrackCardRankCache(trackKey, mode, ranked = false) {
    return Boolean(this.getFreshReturningTrackRankCache(trackKey, mode, ranked));
}

export function getCachedTrackCardScoreboardSnapshot(trackKey, mode, ranked = false) {
    return this.getFreshReturningTrackRankCache(trackKey, mode, ranked)?.scoreboardSnapshot || null;
}

export function hasLoadedTrackPersonalBestState(trackKey) {
    return Boolean(trackKey) && this._returningTrackPersonalBests.has(trackKey);
}

export function hasTrackPersonalBest(trackKey, mode, ranked = false) {
    if (!trackKey || !mode || !this.hasLoadedTrackPersonalBestState(trackKey)) return false;

    const personalBestState = this._returningTrackPersonalBests.get(trackKey);
    const namespace = getTrackResultNamespace(ranked);
    const bestTime = personalBestState?.[namespace]?.[mode];
    return bestTime !== null && bestTime !== undefined;
}

export async function requestReturningTrackRankSnapshot(trackKey, mode, ranked = false) {
    if (!trackKey || !TRACKS[trackKey] || !ranked) return null;

    const cacheKey = this.getTrackCardRankCacheKey(trackKey, mode, true);
    const requestVersion = this.getTrackCardRankRequestVersion(cacheKey);
    const pendingRequest = this._pendingReturningTrackRankRequests.get(cacheKey);
    if (pendingRequest && pendingRequest.version === requestVersion) {
        return pendingRequest.promise;
    }

    if (this.hasFreshTrackCardRankCache(trackKey, mode, true)) {
        return this.getCachedTrackCardScoreboardSnapshot(trackKey, mode, true);
    }

    const pendingSubmitPromise = this._pendingReturningTrackRankSubmissions.get(cacheKey) || null;
    const requestPromise = Promise.resolve(pendingSubmitPromise)
        .then(() => getScoreboardSnapshot({
            trackKey,
            mode,
            limit: TRACK_CARD_LEADERBOARD_TOP_LIMIT
        }))
        .then((scoreboardSnapshot) => {
            if (this.getTrackCardRankRequestVersion(cacheKey) !== requestVersion) {
                return scoreboardSnapshot || null;
            }
            this._returningTrackRankSnapshots.set(cacheKey, {
                rankLabel: scoreboardSnapshot?.playerRankLabel || null,
                scoreboardSnapshot: scoreboardSnapshot || null,
                cachedAt: Date.now()
            });
            writeTrackCardRankSnapshots(this._returningTrackRankSnapshots);
            this.refreshReturningTrackPersonalBest(trackKey);
            return scoreboardSnapshot || null;
        })
        .catch((error) => {
            console.error('Error loading track card rank:', error);
            return null;
        })
        .finally(() => {
            const activeRequest = this._pendingReturningTrackRankRequests.get(cacheKey);
            if (activeRequest && activeRequest.version === requestVersion) {
                this._pendingReturningTrackRankRequests.delete(cacheKey);
            }
        });

    this._pendingReturningTrackRankRequests.set(cacheKey, {
        promise: requestPromise,
        version: requestVersion
    });
    return requestPromise;
}

export async function refreshReturningTrackRankSnapshot(trackKey) {
    if (!trackKey || !this._returningTrackCards.has(trackKey)) return;

    const { mode, isRanked } = resolveTrackPreferenceScope(this.getTrackPreferences(trackKey));
    if (!isRanked) {
        this.invalidateReturningTrackRankSnapshot(trackKey, mode, false);
        this.refreshReturningTrackPersonalBest(trackKey);
        return;
    }
    if (!this.hasLoadedTrackPersonalBestState(trackKey)) {
        this.refreshReturningTrackPersonalBest(trackKey);
        return;
    }
    if (!this.hasTrackPersonalBest(trackKey, mode, true)) {
        this.invalidateReturningTrackRankSnapshot(trackKey, mode, true);
        this.refreshReturningTrackPersonalBest(trackKey);
        return;
    }
    if (this.hasFreshTrackCardRankCache(trackKey, mode, true)) {
        this.refreshReturningTrackPersonalBest(trackKey);
        return;
    }

    return this.requestReturningTrackRankSnapshot(trackKey, mode, true);
}

export function updateVisibleTrackRanks(trackKey, { prefetchNeighbors = true } = {}) {
    if (!trackKey) return;
    if (!prefetchNeighbors) {
        this.refreshReturningTrackRankSnapshot(trackKey);
        return;
    }
    this.getTrackCardRankPrefetchKeys(trackKey).forEach((prefetchTrackKey) => {
        this.refreshReturningTrackRankSnapshot(prefetchTrackKey);
    });
}

export async function loadReturningTrackPersonalBests() {
    const trackKeys = this._returningTrackKeys.slice();
    try {
        const trackDataList = await Promise.all(trackKeys.map((trackKey) => getTrackData(trackKey)));
        trackDataList.forEach((trackData, index) => {
            this.updateReturningTrackPersonalBest(
                trackKeys[index],
                trackData.bestTimes?.[TRACK_MODE_STANDARD] ?? null,
                TRACK_MODE_STANDARD,
                false
            );
            this.updateReturningTrackPersonalBest(
                trackKeys[index],
                trackData.bestTimes?.[TRACK_MODE_PRACTICE] ?? null,
                TRACK_MODE_PRACTICE,
                false
            );
            this.updateReturningTrackPersonalBest(
                trackKeys[index],
                trackData.rankedBestTimes?.[TRACK_MODE_STANDARD] ?? null,
                TRACK_MODE_STANDARD,
                true
            );
            this.updateReturningTrackPersonalBest(
                trackKeys[index],
                trackData.rankedBestTimes?.[TRACK_MODE_PRACTICE] ?? null,
                TRACK_MODE_PRACTICE,
                true
            );
        });
        this.updateVisibleTrackRanks(this._selectedReturningTrackKey || this._currentTrackKey || this._returningTrackKeys[0]);
    } catch (error) {
        console.error('Error loading returning-player personal bests:', error);
    }
}

export function refreshAllReturningTrackPersonalBests() {
    this._returningTrackKeys.forEach((trackKey) => {
        this.refreshReturningTrackPersonalBest(trackKey);
    });
}

export function updateReturningTrackPersonalBest(trackKey, bestTime, mode = TRACK_MODE_STANDARD, ranked = false) {
    if (!trackKey || !this._returningTrackCards.has(trackKey)) return;

    const currentBests = this._returningTrackPersonalBests.get(trackKey)
        || this.createEmptyTrackPersonalBestState();
    const namespace = getTrackResultNamespace(ranked);
    const currentBest = currentBests[namespace][mode];
    const nextBest = bestTime !== null && bestTime !== undefined
        ? (currentBest !== null && currentBest !== undefined ? Math.min(currentBest, bestTime) : bestTime)
        : (currentBest !== null && currentBest !== undefined ? currentBest : null);

    this._returningTrackPersonalBests.set(trackKey, {
        ...currentBests,
        [namespace]: {
            ...currentBests[namespace],
            [mode]: nextBest
        }
    });
    this.refreshReturningTrackPersonalBest(trackKey);
}
