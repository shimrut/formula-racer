import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from './modes.js?v=1.91';
import {
    readScoreModeIntroDismissed,
    readTrackCardRankSnapshots
} from './storage.js?v=1.91';
import {
    applyDailyChallengeRankContent as applyDailyChallengeRankPanelContent,
    getDailyChallengeScoreboardSnapshot as getDailyScoreboardSnapshot,
    refreshDailyChallengeVerificationState as refreshDailyChallengeVerificationSummary,
    setDailyChallengeHud as setDailyChallengeHudDisplay,
    setDailyChallengeSummary as setDailyChallengePanelSummary,
    updateDailyChallengeCountdown as updateDailyChallengeTimer
} from './ui/daily-challenge.js?v=1.91';
import {
    dismissScoreModeIntro as dismissStartOverlayScoreModeIntro,
    hideStartOverlay as hideStartOverlayView,
    isScoreModeIntroVisible as isStartOverlayScoreModeIntroVisible,
    isStartOverlayVisible as isStartOverlayVisibleState,
    refreshStartOverlay as refreshStartOverlayState,
    selectDailyChallenge as selectDailyChallengeMode,
    selectTrackMode as selectStartOverlayTrackMode,
    shouldShowScoreModeIntro as shouldShowStartOverlayScoreModeIntro,
    showStartOverlay as showStartOverlayView,
    updateScoreModeIntro as updateStartOverlayScoreModeIntro,
    updateStartOverlayMode as updateStartOverlayPanels
} from './ui/start-overlay.js?v=1.91';
import {
    applyRankModalStatContent as applyModalRankStatContent,
    createRankModalStat as createModalRankStat,
    getModalScoreboardStatusText as getModalRankStatusText,
    matchesModalScoreboardContext as matchesModalRunsScoreboardContext,
    showModalLeaderboardPayload as showModalRunsLeaderboardPayload,
    showModalRunsPayload as showModalRunsPayloadView,
    updateModalRunSummary as refreshModalRunSummary,
    updateModalScoreboardSnapshot as refreshModalScoreboardSnapshot
} from './ui/modal-runs.js?v=1.91';
import {
    moveReturningTrack as advanceReturningTrackSelection,
    openTrackCardLeaderboard as openTrackSelectorLeaderboard,
    refreshReturningTrackPersonalBest as refreshTrackSelectorPersonalBest,
    setReturningTrackSelection as setTrackSelectorSelection,
    updateReturningPlayerStartButton as updateTrackSelectorStartButton,
    updateReturningTrackControls as updateTrackSelectorControls,
    updateReturningTrackSlider as updateTrackSelectorSlider,
    updateTrackCountIndicator as updateTrackSelectorCount
} from './ui/track-selector.js?v=1.91';
import {
    cancelPendingTrackCarouselDrag as cancelTrackBrowserPendingDrag,
    flushQueuedTrackPreviews as flushTrackBrowserQueuedPreviews,
    getTrackCarouselKeys as getTrackBrowserKeys,
    isMobileTrackCarouselView as isTrackBrowserMobileView,
    queueReturningTrackPreview as queueTrackBrowserPreview,
    refreshReturningTrackSliderMetrics as refreshTrackBrowserSliderMetrics,
    renderDailyChallengePreview as renderTrackBrowserDailyPreview,
    renderReturningTrackPreview as renderTrackBrowserPreview,
    scheduleTrackCarouselDragTranslateX as scheduleTrackBrowserDragTranslateX,
    setTrackCarouselTranslateX as setTrackBrowserTranslateX,
    updateVisibleTrackPreviews as updateTrackBrowserVisiblePreviews
} from './ui/track-browser.js?v=1.91';
import { assignGameUiDomRefs } from './ui/dom.js?v=1.91';
import { initializeGameUiState } from './ui/state.js?v=1.91';
import {
    bindReturningPlayerCarousel as bindTrackPickerCarousel,
    bindReturningPlayerKeyboardNavigation as bindTrackPickerKeyboardNavigation,
    bindReturningPlayerSwipe as bindTrackPickerSwipe,
    isDesktopTrackSelectionActive as isDesktopTrackPickerSelectionActive,
    updateTrackModeControls as updateTrackPickerModeControls
} from './ui/track-picker.js?v=1.91';
import {
    bumpTrackCardRankRequestVersion as bumpTrackRankRequestVersion,
    getCachedTrackCardRankLabel as getCachedTrackRankLabel,
    getCachedTrackCardScoreboardSnapshot as getCachedTrackRankScoreboardSnapshot,
    getFreshReturningTrackRankCache as getFreshTrackRankCache,
    getTrackCardRankCacheKey as getTrackRankCacheKey,
    getTrackCardRankPrefetchKeys as getTrackRankPrefetchKeys,
    getTrackCardRankRequestVersion as getTrackRankRequestVersion,
    hasFreshTrackCardRankCache as hasFreshTrackRankCache,
    hasLoadedTrackPersonalBestState as hasLoadedTrackPersonalBestStateForCard,
    hasTrackPersonalBest as hasTrackPersonalBestForCard,
    invalidateReturningTrackRankSnapshot as invalidateTrackRankSnapshot,
    loadReturningTrackPersonalBests as loadTrackPersonalBests,
    refreshAllReturningTrackPersonalBests as refreshAllTrackPersonalBests,
    refreshReturningTrackRankSnapshot as refreshTrackRankSnapshot,
    requestReturningTrackRankSnapshot as requestTrackRankSnapshot,
    setPendingReturningTrackRankSubmission as setPendingTrackRankSubmission,
    updateReturningTrackPersonalBest as updateTrackPersonalBest,
    updateVisibleTrackRanks as updateTrackRankVisibility
} from './ui/track-ranks.js?v=1.91';
import {
    activateModalFocusTrap as activateModalShellFocusTrap,
    cancelPendingModalClose as cancelModalShellClose,
    clearModalPreview as clearModalShellPreview,
    closeModal as closeModalShell,
    getFocusables as getModalShellFocusables,
    handleModalTrapKeydown as handleModalShellTrapKeydown,
    hideHowToPlayModal as hideModalShellHowToPlay,
    isPauseModalActive as isModalShellPauseActive,
    isStandaloneRunsViewActive as isModalShellStandaloneRunsActive,
    preparePendingShareLayout as prepareModalShellPendingShareLayout,
    releaseModalFocusTrap as releaseModalShellFocusTrap,
    setModalPreviewBlob as setModalShellPreviewBlob,
    showHowToPlayModal as showModalShellHowToPlay,
    showMainModalView as showModalShellMainView,
    showModal as showModalShell,
    showRunsModal as showModalShellRuns,
    updateShareState as updateModalShellShareState
} from './ui/modal-shell.js?v=1.91';
import {
    centerLeaderboardCurrentRow as centerModalContentLeaderboardCurrentRow,
    createModalActionIcon as createModalContentActionIcon,
    createModalStat as createModalContentStat,
    renderLapTimesList as renderModalContentLapTimesList,
    renderPracticeLapTimesList as renderModalContentPracticeLapTimesList,
    renderScoreboardList as renderModalContentScoreboardList,
    setModalActionButtonContent as setModalContentActionButtonContent,
    setModalResetButtonLabel as setModalContentResetButtonLabel,
    setModalSecondaryButton as setModalContentSecondaryButton,
    setModalStatCenter as setModalContentStatCenter,
    setModalStatLeftRight as setModalContentStatLeftRight,
    setPracticePauseStats as setModalContentPracticePauseStats,
    setShareButtonContent as setModalContentShareButtonContent,
    setStandardPauseStats as setModalContentStandardPauseStats,
    setWinStats as setModalContentWinStats
} from './ui/modal-content.js?v=1.91';
import {
    getCachedPersonalBestForTrack as getRaceHudCachedPersonalBestForTrack,
    hidePracticeLapFlash as hideRaceHudPracticeLapFlash,
    hideStartLights as hideRaceHudStartLights,
    resetCountdown as resetRaceHudCountdown,
    resetHud as resetRaceHud,
    setBestTime as setRaceHudBestTime,
    setHudBestMetric as setRaceHudBestMetric,
    setHudLapTimeVisible as setRaceHudLapTimeVisible,
    setHudPersonalBestsOpenAllowed as setRaceHudPersonalBestsOpenAllowed,
    setHudPrimaryMetric as setRaceHudPrimaryMetric,
    setPracticePauseVisible as setRaceHudPracticePauseVisible,
    showGoMessage as showRaceHudGoMessage,
    showPracticeLapFlash as showRaceHudPracticeLapFlash,
    showStartLights as showRaceHudStartLights,
    syncHud as syncRaceHud,
    turnOnCountdownLight as turnOnRaceHudCountdownLight,
    updateHudStatsButtonState as updateRaceHudStatsButtonState
} from './ui/race-hud.js?v=1.91';
import {
    bindHowToPlay as bindUiHowToPlay,
    bindModalActionRowPointerFocus as bindUiModalActionRowPointerFocus,
    bindModalViewToggles as bindUiModalViewToggles,
    bindPrimaryActions as bindUiPrimaryActions,
    bindScoreModeIntro as bindUiScoreModeIntro,
    bindSteeringControls as bindUiSteeringControls,
    bindTapAction as bindUiTapAction,
    bindTouchButton as bindUiTouchButton,
    bindTrackModeControls as bindUiTrackModeControls
} from './ui/interactions.js?v=1.91';
import {
    createEmptyTrackPersonalBestState as createTrackStateEmptyPersonalBestState,
    getSelectedTrackMode as getTrackStateSelectedMode,
    getTrackPreferences as getUiTrackPreferences,
    setTrackSelection as setUiTrackSelection,
    updateSelectedTrackPreferences as updateUiSelectedTrackPreferences
} from './ui/track-state.js?v=1.91';
import {
    openDailyChallengeLeaderboard as openUiDailyChallengeLeaderboard,
    requestDailyChallengeLeaderboardSnapshot as requestUiDailyChallengeLeaderboardSnapshot,
    showTrackLeaderboardModal as showUiTrackLeaderboardModal
} from './ui/leaderboards.js?v=1.91';
import {
    anchorHudBar as anchorUiHudBar,
    isModalActive as isUiModalActive,
    resetTouchControls as resetUiTouchControls,
    setStartOverlayActive as setUiStartOverlayActive,
    setStartSelectionMode as setUiStartSelectionMode
} from './ui/core.js?v=1.91';
export class GameUi {
    constructor({ onPreviewTrack, onPreviewPresentation, onStart, onStartDailyChallenge, onModeSelected, onReset, onShare, onShowPersonalBests, onPausePractice, onSupportClick, onHeaderMenuOpen, onHowToPlayOpen, previewQualityLevel = 0, previewFrameSkip = 0 }) {
        assignGameUiDomRefs(this);
        initializeGameUiState(this, {
            onPreviewTrack,
            onPreviewPresentation,
            onStart,
            onStartDailyChallenge,
            onModeSelected,
            onReset,
            onSupportClick,
            onHeaderMenuOpen,
            onHowToPlayOpen,
            previewQualityLevel,
            previewFrameSkip,
            readTrackCardRankSnapshots,
            readScoreModeIntroDismissed
        });
        this.anchorHudBar();
        this.bindReturningPlayerCarousel();
        this.bindModalViewToggles();
        this.bindModalActionRowPointerFocus();
        this.bindHowToPlay();
        this.bindPrimaryActions(onStart, onStartDailyChallenge, onShare, onShowPersonalBests, onPausePractice);
        this.bindScoreModeIntro();
        this.bindTrackModeControls();
        this.bindReturningPlayerKeyboardNavigation();
        this.updateShareState({ visible: false, ready: false, busy: false });
        this.setPracticePauseVisible(false);
    }

