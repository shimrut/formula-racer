import { TRACKS } from '../tracks.js?v=1.91';
import { TRACK_MODE_STANDARD } from '../modes.js?v=1.91';
import {
    getDailyChallengeSnapshot
} from '../services/daily-challenge.js?v=1.91';
import { normalizeTrackMode } from './track-mode.js?v=1.91';

export function showLeaderboardModalState(returnMode = 'close', {
    scoreboardSnapshot = null,
    scoreboardMode = TRACK_MODE_STANDARD,
    scoreboardChallengeId = null,
    scoreboardTrackKey = null,
    scoreboardSubhead = null,
    scoreboardDailyChallengeSkin = null
} = {}) {
    const payload = {
        scoreboardSnapshot,
        scoreboardMode
    };
    if (scoreboardTrackKey !== null) {
        payload.scoreboardTrackKey = scoreboardTrackKey;
    }
    if (scoreboardChallengeId !== null) {
        payload.scoreboardChallengeId = scoreboardChallengeId;
    }
    if (scoreboardSubhead !== null) {
        payload.scoreboardSubhead = scoreboardSubhead;
    }
    if (scoreboardDailyChallengeSkin !== null && scoreboardDailyChallengeSkin !== undefined) {
        payload.scoreboardDailyChallengeSkin = scoreboardDailyChallengeSkin;
    }
    this.showRunsModal(null, null, null, returnMode, payload);
}

export async function requestDailyChallengeLeaderboardSnapshot(challengeId) {
    if (!challengeId) return null;

    const pendingRequest = this._pendingDailyChallengeSnapshotRequest;
    if (pendingRequest?.challengeId === challengeId) {
        return pendingRequest.promise;
    }

    const requestPromise = getDailyChallengeSnapshot({ challengeId })
        .then((scoreboardSnapshot) => {
            if (this._dailyChallengeSummary?.challengeId === challengeId) {
                this.setDailyChallengeSummary({
                    ...this._dailyChallengeSummary,
                    rankLabel: scoreboardSnapshot?.playerRankLabel || '--',
                    scoreboardSnapshot: scoreboardSnapshot || null
                });
            }
            return scoreboardSnapshot || null;
        })
        .catch((error) => {
            console.error('Error loading daily challenge leaderboard:', error);
            return null;
        })
        .finally(() => {
            if (this._pendingDailyChallengeSnapshotRequest?.challengeId === challengeId) {
                this._pendingDailyChallengeSnapshotRequest = null;
            }
        });

    this._pendingDailyChallengeSnapshotRequest = {
        challengeId,
        promise: requestPromise
    };
    return requestPromise;
}

export async function openDailyChallengeLeaderboard(returnMode = 'close') {
    const summary = this._dailyChallengeSummary;
    if (!summary?.challengeId || !summary.trackKey) return;

    const requestId = ++this._leaderboardRequestId;
    const sharedOptions = {
        scoreboardMode: TRACK_MODE_STANDARD,
        scoreboardTrackKey: summary.trackKey,
        scoreboardSubhead: 'Leaderboard · Daily Challenge',
        scoreboardDailyChallengeSkin: typeof summary.skin === 'string' && summary.skin.trim()
            ? summary.skin.trim()
            : null
    };
    showLeaderboardModalState.call(this, returnMode, {
        ...sharedOptions,
        scoreboardChallengeId: summary.challengeId,
        scoreboardSnapshot: summary.scoreboardSnapshot || { isLoading: true }
    });

    const scoreboardSnapshot = await this.requestDailyChallengeLeaderboardSnapshot(summary.challengeId);
    if (requestId !== this._leaderboardRequestId) return;
    showLeaderboardModalState.call(this, returnMode, {
        ...sharedOptions,
        scoreboardChallengeId: summary.challengeId,
        scoreboardSnapshot
    });
}

export async function showTrackLeaderboardModal(trackKey, mode = TRACK_MODE_STANDARD, returnMode = 'close') {
    if (!trackKey || !TRACKS[trackKey]) return;

    const scoreboardMode = normalizeTrackMode(mode);
    const cachedSnapshot = this.getCachedTrackCardScoreboardSnapshot(trackKey, scoreboardMode, true);
    const requestId = ++this._leaderboardRequestId;
    showLeaderboardModalState.call(this, returnMode, {
        scoreboardSnapshot: cachedSnapshot || { isLoading: true },
        scoreboardMode,
        scoreboardTrackKey: trackKey
    });

    if (cachedSnapshot) return;

    try {
        const scoreboardSnapshot = await this.requestReturningTrackRankSnapshot(trackKey, scoreboardMode, true);
        if (requestId !== this._leaderboardRequestId) return;
        showLeaderboardModalState.call(this, returnMode, {
            scoreboardSnapshot,
            scoreboardMode,
            scoreboardTrackKey: trackKey
        });
    } catch (error) {
        console.error('Error loading track leaderboard:', error);
        if (requestId !== this._leaderboardRequestId) return;
        showLeaderboardModalState.call(this, returnMode, {
            scoreboardSnapshot: null,
            scoreboardMode,
            scoreboardTrackKey: trackKey
        });
    }
}
