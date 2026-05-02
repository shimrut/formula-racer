import { TRACKS } from '../tracks.js?v=1.90';
import { TRACK_MODE_LABELS, TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from '../modes.js?v=1.90';
import { resolveTrackPreferenceScope } from './track-scope.js?v=1.90';

export function moveReturningTrack(step) {
    if (!this._returningTrackKeys.length) return;

    const currentIndex = Math.max(0, this._returningTrackKeys.indexOf(this._selectedReturningTrackKey));
    const nextIndex = Math.max(0, Math.min(this._returningTrackKeys.length - 1, currentIndex + step));
    const nextTrackKey = this._returningTrackKeys[nextIndex];
    this.setReturningTrackSelection(nextTrackKey, { scrollIntoView: true, syncPreviewTrack: true });
}

export function setReturningTrackSelection(
    trackKey,
    { scrollIntoView = false, syncPreviewTrack = false, refreshRankSnapshots = true } = {}
) {
    if (!trackKey || !this._returningTrackCards.has(trackKey)) return;

    if (this._selectedReturningTrackKey === trackKey) {
        if (scrollIntoView) {
            this.updateReturningTrackSlider();
        }
        this.updateVisibleTrackPreviews(trackKey);
        if (refreshRankSnapshots) {
            this.updateVisibleTrackRanks(trackKey);
        }
        if (syncPreviewTrack && this._onPreviewTrack) {
            this._onPreviewTrack(trackKey);
        }
        this.updateReturningTrackControls();
        this.updateTrackCountIndicator();
        this.updateTrackModeControls();
        this.updateReturningPlayerStartButton();
        return;
    }

    this._selectedReturningTrackKey = trackKey;
    const currentIndex = this._returningTrackKeys.indexOf(trackKey);
    this._returningTrackCards.forEach((card, key) => {
        const isActive = key === trackKey;
        const isAdjacent = key === this._returningTrackKeys[currentIndex - 1]
            || key === this._returningTrackKeys[currentIndex + 1];
        card.classList.toggle('is-active', isActive);
        card.classList.toggle('is-before', key === this._returningTrackKeys[currentIndex - 1]);
        card.classList.toggle('is-after', key === this._returningTrackKeys[currentIndex + 1]);
        card.setAttribute('aria-selected', isActive ? 'true' : 'false');
        card.tabIndex = isActive || isAdjacent ? 0 : -1;
    });

    this.updateVisibleTrackPreviews(trackKey);
    if (refreshRankSnapshots) {
        this.updateVisibleTrackRanks(trackKey);
    }
    this.updateReturningTrackSlider();
    if (syncPreviewTrack && this._onPreviewTrack) {
        this._onPreviewTrack(trackKey);
    }

    this.updateReturningTrackControls();
    this.updateTrackCountIndicator();
    this.updateTrackModeControls();
    this.updateReturningPlayerStartButton();
}

export function updateReturningTrackSlider() {
    if (!this.trackSelectorFrame || !this.trackCarouselShell || !this.trackCarousel || !this._selectedReturningTrackKey) return;

    if (!this._trackCarouselCardCenters.has(this._selectedReturningTrackKey) || this._trackCarouselShellWidth === 0) {
        this.refreshReturningTrackSliderMetrics();
    }

    const activeCardCenter = this._trackCarouselCardCenters.get(this._selectedReturningTrackKey);
    if (!Number.isFinite(activeCardCenter) || this._trackCarouselShellWidth === 0) return;

    this.setTrackCarouselTranslateX((this._trackCarouselShellWidth / 2) - activeCardCenter);
}

export function updateReturningTrackControls() {
    const currentIndex = this._returningTrackKeys.indexOf(this._selectedReturningTrackKey);
    if (this.trackPrevBtn) {
        const isHidden = currentIndex <= 0;
        this.trackPrevBtn.disabled = isHidden;
        this.trackPrevBtn.style.visibility = isHidden ? 'hidden' : '';
    }
    if (this.trackNextBtn) {
        const isHidden = currentIndex === -1 || currentIndex >= this._returningTrackKeys.length - 1;
        this.trackNextBtn.disabled = isHidden;
        this.trackNextBtn.style.visibility = isHidden ? 'hidden' : '';
    }
}

export function updateTrackCountIndicator() {
    if (!this.trackCountIndicator || !this._returningTrackKeys.length) return;

    const currentIndex = Math.max(0, this._returningTrackKeys.indexOf(this._selectedReturningTrackKey));
    const totalTracks = this._returningTrackKeys.length;
    this.trackCountIndicator.textContent = `${currentIndex + 1} / ${totalTracks}`;
    this.trackCountIndicator.setAttribute('aria-label', `Track ${currentIndex + 1} of ${totalTracks}`);
}

export function updateReturningPlayerStartButton() {
    if (!this._selectedReturningTrackKey) return;
    const trackName = TRACKS[this._selectedReturningTrackKey]?.name || 'Track';
    const preferences = this.getTrackPreferences(this._selectedReturningTrackKey);
    const isPractice = preferences.mode === TRACK_MODE_PRACTICE;
    if (this.returningPlayerHeading) {
        this.returningPlayerHeading.textContent = trackName;
    }
    if (this.returningStartBtn) {
        this.returningStartBtn.textContent = isPractice ? 'Start session' : 'Start trial';
    }
}

export function refreshReturningTrackPersonalBest(trackKey) {
    if (!trackKey || !this._returningTrackCards.has(trackKey)) return;

    const { mode, isRanked, namespace } = resolveTrackPreferenceScope(this.getTrackPreferences(trackKey));
    const bestTime = this._returningTrackPersonalBests.get(trackKey)?.[namespace]?.[mode];
    const card = this._returningTrackCards.get(trackKey);
    const pbEl = card?.querySelector('[data-track-pb]');
    const rankEl = card?.querySelector('[data-track-rank]');
    const rankBtn = card?.querySelector('[data-track-rank-action]');
    const rankWrapEl = rankEl?.closest('.modal-stat-right');
    const rankedToggleBtn = card?.querySelector('[data-track-ranked-toggle]');
    if (!pbEl || !rankEl) return;

    if (rankedToggleBtn) {
        rankedToggleBtn.classList.toggle('is-active', isRanked);
        rankedToggleBtn.setAttribute('aria-pressed', isRanked ? 'true' : 'false');
        rankedToggleBtn.textContent = isRanked ? 'RANKED' : 'LOCAL';
    }

    pbEl.textContent = bestTime !== null && bestTime !== undefined
        ? `${bestTime.toFixed(2)}s`
        : '--';
    if (rankWrapEl) {
        rankWrapEl.hidden = !isRanked;
    }
    const rankLabel = isRanked
        ? (this.getCachedTrackCardRankLabel(trackKey, mode, true) || 'N/A')
        : 'N/A';
    rankEl.textContent = rankLabel;
    if (rankBtn) {
        const trackName = TRACKS[trackKey]?.name || 'this track';
        rankBtn.disabled = !isRanked;
        rankBtn.setAttribute(
            'aria-label',
            `Open ${TRACK_MODE_LABELS[mode] || 'Time trial'} leaderboard for ${trackName}. Your rank: ${rankLabel}.`
        );
    }
}

export function openTrackCardLeaderboard(trackKey) {
    if (!trackKey || !this._returningTrackCards.has(trackKey)) return;

    this.setReturningTrackSelection(trackKey, { scrollIntoView: true, syncPreviewTrack: true });
    const { mode, isRanked } = resolveTrackPreferenceScope(this.getTrackPreferences(trackKey));
    if (!isRanked) return;

    this.showTrackLeaderboardModal(trackKey, mode, 'close');
}