    setStartOverlayActive(isActive) {
        return setUiStartOverlayActive.call(this, isActive);
    }

    setStartSelectionMode(isActive) {
        return setUiStartSelectionMode.call(this, isActive);
    }

    anchorHudBar() {
        return anchorUiHudBar.call(this);
    }

    setTrackCarouselTranslateX(translateX) {
        return setTrackBrowserTranslateX.call(this, translateX);
    }

    scheduleTrackCarouselDragTranslateX(translateX) {
        return scheduleTrackBrowserDragTranslateX.call(this, translateX);
    }

    cancelPendingTrackCarouselDrag() {
        return cancelTrackBrowserPendingDrag.call(this);
    }

    bindModalViewToggles() {
        return bindUiModalViewToggles.call(this);
    }

    bindModalActionRowPointerFocus() {
        return bindUiModalActionRowPointerFocus.call(this);
    }

    bindHowToPlay() {
        return bindUiHowToPlay.call(this);
    }

    bindPrimaryActions(onStart, onStartDailyChallenge, onShare, onShowPersonalBests, onPausePractice) {
        return bindUiPrimaryActions.call(this, onStart, onStartDailyChallenge, onShare, onShowPersonalBests, onPausePractice);
    }

    bindScoreModeIntro() {
        return bindUiScoreModeIntro.call(this);
    }

