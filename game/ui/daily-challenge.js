import {
    formatDailyChallengeBestLabel,
    getDailyChallengeCopyLabels,
    getDailyChallengeModeSelectObjectiveLine
} from '../services/daily-challenge.js?v=1.90';
import {
    getDailyChallengeVerificationEntry,
    getDailyChallengeVerificationState
} from '../services/verification-queue.js';
import { buildScoreboardRankDisplay } from '../result-flow.js?v=1.90';

export function setDailyChallengeSummary(summary) {
    if (!summary || typeof summary !== 'object') {
        this._dailyChallengeSummary = null;
    } else {
        this._dailyChallengeSummary = {
            ...summary,
            verifiedBestTime: Object.prototype.hasOwnProperty.call(summary, 'verifiedBestTime')
                ? summary.verifiedBestTime
                : (Number.isFinite(summary.bestTime) ? summary.bestTime : null),
            verifiedBestLabel: Object.prototype.hasOwnProperty.call(summary, 'verifiedBestLabel')
                ? summary.verifiedBestLabel
                : (typeof summary.bestLabel === 'string' ? summary.bestLabel : '--'),
            verifiedRankLabel: Object.prototype.hasOwnProperty.call(summary, 'verifiedRankLabel')
                ? summary.verifiedRankLabel
                : (typeof summary.rankLabel === 'string' ? summary.rankLabel : '--'),
            verifiedScoreboardSnapshot: Object.prototype.hasOwnProperty.call(summary, 'verifiedScoreboardSnapshot')
                ? (summary.verifiedScoreboardSnapshot && typeof summary.verifiedScoreboardSnapshot === 'object'
                    ? summary.verifiedScoreboardSnapshot
                    : null)
                : (summary.scoreboardSnapshot && typeof summary.scoreboardSnapshot === 'object'
                    ? summary.scoreboardSnapshot
                    : null)
        };
    }

    const hasChallenge = Boolean(this._dailyChallengeSummary?.available);
    if (!hasChallenge && this._startOverlaySelection === 'daily') {
        this._startOverlaySelection = null;
    }
    if (this.dailyChallengeTitle) {
        this.dailyChallengeTitle.textContent = hasChallenge
            ? (this._dailyChallengeSummary.title || 'Daily')
            : 'No daily challenge right now';
    }
    if (this.dailyChallengeTrack) {
        this.dailyChallengeTrack.textContent = hasChallenge
            ? ''
            : 'Check back at the next UTC reset.';
        this.dailyChallengeTrack.style.display = hasChallenge ? 'none' : 'block';
    }
    if (this.dailyChallengeObjective) {
        this.dailyChallengeObjective.textContent = hasChallenge
            ? (this._dailyChallengeSummary.objectiveLabel || 'Daily objective unavailable')
            : 'A fresh challenge appears every day.';
        this.dailyChallengeObjective.style.display = hasChallenge ? 'inline-flex' : 'none';
    }
    if (this.dailyChallengeModifiers) {
        this.dailyChallengeModifiers.replaceChildren();
        const badgeTexts = hasChallenge
            ? (Array.isArray(this._dailyChallengeSummary.modifierBadges)
              && this._dailyChallengeSummary.modifierBadges.length
                ? this._dailyChallengeSummary.modifierBadges
                : [this._dailyChallengeSummary.modifierLabel || 'Stock'])
            : [];
        for (const text of badgeTexts) {
            const span = document.createElement('span');
            span.className = 'daily-challenge-detail__badge';
            span.textContent = text;
            this.dailyChallengeModifiers.appendChild(span);
        }
        this.dailyChallengeModifiers.style.display = hasChallenge && badgeTexts.length ? 'flex' : 'none';
    }
    if (this.dailyChallengeBest) {
        const bestTime = this._dailyChallengeSummary?.bestTime;
        this.dailyChallengeBest.textContent = this._dailyChallengeSummary?.bestLabel
            || (Number.isFinite(bestTime) ? `${bestTime.toFixed(2)}s` : '--');
    }
    if (this.dailyChallengeBestLabel) {
        this.dailyChallengeBestLabel.textContent = getDailyChallengeCopyLabels({
            objectiveType: this._dailyChallengeSummary?.objectiveType
        }).bestSummaryLabel;
    }
    const dailyChallengeRankLabel = this._dailyChallengeSummary?.rankLabel || '--';
    this.applyDailyChallengeRankContent(this._dailyChallengeSummary?.scoreboardSnapshot, dailyChallengeRankLabel);
    if (this.dailyChallengeRankBtn) {
        const rankDisplay = buildScoreboardRankDisplay(this._dailyChallengeSummary?.scoreboardSnapshot, {
            fallbackText: dailyChallengeRankLabel
        });
        const trackName = this._dailyChallengeSummary?.trackName || "today's daily challenge";
        this.dailyChallengeRankBtn.disabled = !hasChallenge;
        this.dailyChallengeRankBtn.setAttribute(
            'aria-label',
            hasChallenge
                ? `Open leaderboard for ${trackName}. Your rank: ${rankDisplay.statusText || rankDisplay.text}.`
                : 'Daily challenge leaderboard unavailable.'
        );
    }
    if (this.modeSelectDailyBtn) {
        this.modeSelectDailyBtn.hidden = !hasChallenge;
        this.modeSelectDailyBtn.disabled = !hasChallenge;
        this.modeSelectDailyBtn.setAttribute('aria-pressed', this._startOverlaySelection === 'daily' ? 'true' : 'false');
    }
    if (this.modeSelectDailyCopy) {
        this.modeSelectDailyCopy.textContent = hasChallenge
            ? `${this._dailyChallengeSummary.trackName || 'Track unavailable'} • ${getDailyChallengeModeSelectObjectiveLine({
                objectiveType: this._dailyChallengeSummary.objectiveType
            })}`
            : 'Loading today’s special event.';
    }
    if (this.dailyChallengeStartBtn) {
        this.dailyChallengeStartBtn.disabled = !hasChallenge || Boolean(this._dailyChallengeSummary?.loading);
    }
    if (hasChallenge && typeof this._dailyChallengeSummary.trackKey === 'string') {
        this.renderDailyChallengePreview(this._dailyChallengeSummary.trackKey);
    }

    this.updateDailyChallengeCountdown();
    this.updateStartOverlayMode(this._startOverlayHasAnyData, this._startOverlayIsReturningPlayer);

    if (this._dailyChallengeCountdownInterval !== null) {
        clearInterval(this._dailyChallengeCountdownInterval);
        this._dailyChallengeCountdownInterval = null;
    }
    if (hasChallenge && this._dailyChallengeSummary?.endsAt) {
        this._dailyChallengeCountdownInterval = window.setInterval(
            () => this.updateDailyChallengeCountdown(),
            1000
        );
    }
}

