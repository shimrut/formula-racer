function hasFiniteValue(value) {
    return value !== null && value !== undefined && Number.isFinite(value);
}

function hasOwnValue(source, key) {
    return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key);
}

export function buildLapRecord(lapNumber, lapTime, previousBestTime = null) {
    return {
        lapNumber,
        time: lapTime,
        deltaVsBest: hasFiniteValue(previousBestTime)
            ? lapTime - previousBestTime
            : null
    };
}

export function pushRecentLap(recentLaps, lapRecord, maxLength = 10) {
    recentLaps.push(lapRecord);
    if (recentLaps.length > maxLength) {
        recentLaps.splice(0, recentLaps.length - maxLength);
    }
    return recentLaps;
}

export function isNewBestResult(policy, candidate, previous) {
    if (!candidate || !policy) return false;

    const candidateTime = hasFiniteValue(candidate.bestTime) ? Number(candidate.bestTime) : null;
    const previousTime = hasFiniteValue(previous?.bestTime) ? Number(previous.bestTime) : null;
    if (policy.bestResultComparator === 'laps-then-time') {
        const candidateLaps = Math.max(0, Math.trunc(candidate.completedLaps || 0));
        const previousLaps = Math.max(0, Math.trunc(previous?.completedLaps || 0));
        if (previousTime === null) return true;
        if (candidateLaps > previousLaps) return true;
        if (candidateLaps < previousLaps) return false;
        return candidateTime !== null && candidateTime > previousTime;
    }

    if (candidateTime === null) return false;
    return previousTime === null || candidateTime < previousTime;
}

export function createModalActions({
    modalKind,
    primaryActionLabel,
    primaryAction,
    primaryActionIcon,
    primaryShortcutLabel = null,
    secondaryActionLabel,
    secondaryAction,
    secondaryActionIcon,
    forceSharePanelVisible = false,
    shareActionLabel = null,
    shareActionIcon = null
} = {}) {
    return {
        modalKind,
        primaryActionLabel,
        primaryAction,
        primaryActionIcon,
        primaryShortcutLabel,
        secondaryActionLabel,
        secondaryAction,
        secondaryActionIcon,
        forceSharePanelVisible,
        shareActionLabel,
        shareActionIcon
    };
}

export function buildModalDeltaDisplay({
    deltaToBest = null,
    emptyText = '--',
    emptyValueClass = ''
} = {}) {
    if (deltaToBest !== null && deltaToBest !== undefined) {
        if (deltaToBest > 0.005) {
            return {
                text: `+${deltaToBest.toFixed(2)}s`,
                valueClass: 'modal-stat-value--delta-positive'
            };
        }
        if (deltaToBest < -0.005) {
            return {
                text: `${deltaToBest.toFixed(2)}s`,
                valueClass: 'modal-stat-value--delta-negative'
            };
        }
        return {
            text: '0.00s',
            valueClass: ''
        };
    }

    return {
        text: emptyText,
        valueClass: emptyValueClass
    };
}

export function buildScoreboardRankDisplay(scoreboardSnapshot, { fallbackText = 'N/A' } = {}) {
    const hasRank = Boolean(scoreboardSnapshot?.playerRankLabel);
    const isLoading = Boolean(scoreboardSnapshot?.isLoading);
    const rawStatusText = typeof scoreboardSnapshot?.statusText === 'string'
        ? scoreboardSnapshot.statusText.trim()
        : '';

    return {
        text: hasRank ? scoreboardSnapshot.playerRankLabel : (isLoading ? '' : fallbackText),
        isLoading,
        statusText: rawStatusText || null
    };
}