    bindTrackModeControls() {
        return bindUiTrackModeControls.call(this);
    }

    bindSteeringControls({ onLeftDown, onLeftUp, onRightDown, onRightUp }) {
        return bindUiSteeringControls.call(this, { onLeftDown, onLeftUp, onRightDown, onRightUp });
    }

    bindTapAction(element, onTap) {
        return bindUiTapAction.call(this, element, onTap);
    }

    bindTouchButton(button, onDown, onUp) {
        return bindUiTouchButton.call(this, button, onDown, onUp);
    }

    setTrackSelection(trackKey, { refreshRankSnapshots = true } = {}) {
        return setUiTrackSelection.call(this, trackKey, { refreshRankSnapshots });
    }

    getTrackPreferences(trackKey) {
        return getUiTrackPreferences.call(this, trackKey);
    }

    updateSelectedTrackPreferences(nextPreferences) {
        return updateUiSelectedTrackPreferences.call(this, nextPreferences);
    }

    getSelectedTrackMode(trackKey = this._selectedReturningTrackKey || this._currentTrackKey) {
        return getTrackStateSelectedMode.call(this, trackKey);
    }

    selectTrackMode(mode) {
        return selectStartOverlayTrackMode.call(this, mode);
    }

    selectDailyChallenge() {
        return selectDailyChallengeMode.call(this);
    }