export function getDailyChallengeScoreboardSnapshot() {
    return this._dailyChallengeSummary?.scoreboardSnapshot || null;
}

export function applyDailyChallengeRankContent(scoreboardSnapshot, fallbackLabel = '--') {
    if (!this.dailyChallengeRankBtn || !this.dailyChallengeRank) return;

    const rankDisplay = buildScoreboardRankDisplay(scoreboardSnapshot, { fallbackText: fallbackLabel });
    let status = this.dailyChallengeRankBtn.querySelector?.('[data-daily-rank-status]');

    this.dailyChallengeRank.replaceChildren();
    this.dailyChallengeRank.toggleAttribute?.('aria-busy', rankDisplay.isLoading);
    this.dailyChallengeRank.textContent = rankDisplay.text;

    if (rankDisplay.isLoading) {
        const spinner = document.createElement('span');
        spinner.className = 'modal-rank-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        this.dailyChallengeRank.appendChild(spinner);
    }

    if (rankDisplay.statusText) {
        if (!status) {
            status = document.createElement('span');
            status.className = 'modal-stat-status';
            status.dataset.dailyRankStatus = '';
            this.dailyChallengeRankBtn.appendChild(status);
        }
        status.textContent = rankDisplay.statusText;
    } else {
        status?.remove();
    }
}

export function refreshDailyChallengeVerificationState(challengeId = this._dailyChallengeSummary?.challengeId) {
    if (!challengeId || this._dailyChallengeSummary?.challengeId !== challengeId) return;

    const summary = this._dailyChallengeSummary;
    const verificationEntry = getDailyChallengeVerificationEntry(challengeId);
    const verificationState = getDailyChallengeVerificationState(challengeId);
    const verifiedBestTime = Number.isFinite(summary?.verifiedBestTime) ? summary.verifiedBestTime : null;
    const verifiedBestLabel = typeof summary?.verifiedBestLabel === 'string' ? summary.verifiedBestLabel : '--';
    const verifiedRankLabel = typeof summary?.verifiedRankLabel === 'string' ? summary.verifiedRankLabel : '--';
    const verifiedScoreboardSnapshot = summary?.verifiedScoreboardSnapshot && typeof summary.verifiedScoreboardSnapshot === 'object'
        ? summary.verifiedScoreboardSnapshot
        : null;

    const nextSummary = {
        ...summary,
        bestTime: verifiedBestTime,
        bestLabel: verifiedBestLabel,
        rankLabel: verifiedRankLabel,
        scoreboardSnapshot: verifiedScoreboardSnapshot
    };

    if (verificationState === 'pending' && verificationEntry) {
        nextSummary.bestTime = Number.isFinite(verificationEntry.bestTime)
            ? verificationEntry.bestTime
            : verifiedBestTime;
        nextSummary.bestLabel = formatDailyChallengeBestLabel(
            summary.objectiveType,
            verificationEntry.bestTime,
            verificationEntry.completedLaps
        );
        nextSummary.scoreboardSnapshot = {
            ...(verifiedScoreboardSnapshot || {}),
            playerRankLabel: null,
            isLoading: true,
            verificationState: 'pending',
            statusText: 'Pending verification'
        };
    } else if (verificationState === 'rejected') {
        nextSummary.scoreboardSnapshot = {
            ...(verifiedScoreboardSnapshot || {}),
            isLoading: false,
            verificationState: 'rejected',
            statusText: 'Rejected'
        };
    }

    this.setDailyChallengeSummary(nextSummary);
}

export function updateDailyChallengeCountdown() {
    if (!this.dailyChallengeReset) return;

    if (!this._dailyChallengeSummary?.available || !this._dailyChallengeSummary?.endsAt) {
        this.dailyChallengeReset.textContent = '--';
        return;
    }

    const remainingMs = Date.parse(this._dailyChallengeSummary.endsAt) - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
        this.dailyChallengeReset.textContent = 'soon';
        return;
    }

    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    this.dailyChallengeReset.textContent = parts.join(' ');
}

export function setDailyChallengeHud(state = null) {
    const isVisible = Boolean(state?.visible);
    const text = isVisible ? (state?.progressText || '') : '';
    if (this.dailyChallengeHudInline) {
        this.dailyChallengeHudInline.hidden = !isVisible;
        const span = this.dailyChallengeHudInline.querySelector('.daily-challenge-hud__progress');
        if (span) span.textContent = text;
    }
    if (this.hudLapCluster) {
        this.hudLapCluster.classList.toggle('hud-lap-cluster--daily-active', isVisible);
    }
}
