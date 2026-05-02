import {
    buildModalRunsPayload,
    buildModalRunsViewOptions,
    buildScoreboardRankDisplay
} from '../result-flow.js?v=1.90';
import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from '../modes.js?v=1.90';

function isButtonElement(node) {
    return typeof HTMLButtonElement !== 'undefined' && node instanceof HTMLButtonElement;
}

export function getModalScoreboardStatusText(scoreboardSnapshot) {
    return buildScoreboardRankDisplay(scoreboardSnapshot).statusText;
}

export function applyRankModalStatContent(rankStat, scoreboardSnapshot) {
    if (!rankStat) return;

    const value = rankStat.querySelector?.('[data-modal-rank-value]');
    if (!value) return;

    const rankDisplay = buildScoreboardRankDisplay(scoreboardSnapshot);
    let status = rankStat.querySelector?.('[data-modal-rank-status]');

    value.replaceChildren();
    value.toggleAttribute('aria-busy', rankDisplay.isLoading);
    value.textContent = rankDisplay.text;
    if (rankDisplay.isLoading) {
        const spinner = document.createElement('span');
        spinner.className = 'modal-rank-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        value.appendChild(spinner);
    }

    if (rankDisplay.statusText) {
        if (!status) {
            status = document.createElement('span');
            status.className = 'modal-stat-status';
            status.dataset.modalRankStatus = '';
            rankStat.appendChild(status);
        }
        status.textContent = rankDisplay.statusText;
    } else {
        status?.remove();
    }

    if (isButtonElement(rankStat)) {
        rankStat.disabled = rankDisplay.isLoading;
    }
}

export function createRankModalStat(scoreboardSnapshot) {
    const hasRank = Boolean(scoreboardSnapshot?.playerRankLabel);
    const canOpenLeaderboard = Boolean(
        this._modalRunsPayload?.scoreboardTrackKey
        && this._modalRunsPayload?.allowLeaderboardOpen !== false
    );
    const stat = this.createModalStat(
        'Rank',
        hasRank ? scoreboardSnapshot.playerRankLabel : '',
        'modal-stat-value--rank',
        canOpenLeaderboard ? () => this.showModalLeaderboardPayload() : null
    );
    stat.dataset.modalRankStat = '';
    const value = stat.querySelector('.modal-stat-value');
    if (value) {
        value.dataset.modalRankValue = '';
    }
    applyRankModalStatContent.call(this, stat, scoreboardSnapshot);
    return stat;
}

export function updateModalScoreboardSnapshot(scoreboardSnapshot) {
    if (!this._modalRunsPayload) return;
    this._modalRunsPayload = buildModalRunsPayload(this._modalRunsPayload, {
        updates: { scoreboardSnapshot }
    });

    const rankStat = this.modalStatsRow?.querySelector('[data-modal-rank-stat]');
    const rankValue = this.modalStatsRow?.querySelector('[data-modal-rank-value]');
    if (!rankStat || !rankValue) return;

    if (!isButtonElement(rankStat)) {
        const nextRankStat = this.createRankModalStat(scoreboardSnapshot);
        rankStat.replaceWith(nextRankStat);
        return;
    }

    applyRankModalStatContent.call(this, rankStat, scoreboardSnapshot);
}

export function updateModalRunSummary({
    bestTime = undefined,
    currentTime = undefined,
    lapTimesArray = undefined
} = {}) {
    if (!this._modalRunsPayload) return;
    this._modalRunsPayload = buildModalRunsPayload(this._modalRunsPayload, {
        updates: { bestTime, currentTime, lapTimesArray }
    });

    if (bestTime !== undefined) {
        const primaryValue = this.modalStatsRow?.querySelector('.modal-stat-stack:not([data-modal-rank-stat]) .modal-stat-value');
        if (primaryValue && Number.isFinite(bestTime)) {
            primaryValue.textContent = `${bestTime.toFixed(2)}s`;
        }
    }

    if (!this.modalLapTimes) return;

    if (this.modalRunsView?.classList.contains('active-view')) {
        this.showRunsModal(
            this._modalRunsPayload.lapTimesArray,
            this._modalRunsPayload.bestTime,
            this._modalRunsPayload.currentTime,
            this._runsViewMode,
            buildModalRunsViewOptions(this._modalRunsPayload)
        );
        return;
    }

    if (!this.modalMainView?.classList.contains('active-view')) return;

    this.modalLapTimes.replaceChildren();
    if (this._modalRunsPayload.lapTimesArray !== undefined && this._modalRunsPayload.lapTimesArray !== null) {
        this.renderLapTimesList(
            this.modalLapTimes,
            this._modalRunsPayload.lapTimesArray,
            this._modalRunsPayload.bestTime,
            this._modalRunsPayload.currentTime
        );
    }
}

export function showModalLeaderboardPayload() {
    if (this._modalRunsPayload?.scoreboardChallengeId) {
        void this.openDailyChallengeLeaderboard('back');
        return;
    }

    if (!this._modalRunsPayload?.scoreboardTrackKey) return;

    this.showTrackLeaderboardModal(
        this._modalRunsPayload.scoreboardTrackKey,
        this._modalRunsPayload.scoreboardMode,
        'back'
    );
}

export function showModalRunsPayload() {
    if (!this._modalRunsPayload) return;

    this.showRunsModal(
        this._modalRunsPayload.lapTimesArray,
        this._modalRunsPayload.bestTime,
        this._modalRunsPayload.currentTime,
        'back',
        buildModalRunsViewOptions(this._modalRunsPayload)
    );
}

export function matchesModalScoreboardContext({ challengeId = null, trackKey = null, mode = null } = {}) {
    if (!this.isModalActive() || !this._modalRunsPayload) return false;

    if (challengeId) {
        return this._modalRunsPayload.scoreboardChallengeId === challengeId;
    }

    if (!trackKey) return false;
    if (this._modalRunsPayload.scoreboardChallengeId) return false;

    const expectedMode = mode === TRACK_MODE_PRACTICE ? TRACK_MODE_PRACTICE : TRACK_MODE_STANDARD;
    return this._modalRunsPayload.scoreboardTrackKey === trackKey
        && this._modalRunsPayload.scoreboardMode === expectedMode;
}