    createEmptyTrackPersonalBestState() {
        return createTrackStateEmptyPersonalBestState();
    }

    isModalActive() {
        return isUiModalActive.call(this);
    }

    syncHud({ time, speed, force = false }) {
        return syncRaceHud.call(this, { time, speed, force });
    }

    resetHud() {
        return resetRaceHud.call(this);
    }

    setHudPrimaryMetric({ label = 'LAP', value = '0.00', useTimer = true, visible = true } = {}) {
        return setRaceHudPrimaryMetric.call(this, { label, value, useTimer, visible });
    }

    setHudLapTimeVisible(isVisible) {
        return setRaceHudLapTimeVisible.call(this, isVisible);
    }

    setHudBestMetric({ label = 'BEST', value = '--', visible = false } = {}) {
        return setRaceHudBestMetric.call(this, { label, value, visible });
    }

    getCachedPersonalBestForTrack(trackKey) {
        return getRaceHudCachedPersonalBestForTrack.call(this, trackKey);
    }

    setBestTime(bestLapTime, {
        persistToTrackCard = true,
        trackKey = this._currentTrackKey,
        mode = null,
        ranked = null,
        scoreboardSubmitPromise = null
    } = {}) {
        return setRaceHudBestTime.call(this, bestLapTime, {
            persistToTrackCard,
            trackKey,
            mode,
            ranked,
            scoreboardSubmitPromise
        });
    }

    setHudPersonalBestsOpenAllowed(isAllowed) {
        return setRaceHudPersonalBestsOpenAllowed.call(this, isAllowed);
    }

