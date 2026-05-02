import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from './modes.js?v=1.89';

function createWinData(state, checkpointCount, extra = {}) {
    return Object.freeze({
        lapTime: state.currentTime,
        trackKey: state.currentTrackKey,
        runId: state.activeRunId,
        checkpointCount,
        completedCheckpointCount: state.nextCheckpointIndex,
        ...extra
    });
}

function createCrashBudgetWinData(state, challengeRun, checkpointCount) {
    return Object.freeze({
        lapTime: challengeRun.elapsedTime || 0,
        trackKey: state.currentTrackKey,
        runId: state.activeRunId,
        checkpointCount,
        completedCheckpointCount: state.nextCheckpointIndex,
        completedLaps: challengeRun.completedLaps || 0,
        crashCount: challengeRun.crashCount,
        challengeEndedOnCrash: true
    });
}

export function createRunPolicy({
    modeKey = TRACK_MODE_STANDARD,
    practiceEndOnCrash = false,
    challengeRun = null
} = {}) {
    if (challengeRun) {
        const objectiveType = challengeRun.objectiveType || 'single_lap_fastest';
        return {
            id: `daily:${objectiveType}`,
            modeKey: TRACK_MODE_STANDARD,
            isPractice: false,
            isDaily: true,
            objectiveType,
            requiredLaps: Math.max(1, Math.trunc(challengeRun.requiredLaps || 1)),
            maxCrashes: challengeRun.maxCrashes ?? null,
            practiceEndOnCrash: false,
            bestResultComparator: objectiveType === 'finish_with_crash_budget'
                ? 'laps-then-time'
                : 'time'
        };
    }

    if (modeKey === TRACK_MODE_PRACTICE) {
        return {
            id: 'practice',
            modeKey: TRACK_MODE_PRACTICE,
            isPractice: true,
            isDaily: false,
            objectiveType: null,
            requiredLaps: 1,
            maxCrashes: null,
            practiceEndOnCrash: Boolean(practiceEndOnCrash),
            bestResultComparator: 'time'
        };
    }

    return {
        id: 'standard',
        modeKey: TRACK_MODE_STANDARD,
        isPractice: false,
        isDaily: false,
        objectiveType: null,
        requiredLaps: 1,
        maxCrashes: null,
        practiceEndOnCrash: false,
        bestResultComparator: 'time'
    };
}

export function resolveRunPolicy(state) {
    return state?.currentRunPolicy || createRunPolicy({
        modeKey: state?.currentModeKey,
        practiceEndOnCrash: state?.practiceEndOnCrash,
        challengeRun: state?.currentChallengeRun || null
    });
}

export function handleFinishCrossing(state, policy, checkpointCount) {
    const challengeRun = state.currentChallengeRun || null;

    if (policy.isDaily && challengeRun) {
        const completedLapTime = policy.objectiveType === 'finish_with_crash_budget'
            ? state.currentTime
            : state.currentTime - (Number.isFinite(challengeRun.lastLapAt) ? challengeRun.lastLapAt : 0);
        if (policy.objectiveType === 'finish_with_crash_budget') {
            challengeRun.elapsedTime = (challengeRun.elapsedTime || 0) + completedLapTime;
            state.currentTime = 0;
        } else {
            challengeRun.lastLapAt = state.currentTime;
        }
        challengeRun.completedLaps = (challengeRun.completedLaps || 0) + 1;

        const result = {
            challengeLapCompleted: true,
            challengeCompletedLapTime: completedLapTime,
            challengeProgressLaps: challengeRun.completedLaps
        };
        if (
            policy.objectiveType !== 'finish_with_crash_budget'
            && challengeRun.completedLaps >= policy.requiredLaps
        ) {
            state.status = 'won';
            result.winTriggered = true;
            result.winData = createWinData(state, checkpointCount, {
                completedLaps: challengeRun.completedLaps,
                crashCount: challengeRun.crashCount || 0
            });
        }
        return result;
    }

    if (policy.isPractice) {
        const lapTime = state.currentTime;
        state.currentTime = 0;
        return {
            lapCompleted: true,
            completedLapTime: lapTime
        };
    }

    state.status = 'won';
    return {
        winTriggered: true,
        winData: createWinData(state, checkpointCount)
    };
}

export function handleHardCrash(state, policy, checkpointCount) {
    const challengeRun = state.currentChallengeRun || null;

    if (policy.isDaily && challengeRun && policy.objectiveType === 'finish_with_crash_budget') {
        challengeRun.crashCount = (challengeRun.crashCount || 0) + 1;
        challengeRun.elapsedTime = (challengeRun.elapsedTime || 0) + state.currentTime;
        if (
            policy.maxCrashes !== null
            && policy.maxCrashes !== undefined
            && challengeRun.crashCount >= policy.maxCrashes
        ) {
            state.status = 'won';
            return {
                winTriggered: true,
                winData: createCrashBudgetWinData(state, challengeRun, checkpointCount),
                challengeCrashCount: challengeRun.crashCount
            };
        }

        state.currentTime = 0;
        return {
            challengeCrashReset: true,
            challengeCrashCount: challengeRun.crashCount
        };
    }

    if (policy.isDaily && challengeRun) {
        if (state.status === 'won') {
            return {};
        }
        state.status = 'crashed';
        return {
            challengeFailed: true,
            challengeFailureReason: 'Crash ended the challenge'
        };
    }

    if (policy.isPractice && !policy.practiceEndOnCrash) {
        return {
            practiceCrashReset: true
        };
    }

    state.status = 'crashed';
    return {
        crashEndedRun: true
    };
}
