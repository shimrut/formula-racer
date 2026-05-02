export function initializeGameUiState(ui, {
    onPreviewTrack,
    onPreviewPresentation,
    onStart,
    onStartDailyChallenge,
    onModeSelected,
    onReset,
    onSupportClick,
    onHeaderMenuOpen,
    onHowToPlayOpen,
    previewQualityLevel = 0,
    previewFrameSkip = 0,
    readTrackCardRankSnapshots = () => new Map(),
    readScoreModeIntroDismissed = () => false
} = {}) {
    ui._lastTimeText = '';
    ui._lastSpeedText = '';
    ui._hudPrimaryMetricMode = 'time';
    ui._modalPreviewUrl = null;
    ui._focusBeforeModal = null;
    ui._activeTrapModal = null;
    ui._modalTrapKeydown = null;
    ui._modalCloseFallbackTimer = null;
    ui._modalCloseTransitionEndHandler = null;
    ui._practiceLapFlashTimer = null;
    ui._mainModalIsCrash = false;
    ui._modalKind = null;
    ui._modalPrimaryAction = onReset || null;
    ui._defaultModalPrimaryAction = onReset || null;
    ui._modalSecondaryAction = null;
    ui._modalRunsPayload = null;
    ui._forceSharePanelVisible = false;
    ui._leaderboardRequestId = 0;
    ui._hasPersonalBests = false;
    ui._hudPersonalBestsAllowed = true;
    ui._runsViewMode = 'back';
    ui._startOverlayHasAnyData = false;
    ui._startOverlayIsReturningPlayer = false;
    ui._introAcknowledged = false;
    ui._startOverlaySelection = null;
    ui._currentTrackKey = 'circuit';
    ui._returningTrackKeys = [];
    ui._returningTrackCards = new Map();
    ui._returningTrackPreviewCanvases = new Map();
    ui._renderedTrackPreviewKeys = new Set();
    ui._queuedTrackPreviewKeys = [];
    ui._queuedTrackPreviewKeySet = new Set();
    ui._pendingTrackPreviewRaf = null;
    ui._returningTrackPersonalBests = new Map();
    ui._returningTrackRankSnapshots = readTrackCardRankSnapshots();
    ui._pendingReturningTrackRankRequests = new Map();
    ui._pendingReturningTrackRankSubmissions = new Map();
    ui._returningTrackRankRequestVersions = new Map();
    ui._scoreModeIntroDismissed = readScoreModeIntroDismissed();
    ui._trackPreferences = new Map();
    ui._selectedReturningTrackKey = null;
    ui._carouselResizeObserver = null;
    ui._hudAnchorResizeObserver = null;
    ui._touchStartX = null;
    ui._touchDeltaX = 0;
    ui._trackCarouselTranslateX = 0;
    ui._trackCarouselShellWidth = 0;
    ui._trackCarouselCardCenters = new Map();
    ui._touchCarouselStartTranslate = 0;
    ui._carouselTouchDragging = false;
    ui._suppressCarouselCardClick = false;
    ui._pendingCarouselDragRaf = null;
    ui._pendingCarouselDragTranslateX = null;
    ui._selectorKeydownHandler = null;
    ui._dailyChallengeSummary = null;
    ui._dailyChallengeCountdownInterval = null;
    ui._pendingDailyChallengeSnapshotRequest = null;
    ui._dailyChallengePreviewTrackKey = null;
    ui._onPreviewTrack = onPreviewTrack;
    ui._onPreviewPresentation = onPreviewPresentation;
    ui._onStart = onStart;
    ui._onStartDailyChallenge = onStartDailyChallenge || null;
    ui._onModeSelected = onModeSelected || null;
    ui._onSupportClick = onSupportClick || null;
    ui._onHeaderMenuOpen = onHeaderMenuOpen || null;
    ui._onHowToPlayOpen = onHowToPlayOpen || null;
    ui._previewQualityLevel = previewQualityLevel;
    ui._previewFrameSkip = previewFrameSkip;
}