    setPracticePauseVisible(isVisible) {
        return setRaceHudPracticePauseVisible.call(this, isVisible);
    }

    updateHudStatsButtonState() {
        return updateRaceHudStatsButtonState.call(this);
    }

    refreshStartOverlay(status, hasAnyData, isReturningPlayer = false) {
        return refreshStartOverlayState.call(this, status, hasAnyData, isReturningPlayer);
    }

    isStartOverlayVisible() {
        return isStartOverlayVisibleState.call(this);
    }

    showStartOverlay(hasAnyData, isReturningPlayer = false) {
        return showStartOverlayView.call(this, hasAnyData, isReturningPlayer);
    }

    hideStartOverlay() {
        return hideStartOverlayView.call(this);
    }

    bindReturningPlayerCarousel() {
        return bindTrackPickerCarousel.call(this);
    }

    renderReturningTrackPreview(trackKey) {
        return renderTrackBrowserPreview.call(this, trackKey);
    }

    renderDailyChallengePreview(trackKey) {
        return renderTrackBrowserDailyPreview.call(this, trackKey);
    }

    queueReturningTrackPreview(trackKey) {
        return queueTrackBrowserPreview.call(this, trackKey);
    }

    flushQueuedTrackPreviews() {
        return flushTrackBrowserQueuedPreviews.call(this);
    }

    updateVisibleTrackPreviews(trackKey) {
        return updateTrackBrowserVisiblePreviews.call(this, trackKey);
    }

    getTrackCardRankCacheKey(trackKey, mode, ranked = false) {
        return getTrackRankCacheKey.call(this, trackKey, mode, ranked);
    }

    getTrackCardRankRequestVersion(cacheKey) {
        return getTrackRankRequestVersion.call(this, cacheKey);
    }

    bumpTrackCardRankRequestVersion(cacheKey) {
        return bumpTrackRankRequestVersion.call(this, cacheKey);
    }

    getTrackCardRankPrefetchKeys(trackKey) {
        return getTrackRankPrefetchKeys.call(this, trackKey);
    }

    invalidateReturningTrackRankSnapshot(trackKey, mode, ranked = false) {
        return invalidateTrackRankSnapshot.call(this, trackKey, mode, ranked);
    }

    getFreshReturningTrackRankCache(trackKey, mode, ranked = false) {
        return getFreshTrackRankCache.call(this, trackKey, mode, ranked);
    }

    setPendingReturningTrackRankSubmission(trackKey, mode, ranked = false, submitPromise = null) {
        return setPendingTrackRankSubmission.call(this, trackKey, mode, ranked, submitPromise);
    }

    getCachedTrackCardRankLabel(trackKey, mode, ranked = false) {
        return getCachedTrackRankLabel.call(this, trackKey, mode, ranked);
    }

    hasFreshTrackCardRankCache(trackKey, mode, ranked = false) {
        return hasFreshTrackRankCache.call(this, trackKey, mode, ranked);
    }

    getCachedTrackCardScoreboardSnapshot(trackKey, mode, ranked = false) {
        return getCachedTrackRankScoreboardSnapshot.call(this, trackKey, mode, ranked);
    }

    hasLoadedTrackPersonalBestState(trackKey) {
        return hasLoadedTrackPersonalBestStateForCard.call(this, trackKey);
    }

    hasTrackPersonalBest(trackKey, mode, ranked = false) {
        return hasTrackPersonalBestForCard.call(this, trackKey, mode, ranked);
    }

    async requestReturningTrackRankSnapshot(trackKey, mode, ranked = false) {
        return requestTrackRankSnapshot.call(this, trackKey, mode, ranked);
    }

    async refreshReturningTrackRankSnapshot(trackKey) {
        return refreshTrackRankSnapshot.call(this, trackKey);
    }

    /**
     * Refreshes leaderboard rank for track card(s). Neighbor prefetch warms the next carousel slides;
     * skip it when only this track's preferences changed (mode/ranked) to avoid redundant Supabase traffic.
     */
    updateVisibleTrackRanks(trackKey, { prefetchNeighbors = true } = {}) {
        return updateTrackRankVisibility.call(this, trackKey, { prefetchNeighbors });
    }