export function buildModalStatsPlan(lapData) {
    if (!lapData || typeof lapData !== 'object') return null;

    if (lapData.variant === 'practice-pause') {
        return {
            kind: 'practice-pause',
            display: 'grid',
            hasRuns: null,
            args: [
                lapData.sessionBestTime,
                lapData.practiceBestTime,
                lapData.deltaToBest,
                lapData.isNewBest,
                lapData.scoreboardSnapshot
            ]
        };
    }

    if (lapData.variant === 'daily-crash-budget-pause') {
        return {
            kind: 'left-right',
            display: 'flex',
            hasRuns: null,
            args: [
                `${Math.max(0, Math.trunc(lapData.completedLaps || 0))}`,
                '',
                `${Math.max(0, Math.trunc(lapData.crashesLeft || 0))}`,
                {
                    leftLabel: 'Laps',
                    rightLabel: 'Crashes Left'
                }
            ]
        };
    }

    if (lapData.variant === 'standard-pause') {
        return {
            kind: 'standard-pause',
            display: 'grid',
            hasRuns: null,
            args: [
                lapData.lapTime,
                lapData.deltaToBest,
                lapData.bestTime,
                lapData.primaryStatLabel || 'Lap Time'
            ]
        };
    }

    if (lapData.hideStats) {
        return {
            kind: 'hide',
            display: 'none',
            hasRuns: null,
            args: []
        };
    }

    if (lapData.isCrash) {
        return {
            kind: 'crash',
            display: 'flex',
            hasRuns: '',
            args: ['Impact', `${lapData.impact} KPH`, 'modal-stat-value--crash']
        };
    }

    if (lapData.variant === 'practice') {
        return {
            kind: 'practice',
            display: 'flex',
            hasRuns: lapData.listData ? 'true' : '',
            args: [
                `${lapData.lapCount ?? 0}`,
                '',
                lapData.bestTime !== null && lapData.bestTime !== undefined
                    ? `${lapData.bestTime.toFixed(2)}s`
                    : 'No laps',
                {
                    leftLabel: 'Laps',
                    rightLabel: 'Best'
                }
            ]
        };
    }

    if (lapData.variant === 'daily-crash-budget') {
        return {
            kind: 'daily-crash-budget',
            display: 'grid',
            hasRuns: null,
            args: [
                `${Math.max(0, Math.trunc(lapData.completedLaps || 0))}`,
                lapData.scoreboardSnapshot || null
            ]
        };
    }

    if (lapData.isNewBest) {
        return {
            kind: 'win',
            display: 'grid',
            hasRuns: lapData.lapTimesArray?.length ? 'true' : '',
            args: [
                lapData.lapTime ?? lapData.bestTime,
                null,
                lapData.scoreboardSnapshot || null,
                lapData.primaryStatLabel || 'Lap Time'
            ]
        };
    }

    return {
        kind: 'win',
        display: 'grid',
        hasRuns: lapData.lapTimesArray?.length ? 'true' : '',
        args: [
            lapData.lapTime,
            lapData.lapTime - lapData.bestTime,
            null,
            lapData.primaryStatLabel || 'Lap Time'
        ]
    };
}

export function buildModalRunsPayload(source, {
    currentTrackKey = null,
    updates = null
} = {}) {
    if (!source || typeof source !== 'object') return null;

    const normalized = {
        lapTimesArray: source.listData ?? source.lapTimesArray ?? null,
        bestTime: source.bestTime ?? source.lapTime ?? null,
        currentTime: source.currentTime ?? source.lapTime ?? null,
        scoreboardChallengeId: source.scoreboardChallengeId || null,
        scoreboardTrackKey: source.scoreboardTrackKey || currentTrackKey || null,
        scoreboardSnapshot: source.scoreboardSnapshot ?? null,
        scoreboardMode: source.scoreboardMode || 'standard',
        scoreboardSubhead: source.scoreboardSubhead || null,
        showGlobalLeaderboard: source.showGlobalLeaderboard !== false,
        allowLeaderboardOpen: source.allowLeaderboardOpen !== false
    };

    if (!updates || typeof updates !== 'object') {
        return normalized;
    }

    if (hasOwnValue(updates, 'bestTime') && updates.bestTime !== undefined) {
        normalized.bestTime = updates.bestTime;
    }
    if (hasOwnValue(updates, 'currentTime') && updates.currentTime !== undefined) {
        normalized.currentTime = updates.currentTime;
    }
    if (hasOwnValue(updates, 'lapTimesArray') && updates.lapTimesArray !== undefined) {
        normalized.lapTimesArray = updates.lapTimesArray;
    }
    if (hasOwnValue(updates, 'scoreboardSnapshot') && updates.scoreboardSnapshot !== undefined) {
        normalized.scoreboardSnapshot = updates.scoreboardSnapshot || null;
    }

    return normalized;
}

export function buildModalRunsViewOptions(payload) {
    if (!payload || typeof payload !== 'object') return {};

    return {
        scoreboardChallengeId: payload.scoreboardChallengeId || null,
        scoreboardSnapshot: payload.scoreboardSnapshot || null,
        scoreboardMode: payload.scoreboardMode || 'standard',
        scoreboardTrackKey: payload.scoreboardTrackKey || null,
        scoreboardSubhead: payload.scoreboardSubhead || null,
        showGlobalLeaderboard: payload.showGlobalLeaderboard !== false,
        allowLeaderboardOpen: payload.allowLeaderboardOpen !== false
    };
}

export async function scheduleModalScoreboardRefresh({
    pendingPromise = null,
    loadSnapshot,
    isStillCurrent = () => true,
    applySnapshot,
    logError = 'Error refreshing modal scoreboard data'
} = {}) {
    try {
        if (pendingPromise) {
            await pendingPromise;
        }

        const snapshot = typeof loadSnapshot === 'function'
            ? await loadSnapshot()
            : null;

        if (snapshot && typeof applySnapshot === 'function' && isStillCurrent()) {
            applySnapshot(snapshot);
        }

        return snapshot;
    } catch (error) {
        console.error(logError, error);
        return null;
    }
}
