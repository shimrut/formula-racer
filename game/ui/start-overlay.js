import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from '../modes.js?v=1.90';
import { saveTrackPreferences, writeScoreModeIntroDismissed } from '../storage.js?v=1.90';
import { normalizeTrackMode } from './track-mode.js?v=1.90';

export function selectTrackMode(mode) {
    const nextMode = normalizeTrackMode(mode);
    this._onModeSelected?.(nextMode);
    const trackKeys = this._returningTrackKeys.length
        ? this._returningTrackKeys
        : [this._selectedReturningTrackKey || this._currentTrackKey].filter(Boolean);

    trackKeys.forEach((trackKey) => {
        const updated = saveTrackPreferences(trackKey, { mode: nextMode });
        this._trackPreferences.set(trackKey, updated);
        this.refreshReturningTrackPersonalBest(trackKey);
    });

    this._startOverlaySelection = nextMode;
    this.updateTrackModeControls();
    this.updateReturningPlayerStartButton();
    this.updateStartOverlayMode(this._startOverlayHasAnyData);
}

export function selectDailyChallenge() {
    if (!this._dailyChallengeSummary?.available) return;
    this._onModeSelected?.('daily');
    this._startOverlaySelection = 'daily';
    this.updateTrackModeControls();
    this.updateStartOverlayMode(this._startOverlayHasAnyData);
}

export function refreshStartOverlay(status, hasAnyData, isReturningPlayer = false) {
    if (status !== 'ready' || this.startOverlay?.style.display === 'none') return;
    this.updateStartOverlayMode(hasAnyData, isReturningPlayer);
}

export function isStartOverlayVisible() {
    return Boolean(this.startOverlay && this.startOverlay.style.display !== 'none');
}

export function showStartOverlay(hasAnyData, isReturningPlayer = false) {
    if (this.startOverlay) this.startOverlay.style.display = 'flex';
    if (this.startGroup) this.startGroup.style.display = 'flex';
    this.setStartOverlayActive(true);
    this.updateStartOverlayMode(hasAnyData, isReturningPlayer);
}

export function hideStartOverlay() {
    if (this.startOverlay) this.startOverlay.style.display = 'none';
    this.setStartOverlayActive(false);
    this.setStartSelectionMode(false);
}

export function updateStartOverlayMode(hasAnyData, isReturningPlayer = this._startOverlayIsReturningPlayer) {
    this._startOverlayHasAnyData = Boolean(hasAnyData);
    this._startOverlayIsReturningPlayer = Boolean(isReturningPlayer);
    if (this._startOverlayHasAnyData && !this._startOverlayIsReturningPlayer && !this._scoreModeIntroDismissed) {
        this._scoreModeIntroDismissed = true;
        writeScoreModeIntroDismissed(true);
    }
    const showSelectionFlow = hasAnyData || this._introAcknowledged;
    const showScoreModeIntro = this.shouldShowScoreModeIntro(showSelectionFlow);
    const selectedOverlay = this._startOverlaySelection;
    const isOverlayVisible = this.isStartOverlayVisible();
    const showModeSelection = showSelectionFlow && !showScoreModeIntro && !selectedOverlay;
    const showReturningPlayerPanel = showSelectionFlow && !showScoreModeIntro && (
        selectedOverlay === TRACK_MODE_STANDARD || selectedOverlay === TRACK_MODE_PRACTICE
    );
    const showDailyChallengePanel = showSelectionFlow
        && !showScoreModeIntro
        && selectedOverlay === 'daily'
        && Boolean(this._dailyChallengeSummary?.available);

    if (this.firstTimeMsg) this.firstTimeMsg.style.display = showSelectionFlow ? 'none' : 'block';
    if (this.startBtn) {
        this.startBtn.style.display = showSelectionFlow ? 'none' : 'inline-flex';
        this.startBtn.textContent = 'Got It';
    }
    if (this.dailyChallengePanel) {
        this.dailyChallengePanel.hidden = !showDailyChallengePanel;
        this.dailyChallengePanel.style.display = showDailyChallengePanel ? 'grid' : 'none';
    }
    if (this.modeSelectionPanel) {
        this.modeSelectionPanel.hidden = !showModeSelection;
        this.modeSelectionPanel.style.display = showModeSelection ? 'grid' : 'none';
    }
    if (this.returningPlayerPanel) {
        this.returningPlayerPanel.hidden = !showReturningPlayerPanel;
        this.returningPlayerPanel.style.display = showReturningPlayerPanel ? 'grid' : 'none';
    }
    this.updateScoreModeIntro(showScoreModeIntro);
    this.updateTrackModeControls();
    document.body.classList.toggle('ftu-onboarding-active', isOverlayVisible && !showSelectionFlow);
    this.setStartSelectionMode(isOverlayVisible && showSelectionFlow);

    if (isOverlayVisible && showModeSelection) {
        requestAnimationFrame(() => {
            const focusTarget = selectedOverlay === 'daily' && this.modeSelectDailyBtn && !this.modeSelectDailyBtn.hidden
                ? this.modeSelectDailyBtn
                : (selectedOverlay === TRACK_MODE_PRACTICE
                    ? this.modeSelectPracticeBtn
                    : (selectedOverlay === TRACK_MODE_STANDARD
                        ? this.modeSelectStandardBtn
                        : null));

            if (focusTarget) {
                focusTarget.focus();
                return;
            }

            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement && this.modeSelectionPanel?.contains(activeElement)) {
                activeElement.blur();
            }
        });
    }

    if (isOverlayVisible && showReturningPlayerPanel) {
        requestAnimationFrame(() => {
            this.setReturningTrackSelection(
                this._selectedReturningTrackKey || this._currentTrackKey || this._returningTrackKeys[0],
                { scrollIntoView: true, syncPreviewTrack: true }
            );
        });
    }

    if (isOverlayVisible && showDailyChallengePanel) {
        requestAnimationFrame(() => {
            (this.dailyChallengeStartBtn?.disabled ? this.dailyChallengeBackBtn : this.dailyChallengeStartBtn)?.focus();
        });
    }
}

export function shouldShowScoreModeIntro(showTrackSelection) {
    return Boolean(
        showTrackSelection
        && this._startOverlayHasAnyData
        && this._startOverlayIsReturningPlayer
        && !this._scoreModeIntroDismissed
    );
}

export function isScoreModeIntroVisible() {
    return Boolean(this.scoreModeIntro && !this.scoreModeIntro.hidden);
}

export function updateScoreModeIntro(isVisible) {
    if (!this.scoreModeIntro) return;

    this.scoreModeIntro.hidden = !isVisible;
    if (isVisible) {
        requestAnimationFrame(() => this.scoreModeIntroDismiss?.focus());
    }
}

export function dismissScoreModeIntro() {
    if (this._scoreModeIntroDismissed) return;

    this._scoreModeIntroDismissed = true;
    writeScoreModeIntroDismissed(true);
    this.updateStartOverlayMode(this._startOverlayHasAnyData);
}