    refreshReturningTrackSliderMetrics() {
        return refreshTrackBrowserSliderMetrics.call(this);
    }

    _isMobileTrackCarouselView() {
        return isTrackBrowserMobileView.call(this);
    }

    bindReturningPlayerSwipe() {
        return bindTrackPickerSwipe.call(this);
    }

    bindReturningPlayerKeyboardNavigation() {
        return bindTrackPickerKeyboardNavigation.call(this);
    }

    isDesktopTrackSelectionActive() {
        return isDesktopTrackPickerSelectionActive.call(this);
    }

    getTrackCarouselKeys() {
        return getTrackBrowserKeys.call(this);
    }

    moveReturningTrack(step) {
        return advanceReturningTrackSelection.call(this, step);
    }

    setReturningTrackSelection(trackKey, { scrollIntoView = false, syncPreviewTrack = false, refreshRankSnapshots = true } = {}) {
        return setTrackSelectorSelection.call(this, trackKey, {
            scrollIntoView,
            syncPreviewTrack,
            refreshRankSnapshots
        });
    }

    updateReturningTrackSlider() {
        return updateTrackSelectorSlider.call(this);
    }

    updateReturningTrackControls() {
        return updateTrackSelectorControls.call(this);
    }

    updateTrackCountIndicator() {
        return updateTrackSelectorCount.call(this);
    }

    updateReturningPlayerStartButton() {
        return updateTrackSelectorStartButton.call(this);
    }

    updateTrackModeControls() {
        return updateTrackPickerModeControls.call(this);
    }

    async loadReturningTrackPersonalBests() {
        return loadTrackPersonalBests.call(this);
    }

    refreshAllReturningTrackPersonalBests() {
        return refreshAllTrackPersonalBests.call(this);
    }

    refreshReturningTrackPersonalBest(trackKey) {
        return refreshTrackSelectorPersonalBest.call(this, trackKey);
    }

    openTrackCardLeaderboard(trackKey) {
        return openTrackSelectorLeaderboard.call(this, trackKey);
    }

    async requestDailyChallengeLeaderboardSnapshot(challengeId) {
        return requestUiDailyChallengeLeaderboardSnapshot.call(this, challengeId);
    }

    async openDailyChallengeLeaderboard(returnMode = 'close') {
        return openUiDailyChallengeLeaderboard.call(this, returnMode);
    }

    async showTrackLeaderboardModal(trackKey, mode = TRACK_MODE_STANDARD, returnMode = 'close') {
        return showUiTrackLeaderboardModal.call(this, trackKey, mode, returnMode);
    }

    updateReturningTrackPersonalBest(trackKey, bestTime, mode = TRACK_MODE_STANDARD, ranked = false) {
        return updateTrackPersonalBest.call(this, trackKey, bestTime, mode, ranked);
    }

    setDailyChallengeSummary(summary) {
        return setDailyChallengePanelSummary.call(this, summary);
    }

    getDailyChallengeScoreboardSnapshot() {
        return getDailyScoreboardSnapshot.call(this);
    }

    applyDailyChallengeRankContent(scoreboardSnapshot, fallbackLabel = '--') {
        return applyDailyChallengeRankPanelContent.call(this, scoreboardSnapshot, fallbackLabel);
    }

    refreshDailyChallengeVerificationState(challengeId = this._dailyChallengeSummary?.challengeId) {
        return refreshDailyChallengeVerificationSummary.call(this, challengeId);
    }

    updateDailyChallengeCountdown() {
        return updateDailyChallengeTimer.call(this);
    }

    setDailyChallengeHud(state = null) {
        return setDailyChallengeHudDisplay.call(this, state);
    }

    updateStartOverlayMode(hasAnyData, isReturningPlayer = this._startOverlayIsReturningPlayer) {
        return updateStartOverlayPanels.call(this, hasAnyData, isReturningPlayer);
    }

