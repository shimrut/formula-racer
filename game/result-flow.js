function hasFiniteValue(value) {
    return value !== null && value !== undefined && Number.isFinite(value);
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