    shouldShowScoreModeIntro(showTrackSelection) {
        return shouldShowStartOverlayScoreModeIntro.call(this, showTrackSelection);
    }

    isScoreModeIntroVisible() {
        return isStartOverlayScoreModeIntroVisible.call(this);
    }

    updateScoreModeIntro(isVisible) {
        return updateStartOverlayScoreModeIntro.call(this, isVisible);
    }

    dismissScoreModeIntro() {
        return dismissStartOverlayScoreModeIntro.call(this);
    }

    showStartLights() {
        return showRaceHudStartLights.call(this);
    }

    turnOnCountdownLight(index) {
        return turnOnRaceHudCountdownLight.call(this, index);
    }

    hideStartLights() {
        return hideRaceHudStartLights.call(this);
    }

    showGoMessage() {
        return showRaceHudGoMessage.call(this);
    }

    showPracticeLapFlash({ lapNumber, lapTime, deltaVsBest, isBest, isNewBest = false }) {
        return showRaceHudPracticeLapFlash.call(this, {
            lapNumber,
            lapTime,
            deltaVsBest,
            isBest,
            isNewBest
        });
    }

    hidePracticeLapFlash() {
        return hideRaceHudPracticeLapFlash.call(this);
    }

    resetCountdown() {
        return resetRaceHudCountdown.call(this);
    }

    cancelPendingModalClose() {
        return cancelModalShellClose.call(this);
    }

    showModal(title, msg, lapData, canShare, options = {}) {
        return showModalShell.call(this, title, msg, lapData, canShare, options);
    }

    showRunsModal(lapTimesArray, bestTime, currentTime = null, returnMode = 'close', {
        scoreboardSnapshot = null,
        scoreboardMode = TRACK_MODE_STANDARD,
        scoreboardChallengeId = null,
        scoreboardTrackKey = null,
        scoreboardDailyChallengeSkin = null,
        scoreboardSubhead = null,
        showGlobalLeaderboard = true,
        allowLeaderboardOpen = true
    } = {}) {
        return showModalShellRuns.call(this, lapTimesArray, bestTime, currentTime, returnMode, {
            scoreboardSnapshot,
            scoreboardMode,
            scoreboardChallengeId,
            scoreboardTrackKey,
            scoreboardDailyChallengeSkin,
            scoreboardSubhead,
            showGlobalLeaderboard,
            allowLeaderboardOpen
        });
    }

    closeModal() {
        return closeModalShell.call(this);
    }

    showMainModalView() {
        return showModalShellMainView.call(this);
    }

    isStandaloneRunsViewActive() {
        return isModalShellStandaloneRunsActive.call(this);
    }

    isPauseModalActive() {
        return isModalShellPauseActive.call(this);
    }

    setModalStatCenter(labelText, valueText, valueClass) {
        return setModalContentStatCenter.call(this, labelText, valueText, valueClass);
    }

    setModalStatLeftRight(lapText, deltaText, bestText, { leftLabel = 'Lap', rightLabel = 'Best' } = {}) {
        return setModalContentStatLeftRight.call(this, lapText, deltaText, bestText, { leftLabel, rightLabel });
    }

    setPracticePauseStats(sessionBestTime, _practiceBestTime, deltaToBest, isNewBest = false, scoreboardSnapshot = null) {
        return setModalContentPracticePauseStats.call(this, sessionBestTime, _practiceBestTime, deltaToBest, isNewBest, scoreboardSnapshot);
    }

    setStandardPauseStats(lapTime, deltaToBest, _bestTime, primaryLabel = 'Lap Time') {
        return setModalContentStandardPauseStats.call(this, lapTime, deltaToBest, _bestTime, primaryLabel);
    }

    setWinStats(lapTime, deltaToBest, scoreboardSnapshot = null, primaryLabel = 'Lap Time') {
        return setModalContentWinStats.call(this, lapTime, deltaToBest, scoreboardSnapshot, primaryLabel);
    }

    createModalStat(labelText, valueText, valueClass = '', onClick = null) {
        return createModalContentStat.call(this, labelText, valueText, valueClass, onClick);
    }

    getModalScoreboardStatusText(scoreboardSnapshot) {
        return getModalRankStatusText(scoreboardSnapshot);
    }

    applyRankModalStatContent(rankStat, scoreboardSnapshot) {
        return applyModalRankStatContent.call(this, rankStat, scoreboardSnapshot);
    }

    createRankModalStat(scoreboardSnapshot) {
        return createModalRankStat.call(this, scoreboardSnapshot);
    }

    updateModalScoreboardSnapshot(scoreboardSnapshot) {
        return refreshModalScoreboardSnapshot.call(this, scoreboardSnapshot);
    }

    updateModalRunSummary({
        bestTime = undefined,
        currentTime = undefined,
        lapTimesArray = undefined
    } = {}) {
        return refreshModalRunSummary.call(this, { bestTime, currentTime, lapTimesArray });
    }

    showModalLeaderboardPayload() {
        return showModalRunsLeaderboardPayload.call(this);
    }

    showModalRunsPayload() {
        return showModalRunsPayloadView.call(this);
    }

    matchesModalScoreboardContext({ challengeId = null, trackKey = null, mode = null } = {}) {
        return matchesModalRunsScoreboardContext.call(this, { challengeId, trackKey, mode });
    }

    createModalActionIcon(iconName) {
        return createModalContentActionIcon.call(this, iconName);
    }

    setModalActionButtonContent(button, label, { shortcutLabel = null, iconName = null } = {}) {
        return setModalContentActionButtonContent.call(this, button, label, { shortcutLabel, iconName });
    }

    setModalResetButtonLabel(label, shortcutLabel = null, iconName = null) {
        return setModalContentResetButtonLabel.call(this, label, shortcutLabel, iconName);
    }

    setModalSecondaryButton(label, isVisible, iconName = null) {
        return setModalContentSecondaryButton.call(this, label, isVisible, iconName);
    }

    setShareButtonContent(label, iconName = 'save') {
        return setModalContentShareButtonContent.call(this, label, iconName);
    }

    renderLapTimesList(container, lapTimesArray, bestTime, currentTime) {
        return renderModalContentLapTimesList.call(this, container, lapTimesArray, bestTime, currentTime);
    }

    renderScoreboardList(container, scoreboardSnapshot, scoreboardMode, trackKey = null, scoreboardSubhead = null, scoreboardChallengeId = null, scoreboardDailyChallengeSkin = null) {
        return renderModalContentScoreboardList.call(this, container, scoreboardSnapshot, scoreboardMode, trackKey, scoreboardSubhead, scoreboardChallengeId, scoreboardDailyChallengeSkin);
    }

    centerLeaderboardCurrentRow() {
        return centerModalContentLeaderboardCurrentRow.call(this);
    }

    renderPracticeLapTimesList(container, practiceSummary) {
        return renderModalContentPracticeLapTimesList.call(this, container, practiceSummary);
    }

    updateShareState({ visible, ready, busy }) {
        return updateModalShellShareState.call(this, { visible, ready, busy });
    }

    preparePendingShareLayout() {
        return prepareModalShellPendingShareLayout.call(this);
    }

    setModalPreviewBlob(blob) {
        return setModalShellPreviewBlob.call(this, blob);
    }

    clearModalPreview() {
        return clearModalShellPreview.call(this);
    }

    showHowToPlayModal() {
        return showModalShellHowToPlay.call(this);
    }

    hideHowToPlayModal() {
        return hideModalShellHowToPlay.call(this);
    }

    resetTouchControls() {
        return resetUiTouchControls.call(this);
    }

    getFocusables(root) {
        return getModalShellFocusables.call(this, root);
    }

    activateModalFocusTrap(modalEl) {
        return activateModalShellFocusTrap.call(this, modalEl);
    }

    releaseModalFocusTrap(modalEl) {
        return releaseModalShellFocusTrap.call(this, modalEl);
    }

    handleModalTrapKeydown(e) {
        return handleModalShellTrapKeydown.call(this, e);
    }
}
