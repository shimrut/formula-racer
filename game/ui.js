import { CONFIG } from './config.js?v=0.71';
import { TRACKS } from './tracks.js?v=0.80';
import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from './modes.js?v=0.01';
import { getTrackData, getTrackPreferences, saveTrackPreferences } from './storage.js?v=0.72';
import { getTrackPreviewGeometry } from './core/track-assets.js?v=0.01';
import { renderTrackPreviewCanvas } from './services/share-renderer.js?v=0.81';

/** Horizontal swipe distance (px) to change track on mobile carousel. */
const MOBILE_CAROUSEL_SWIPE_PX = 42;

export class GameUi {
    constructor({ onPreviewTrack, onPreviewPresentation, onStart, onReset, onShare, onShowPersonalBests, onPausePractice, previewQualityLevel = 0, previewFrameSkip = 0 }) {
        this.header = document.querySelector('header');
        this.hudBar = document.querySelector('.hud-bar');
        this.hudStatsBtn = document.getElementById('hud-stats-btn');
        this.timeVal = document.getElementById('time-val');
        this.speedVal = document.getElementById('speed-val');
        this.desktopSpeedometer = document.getElementById('desktop-speedometer');
        this.desktopPracticePauseBtn = document.getElementById('desktop-practice-pause-btn');
        this.mobileSpeedometer = document.getElementById('mobile-speedometer');
        this.mobileSpeedVal = document.getElementById('mobile-speed-val');
        this.mobilePracticePauseBtn = document.getElementById('mobile-practice-pause-btn');
        this.bestTimeDisplay = document.getElementById('best-time-display');
        this.bestTimeDivider = document.getElementById('best-time-divider');
        this.bestTimeVal = document.getElementById('best-time-val');
        this.modal = document.getElementById('modal');
        this.modalTitle = document.getElementById('modal-title');
        this.modalMsg = document.getElementById('modal-msg');
        this.modalLapTimes = document.getElementById('modal-lap-times');
        this.modalStatsRow = document.getElementById('modal-stats-row');
        this.modalPreviewWrap = document.getElementById('modal-preview-wrap');
        this.modalPreviewImg = document.getElementById('modal-preview-img');
        this.backToMainBtn = document.getElementById('back-to-main-btn');
        this.modalMainView = document.getElementById('modal-main-view');
        this.modalRunsView = document.getElementById('modal-runs-view');
        this.shareBtn = document.getElementById('share-btn');
        this.modalSecondaryBtn = document.getElementById('modal-secondary-btn');
        this.startOverlay = document.getElementById('start-overlay');
        this.startGroup = document.getElementById('start-group');
        this.firstTimeMsg = document.getElementById('first-time-msg');
        this.returningPlayerPanel = document.getElementById('returning-player-panel');
        this.returningPlayerHeading = document.getElementById('returning-player-heading');
        this.trackCountIndicator = document.getElementById('track-count-indicator');
        this.trackSelectorFrame = document.querySelector('.track-selector-frame');
        this.trackCarouselShell = document.querySelector('.track-carousel-shell');
        this.trackCarousel = document.getElementById('track-carousel');
        this.trackPrevBtn = document.getElementById('track-prev-btn');
        this.trackNextBtn = document.getElementById('track-next-btn');
        this.trackModeStandardBtn = document.getElementById('track-mode-standard-btn');
        this.trackModePracticeBtn = document.getElementById('track-mode-practice-btn');
        this.returningStartBtn = document.getElementById('returning-start-btn');
        this.startLights = document.getElementById('start-lights');
        this.goMessage = document.getElementById('go-message');
        this.practiceLapFlash = document.getElementById('practice-lap-flash');
        this.practiceLapFlashLabel = document.getElementById('practice-lap-flash-label');
        this.practiceLapFlashTime = document.getElementById('practice-lap-flash-time');
        this.practiceLapFlashDelta = document.getElementById('practice-lap-flash-delta');
        this.htpModal = document.getElementById('how-to-play-modal');
        this.closeHtpBtn = document.getElementById('close-htp-btn');
        this.closeHtpXBtn = document.getElementById('htp-modal-close');
        this.headerHtpBtn = document.getElementById('header-htp-btn');
        this.headerNavMenu = document.getElementById('header-nav-menu');
        this.menuHowToPlayBtn = document.getElementById('menu-how-to-play');
        this.startBtn = document.getElementById('start-btn');
        this.modalResetBtn = document.getElementById('modal-reset-btn');
        this.leftTouchBtn = document.getElementById('btn-left');
        this.rightTouchBtn = document.getElementById('btn-right');
        this.countdownLights = [
            document.getElementById('light-1'),
            document.getElementById('light-2'),
            document.getElementById('light-3')
        ];

        this._lastTimeText = '';
        this._lastSpeedText = '';
        this._modalPreviewUrl = null;
        this._focusBeforeModal = null;
        this._activeTrapModal = null;
        this._modalTrapKeydown = null;
        this._modalCloseFallbackTimer = null;
        this._modalCloseTransitionEndHandler = null;
        this._practiceLapFlashTimer = null;
        this._mainModalIsCrash = false;
        this._modalKind = null;
        this._modalPrimaryAction = onReset || null;
        this._defaultModalPrimaryAction = onReset || null;
        this._modalSecondaryAction = null;
        this._forceSharePanelVisible = false;
        this._hasPersonalBests = false;
        this._hudPersonalBestsAllowed = true;
        this._runsViewMode = 'back';
        this._startOverlayHasAnyData = false;
        this._introAcknowledged = false;
        this._currentTrackKey = 'circuit';
        this._returningTrackKeys = [];
        this._returningTrackCards = new Map();
        this._returningTrackPreviewCanvases = new Map();
        this._renderedTrackPreviewKeys = new Set();
        this._queuedTrackPreviewKeys = [];
        this._queuedTrackPreviewKeySet = new Set();
        this._pendingTrackPreviewRaf = null;
        this._returningTrackPersonalBests = new Map();
        this._trackPreferences = new Map();
        this._selectedReturningTrackKey = null;
        this._carouselResizeObserver = null;
        this._hudAnchorResizeObserver = null;
        this._touchStartX = null;
        this._touchDeltaX = 0;
        this._trackCarouselTranslateX = 0;
        this._trackCarouselShellWidth = 0;
        this._trackCarouselCardCenters = new Map();
        this._touchCarouselStartTranslate = 0;
        this._carouselTouchDragging = false;
        this._suppressCarouselCardClick = false;
        this._selectorKeydownHandler = null;
        this._onPreviewTrack = onPreviewTrack;
        this._onPreviewPresentation = onPreviewPresentation;
        this._onStart = onStart;
        this._previewQualityLevel = previewQualityLevel;
        this._previewFrameSkip = previewFrameSkip;
        this.anchorHudBar();
        this.bindReturningPlayerCarousel();
        this.bindModalViewToggles();
        this.bindModalActionRowPointerFocus();
        this.bindHowToPlay();
        this.bindPrimaryActions(onStart, onShare, onShowPersonalBests, onPausePractice);
        this.bindTrackModeControls();
        this.bindReturningPlayerKeyboardNavigation();
        this.updateShareState({ visible: false, ready: false, busy: false });
        this.setPracticePauseVisible(false);
    }

    setStartOverlayActive(isActive) {
        document.body.classList.toggle('start-overlay-active', Boolean(isActive));
    }

    setStartSelectionMode(isActive) {
        document.body.classList.toggle('start-selection-active', Boolean(isActive));
    }

    anchorHudBar() {
        const header = this.header;
        const hudBar = this.hudBar;
        if (!header || !hudBar) return;

        const getHeaderHeight = (entry) => {
            const observedSize = entry?.borderBoxSize;
            if (Array.isArray(observedSize) && observedSize[0]?.blockSize) {
                return observedSize[0].blockSize;
            }
            if (observedSize?.blockSize) {
                return observedSize.blockSize;
            }
            return header.offsetHeight;
        };

        const setHudTop = (entry) => {
            hudBar.style.top = `${Math.round(getHeaderHeight(entry)) + 12}px`;
        };
        setHudTop();
        this._hudAnchorResizeObserver?.disconnect?.();
        this._hudAnchorResizeObserver = new ResizeObserver((entries) => setHudTop(entries[0]));
        this._hudAnchorResizeObserver.observe(header);
    }

    setTrackCarouselTranslateX(translateX) {
        this._trackCarouselTranslateX = Number.isFinite(translateX)
            ? Math.round(translateX * 100) / 100
            : 0;
        if (this.trackCarousel) {
            this.trackCarousel.style.transform = `translate3d(${this._trackCarouselTranslateX}px, 0, 0)`;
        }
    }

    bindModalViewToggles() {
        if (this.backToMainBtn) {
            this.backToMainBtn.addEventListener('click', () => {
                if (this._runsViewMode === 'close') {
                    this.closeModal();
                    return;
                }
                this.showMainModalView();
            });
        }
    }

    /**
     * Mobile / WebKit often leaves :focus on the first-tapped action while another looks “active”.
     * Blur siblings on pointerdown (capture) so only the pressed control keeps focus + focus ring.
     */
    bindModalActionRowPointerFocus() {
        const row = this.modal?.querySelector('.modal-action-row');
        if (!row) return;
        row.addEventListener(
            'pointerdown',
            (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                const pressed = e.target.closest('button');
                if (!(pressed instanceof HTMLButtonElement) || !row.contains(pressed)) return;
                row.querySelectorAll(':scope > button').forEach((b) => {
                    if (b !== pressed) b.blur();
                });
            },
            true
        );
    }

    bindHowToPlay() {
        const closeHeaderMenu = () => {
            if (!this.headerNavMenu || !this.headerHtpBtn) return;
            this.headerNavMenu.hidden = true;
            this.headerHtpBtn.setAttribute('aria-expanded', 'false');
            this._headerMenuOpen = false;
        };

        const openHeaderMenu = () => {
            if (!this.headerNavMenu || !this.headerHtpBtn) return;
            this.headerNavMenu.hidden = false;
            this.headerHtpBtn.setAttribute('aria-expanded', 'true');
            this._headerMenuOpen = true;
            const first = this.menuHowToPlayBtn || this.headerNavMenu.querySelector('a');
            if (first instanceof HTMLElement) first.focus();
        };

        const toggleHeaderMenu = () => {
            if (this._headerMenuOpen) closeHeaderMenu();
            else openHeaderMenu();
        };

        this._headerMenuOpen = false;

        if (this.headerHtpBtn) {
            this.headerHtpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleHeaderMenu();
            });
        }

        if (this.menuHowToPlayBtn) {
            this.menuHowToPlayBtn.addEventListener('click', () => {
                closeHeaderMenu();
                this.showHowToPlayModal();
            });
        }

        this.headerNavMenu?.querySelectorAll('a.header-nav-item').forEach((anchor) => {
            anchor.addEventListener('click', () => closeHeaderMenu());
        });

        if (this.closeHtpBtn) {
            this.closeHtpBtn.addEventListener('click', () => this.hideHowToPlayModal());
        }
        if (this.closeHtpXBtn) {
            this.closeHtpXBtn.addEventListener('click', () => this.hideHowToPlayModal());
        }

        this._headerMenuDocClick = (e) => {
            if (!this._headerMenuOpen) return;
            const wrap = document.querySelector('.header-menu');
            if (wrap && !wrap.contains(e.target)) closeHeaderMenu();
        };
        document.addEventListener('click', this._headerMenuDocClick);

        this._headerMenuEscape = (e) => {
            if (e.key !== 'Escape' || !this._headerMenuOpen) return;
            closeHeaderMenu();
            this.headerHtpBtn?.focus();
        };
        document.addEventListener('keydown', this._headerMenuEscape);
    }

    bindPrimaryActions(onStart, onShare, onShowPersonalBests, onPausePractice) {
        if (this.startBtn && onStart) {
            this.startBtn.addEventListener('click', () => {
                if (!this._startOverlayHasAnyData && !this._introAcknowledged) {
                    this._introAcknowledged = true;
                    this.updateStartOverlayMode(false);
                    return;
                }
                onStart();
            });
        }
        if (this.returningStartBtn && onStart) {
            this.returningStartBtn.addEventListener('click', () => {
                const trackKey = this._selectedReturningTrackKey || this._currentTrackKey || this._returningTrackKeys[0];
                onStart(trackKey, this.getTrackPreferences(trackKey));
            });
        }
        if (this.hudStatsBtn && onShowPersonalBests) {
            this.hudStatsBtn.addEventListener('click', onShowPersonalBests);
        }
        if (this.modalResetBtn) {
            this.modalResetBtn.addEventListener('click', () => {
                if (this._modalPrimaryAction) this._modalPrimaryAction();
            });
        }
        if (this.modalSecondaryBtn) {
            this.modalSecondaryBtn.addEventListener('click', () => {
                if (this._modalSecondaryAction) this._modalSecondaryAction();
            });
        }
        if (this.shareBtn && onShare) {
            this.shareBtn.addEventListener('click', onShare);
        }
        if (this.desktopSpeedometer && onPausePractice) this.desktopSpeedometer.addEventListener('click', onPausePractice);
        if (this.mobileSpeedometer && onPausePractice) this.mobileSpeedometer.addEventListener('click', onPausePractice);
    }

    bindTrackModeControls() {
        if (this.trackModeStandardBtn) {
            this.trackModeStandardBtn.addEventListener('click', () => this.updateSelectedTrackPreferences({ mode: TRACK_MODE_STANDARD }));
        }
        if (this.trackModePracticeBtn) {
            this.trackModePracticeBtn.addEventListener('click', () => this.updateSelectedTrackPreferences({ mode: TRACK_MODE_PRACTICE }));
        }
    }

    bindSteeringControls({ onLeftDown, onLeftUp, onRightDown, onRightUp }) {
        this.bindTouchButton(this.leftTouchBtn, onLeftDown, onLeftUp);
        this.bindTouchButton(this.rightTouchBtn, onRightDown, onRightUp);
    }

    bindTouchButton(button, onDown, onUp) {
        if (!button) return;

        let isPressed = false;

        const press = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();
            if (isPressed) return;
            isPressed = true;
            onDown?.();
            button.classList.add('active');
            if (e.pointerId !== undefined) {
                button.setPointerCapture?.(e.pointerId);
            }
        };

        const release = (e) => {
            e?.preventDefault?.();
            if (!isPressed) return;
            isPressed = false;
            onUp?.();
            button.classList.remove('active');
            if (e?.pointerId !== undefined && button.hasPointerCapture?.(e.pointerId)) {
                button.releasePointerCapture?.(e.pointerId);
            }
        };

        if (window.PointerEvent) {
            button.addEventListener('pointerdown', press);
            button.addEventListener('pointerup', release);
            button.addEventListener('pointercancel', release);
            button.addEventListener('lostpointercapture', release);
            return;
        }

        button.addEventListener('touchstart', press, { passive: false });
        button.addEventListener('touchend', release, { passive: false });
        button.addEventListener('touchcancel', release, { passive: false });
        button.addEventListener('mousedown', press);
        button.addEventListener('mouseup', release);
        button.addEventListener('mouseleave', release);
    }

    setTrackSelection(trackKey) {
        if (!trackKey) return;

        this._currentTrackKey = trackKey;
        this.setReturningTrackSelection(trackKey, { scrollIntoView: true });
    }

    getTrackPreferences(trackKey) {
        if (!trackKey) {
            return getTrackPreferences(this._selectedReturningTrackKey || this._currentTrackKey);
        }
        if (!this._trackPreferences.has(trackKey)) {
            this._trackPreferences.set(trackKey, getTrackPreferences(trackKey));
        }
        return this._trackPreferences.get(trackKey);
    }

    updateSelectedTrackPreferences(nextPreferences) {
        const trackKey = this._selectedReturningTrackKey || this._currentTrackKey;
        if (!trackKey) return;

        const updated = saveTrackPreferences(trackKey, nextPreferences);
        this._trackPreferences.set(trackKey, updated);
        this.refreshReturningTrackPersonalBest(trackKey);
        this.updateTrackModeControls();
        this.updateReturningPlayerStartButton();
    }

    isModalActive() {
        return Boolean(this.modal?.classList.contains('active'));
    }

    syncHud({ time, speed, force = false }) {
        const timeText = time.toFixed(2);
        if (force || this._lastTimeText !== timeText) {
            if (this.timeVal) this.timeVal.textContent = timeText;
            this._lastTimeText = timeText;
        }

        const speedText = Math.round(speed * 20).toString();
        if (force || this._lastSpeedText !== speedText) {
            if (this.speedVal) this.speedVal.textContent = speedText;
            if (this.mobileSpeedVal) this.mobileSpeedVal.textContent = speedText;
            this._lastSpeedText = speedText;
        }
    }

    resetHud() {
        if (this.timeVal) this.timeVal.textContent = '0.00';
        if (this.speedVal) this.speedVal.textContent = '0';
        if (this.mobileSpeedVal) this.mobileSpeedVal.textContent = '0';
        this._lastTimeText = '0.00';
        this._lastSpeedText = '0';
    }

    /** PB shown on track cards after bulk load; used to avoid HUD flicker while switching tracks. */
    getCachedPersonalBestForTrack(trackKey) {
        if (!trackKey || !this._returningTrackPersonalBests.has(trackKey)) return null;
        const mode = this.getTrackPreferences(trackKey).mode === TRACK_MODE_PRACTICE
            ? TRACK_MODE_PRACTICE
            : TRACK_MODE_STANDARD;
        const v = this._returningTrackPersonalBests.get(trackKey)?.[mode];
        return v !== null && v !== undefined ? v : null;
    }

    setBestTime(bestLapTime, { persistToTrackCard = true } = {}) {
        if (!this.bestTimeDisplay || !this.bestTimeVal) return;

        const currentTrackKey = this._currentTrackKey;
        if (persistToTrackCard && currentTrackKey && bestLapTime !== null && bestLapTime !== undefined) {
            const mode = this.getTrackPreferences(currentTrackKey).mode === TRACK_MODE_PRACTICE
                ? TRACK_MODE_PRACTICE
                : TRACK_MODE_STANDARD;
            this.updateReturningTrackPersonalBest(currentTrackKey, bestLapTime, mode);
        }

        if (bestLapTime !== null && bestLapTime !== undefined) {
            this.bestTimeVal.textContent = bestLapTime.toFixed(2);
            this.bestTimeDisplay.style.display = 'flex';
            if (this.bestTimeDivider) this.bestTimeDivider.style.display = 'block';
            this._hasPersonalBests = true;
            this.updateHudStatsButtonState();
            return;
        }

        this.bestTimeDisplay.style.display = 'none';
        if (this.bestTimeDivider) this.bestTimeDivider.style.display = 'none';
        this._hasPersonalBests = false;
        this.updateHudStatsButtonState();
    }

    setHudPersonalBestsOpenAllowed(isAllowed) {
        this._hudPersonalBestsAllowed = Boolean(isAllowed);
        this.updateHudStatsButtonState();
    }

    setPracticePauseVisible(isVisible) {
        const applyState = (container, button) => {
            if (container) {
                container.classList.toggle('has-practice-pause', isVisible);
                container.setAttribute('aria-label', isVisible ? 'Pause run' : 'Current speed');
            }
            if (!button) return;
            button.hidden = !isVisible;
            button.style.display = isVisible ? 'inline-flex' : 'none';
            button.setAttribute('aria-label', isVisible ? 'Pause run' : 'Pause run');
        };

        applyState(this.desktopSpeedometer, this.desktopPracticePauseBtn);
        applyState(this.mobileSpeedometer, this.mobilePracticePauseBtn);
    }

    updateHudStatsButtonState() {
        if (this.hudStatsBtn) {
            this.hudStatsBtn.disabled = !(this._hasPersonalBests && this._hudPersonalBestsAllowed);
        }
    }

    refreshStartOverlay(status, hasAnyData) {
        if (status !== 'ready' || this.startOverlay?.style.display === 'none') return;
        this.updateStartOverlayMode(hasAnyData);
    }

    showStartOverlay(hasAnyData) {
        if (this.startOverlay) this.startOverlay.style.display = 'flex';
        if (this.startGroup) this.startGroup.style.display = 'flex';
        this.setStartOverlayActive(true);
        this.updateStartOverlayMode(hasAnyData);
    }

    hideStartOverlay() {
        if (this.startOverlay) this.startOverlay.style.display = 'none';
        this.setStartOverlayActive(false);
        this.setStartSelectionMode(false);
    }

    bindReturningPlayerCarousel() {
        if (!this.trackCarousel) return;

        this._returningTrackKeys = this.getTrackCarouselKeys();
        this.trackCarousel.innerHTML = '';
        this._returningTrackCards.clear();
        this._returningTrackPreviewCanvases.clear();
        this._renderedTrackPreviewKeys.clear();
        this._queuedTrackPreviewKeys = [];
        this._queuedTrackPreviewKeySet.clear();
        this._trackCarouselShellWidth = 0;
        this._trackCarouselCardCenters.clear();
        if (this._pendingTrackPreviewRaf !== null) {
            cancelAnimationFrame(this._pendingTrackPreviewRaf);
            this._pendingTrackPreviewRaf = null;
        }
        this._trackPreferences.clear();

        this._returningTrackKeys.forEach((trackKey, index) => {
            const track = TRACKS[trackKey];
            if (!track) return;
            this._trackPreferences.set(trackKey, getTrackPreferences(trackKey));

            const card = document.createElement('article');
            card.className = 'track-card';
            card.dataset.trackKey = trackKey;
            card.setAttribute('role', 'option');
            card.setAttribute('aria-selected', 'false');
            card.tabIndex = 0;
            card.innerHTML = `
                <div class="modal-card track-card-modal">
                    <div class="track-card-modal-view">
                        <div class="track-card-modal-content">
                            <h2 class="track-card-modal-title">${track.name}</h2>
                            <div class="modal-stats-row track-card-stats-row">
                                <span class="modal-stat-center">
                                    <span class="modal-stat-label">Best</span>
                                    <span class="modal-stat-value modal-stat-value--best" data-track-pb>--</span>
                                </span>
                            </div>
                        </div>
                        <div class="track-card-preview-wrap">
                            <canvas class="track-card-preview-canvas" width="640" height="420" aria-hidden="true"></canvas>
                        </div>
                    </div>
                </div>
            `;
            const previewCanvas = card.querySelector('.track-card-preview-canvas');
            this._returningTrackPreviewCanvases.set(trackKey, previewCanvas);
            card.addEventListener('click', (e) => {
                if (this._suppressCarouselCardClick) {
                    this._suppressCarouselCardClick = false;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                this.setReturningTrackSelection(trackKey, { scrollIntoView: true, syncPreviewTrack: true });
            });
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.setReturningTrackSelection(trackKey, { scrollIntoView: true, syncPreviewTrack: true });
                    if (this.isDesktopTrackSelectionActive() && this._onStart) {
                        this._onStart(trackKey, this.getTrackPreferences(trackKey));
                    }
                    return;
                }

                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    this.moveReturningTrack(-1);
                    return;
                }

                if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    this.moveReturningTrack(1);
                }
            });
            this.trackCarousel.appendChild(card);
            this._returningTrackCards.set(trackKey, card);
        });

        if (this.trackPrevBtn) {
            this.trackPrevBtn.addEventListener('click', () => this.moveReturningTrack(-1));
        }
        if (this.trackNextBtn) {
            this.trackNextBtn.addEventListener('click', () => this.moveReturningTrack(1));
        }

        this.bindReturningPlayerSwipe();

        if (this.trackCarouselShell && typeof ResizeObserver !== 'undefined') {
            this._carouselResizeObserver?.disconnect?.();
            let resizeFrame = 0;
            this._carouselResizeObserver = new ResizeObserver(() => {
                cancelAnimationFrame(resizeFrame);
                resizeFrame = requestAnimationFrame(() => {
                    this.refreshReturningTrackSliderMetrics();
                    this.updateReturningTrackSlider();
                });
            });
            this._carouselResizeObserver.observe(this.trackCarouselShell);
        }

        this.refreshReturningTrackSliderMetrics();
        this.setReturningTrackSelection(this._currentTrackKey || this._returningTrackKeys[0], { scrollIntoView: false });
        this.loadReturningTrackPersonalBests();
    }

    renderReturningTrackPreview(trackKey) {
        if (!trackKey || this._renderedTrackPreviewKeys.has(trackKey)) return;

        const track = TRACKS[trackKey];
        const previewCanvas = this._returningTrackPreviewCanvases.get(trackKey);
        if (!track || !previewCanvas) return;

        const previewGeometry = getTrackPreviewGeometry(trackKey, track, {
            qualityLevel: this._previewQualityLevel,
            frameSkip: this._previewFrameSkip
        });
        renderTrackPreviewCanvas(previewCanvas, {
            trackGeometry: {
                outer: previewGeometry.outer,
                inner: previewGeometry.inner
            },
            startLine: track.startLine,
            startPos: track.startPos,
            startAngle: track.startAngle,
            runHistory: []
        });
        this._renderedTrackPreviewKeys.add(trackKey);
    }

    queueReturningTrackPreview(trackKey) {
        if (!trackKey || this._renderedTrackPreviewKeys.has(trackKey) || this._queuedTrackPreviewKeySet.has(trackKey)) {
            return;
        }

        this._queuedTrackPreviewKeys.push(trackKey);
        this._queuedTrackPreviewKeySet.add(trackKey);
        if (this._pendingTrackPreviewRaf === null) {
            this._pendingTrackPreviewRaf = requestAnimationFrame(() => this.flushQueuedTrackPreviews());
        }
    }

    flushQueuedTrackPreviews() {
        this._pendingTrackPreviewRaf = null;
        const trackKey = this._queuedTrackPreviewKeys.shift();
        if (!trackKey) return;

        this._queuedTrackPreviewKeySet.delete(trackKey);
        this.renderReturningTrackPreview(trackKey);

        if (this._queuedTrackPreviewKeys.length > 0) {
            this._pendingTrackPreviewRaf = requestAnimationFrame(() => this.flushQueuedTrackPreviews());
        }
    }

    updateVisibleTrackPreviews(trackKey) {
        const currentIndex = this._returningTrackKeys.indexOf(trackKey);
        if (currentIndex === -1) return;

        this.renderReturningTrackPreview(trackKey);
        this.queueReturningTrackPreview(this._returningTrackKeys[currentIndex - 1]);
        this.queueReturningTrackPreview(this._returningTrackKeys[currentIndex + 1]);
    }

    refreshReturningTrackSliderMetrics() {
        if (!this.trackCarouselShell) return;

        const shellWidth = this.trackCarouselShell.clientWidth;
        if (shellWidth <= 0) return;

        const nextCenters = new Map();
        for (const [key, card] of this._returningTrackCards.entries()) {
            if (card.offsetWidth <= 0) return;
            nextCenters.set(key, card.offsetLeft + (card.offsetWidth / 2));
        }

        this._trackCarouselShellWidth = shellWidth;
        this._trackCarouselCardCenters = nextCenters;
    }

    _isMobileTrackCarouselView() {
        return window.matchMedia('(max-width: 768px)').matches
            || window.matchMedia('(hover: none) and (pointer: coarse)').matches
            || window.matchMedia('(max-height: 600px) and (orientation: landscape)').matches;
    }

    bindReturningPlayerSwipe() {
        if (!this.trackCarouselShell || !this.trackCarousel) return;

        const applyDragTransform = () => {
            if (!this._carouselTouchDragging) return;

            let d = this._touchDeltaX;
            const idx = this._returningTrackKeys.indexOf(this._selectedReturningTrackKey);
            const last = this._returningTrackKeys.length - 1;
            const rubber = 0.26;
            if (idx <= 0 && d > 0) d *= rubber;
            else if (idx >= last && d < 0) d *= rubber;

            this.setTrackCarouselTranslateX(this._touchCarouselStartTranslate + d);
        };

        this.trackCarouselShell.addEventListener('touchstart', (event) => {
            if (event.touches.length !== 1) return;
            this._touchStartX = event.touches[0].clientX;
            this._touchDeltaX = 0;

            if (!this._isMobileTrackCarouselView()) return;

            this._carouselTouchDragging = true;
            this._touchCarouselStartTranslate = this._trackCarouselTranslateX;
            this.trackCarousel.style.transition = 'none';
        }, { passive: true });

        this.trackCarouselShell.addEventListener('touchmove', (event) => {
            if (this._touchStartX === null || event.touches.length !== 1) return;
            this._touchDeltaX = event.touches[0].clientX - this._touchStartX;
            if (this._carouselTouchDragging) {
                applyDragTransform();
                // Do not tie game-canvas opacity to carousel drag. On WebKit, changing the
                // canvas under #start-overlay's backdrop-filter while the row transforms
                // reliably drops title/PB text for frames (looks like a flash). The canvas
                // is already behind a dimmed overlay here.
            }
        }, { passive: true });

        const finishSwipe = () => {
            const hadTouch = this._touchStartX !== null;
            const delta = this._touchDeltaX;

            if (this._carouselTouchDragging) {
                this.trackCarousel.style.removeProperty('transition');
            }
            this._carouselTouchDragging = false;

            if (!hadTouch) return;

            const mobile = this._isMobileTrackCarouselView();
            const threshold = mobile ? MOBILE_CAROUSEL_SWIPE_PX : 36;

            if (mobile && Math.abs(delta) > 12) {
                this._suppressCarouselCardClick = true;
            }

            if (mobile) {
                if (delta <= -threshold) {
                    this.moveReturningTrack(1);
                } else if (delta >= threshold) {
                    this.moveReturningTrack(-1);
                } else if (Math.abs(delta) > 1.5) {
                    this.updateReturningTrackSlider();
                }
            } else if (delta <= -threshold) {
                this.moveReturningTrack(1);
            } else if (delta >= threshold) {
                this.moveReturningTrack(-1);
            }

            this._touchStartX = null;
            this._touchDeltaX = 0;
        };

        this.trackCarouselShell.addEventListener('touchend', finishSwipe, { passive: true });
        this.trackCarouselShell.addEventListener('touchcancel', finishSwipe, { passive: true });
    }

    bindReturningPlayerKeyboardNavigation() {
        if (this._selectorKeydownHandler) return;

        this._trackModeSpaceCaptureHandler = (event) => {
            if (event.key !== ' ' && event.code !== 'Space') return;
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
            if (!this.isReturningPlayerTrackSelectionOpen()) return;

            const t = event.target;
            if (t instanceof HTMLElement) {
                if (t.isContentEditable) return;
                const tag = t.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            }

            event.preventDefault();
            event.stopPropagation();

            const trackKey = this._selectedReturningTrackKey || this._currentTrackKey;
            if (!trackKey) return;
            const prefs = this.getTrackPreferences(trackKey);
            const nextMode = prefs.mode === TRACK_MODE_PRACTICE ? TRACK_MODE_STANDARD : TRACK_MODE_PRACTICE;
            this.updateSelectedTrackPreferences({ mode: nextMode });
        };
        document.addEventListener('keydown', this._trackModeSpaceCaptureHandler, true);

        this._selectorKeydownHandler = (event) => {
            if (!this.isDesktopTrackSelectionActive()) return;
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

            const target = event.target;
            if (target instanceof HTMLElement) {
                const tagName = target.tagName;
                if (target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
                    return;
                }
            }

            if (event.key === 'Enter') {
                const focusedTrackCard = document.activeElement instanceof HTMLElement
                    ? document.activeElement.closest('.track-card')
                    : null;
                const trackKey = focusedTrackCard?.dataset.trackKey || this._selectedReturningTrackKey;
                if (!trackKey || !this._onStart) return;
                event.preventDefault();
                this.setReturningTrackSelection(trackKey, { scrollIntoView: true });
                this._onStart(trackKey, this.getTrackPreferences(trackKey));
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                this.moveReturningTrack(-1);
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                this.moveReturningTrack(1);
            }
        };

        document.addEventListener('keydown', this._selectorKeydownHandler);
    }

    isDesktopTrackSelectionActive() {
        if (this.isModalActive()) return false;
        if (!this.startOverlay || this.startOverlay.style.display === 'none') return false;
        if (!this.returningPlayerPanel || this.returningPlayerPanel.hidden || this.returningPlayerPanel.style.display === 'none') return false;
        return window.matchMedia('(min-width: 769px)').matches;
    }

    /** Returning-player track picker visible (any viewport); used for Space → toggle trial/session. */
    isReturningPlayerTrackSelectionOpen() {
        if (this.isModalActive()) return false;
        if (!this.startOverlay || this.startOverlay.style.display === 'none') return false;
        if (!this.returningPlayerPanel || this.returningPlayerPanel.hidden || this.returningPlayerPanel.style.display === 'none') return false;
        return true;
    }

    getTrackCarouselKeys() {
        return CONFIG.visibleTrackKeys?.filter((trackKey) => TRACKS[trackKey]) || Object.keys(TRACKS);
    }

    moveReturningTrack(step) {
        if (!this._returningTrackKeys.length) return;

        const currentIndex = Math.max(0, this._returningTrackKeys.indexOf(this._selectedReturningTrackKey));
        const nextIndex = Math.max(0, Math.min(this._returningTrackKeys.length - 1, currentIndex + step));
        const nextTrackKey = this._returningTrackKeys[nextIndex];
        this.setReturningTrackSelection(nextTrackKey, { scrollIntoView: true, syncPreviewTrack: true });
    }

    setReturningTrackSelection(trackKey, { scrollIntoView = false, syncPreviewTrack = false } = {}) {
        if (!trackKey || !this._returningTrackCards.has(trackKey)) return;

        if (this._selectedReturningTrackKey === trackKey) {
            if (scrollIntoView) {
                this.updateReturningTrackSlider();
            }
            this.updateVisibleTrackPreviews(trackKey);
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
            card.classList.toggle('is-active', isActive);
            card.classList.toggle('is-before', key === this._returningTrackKeys[currentIndex - 1]);
            card.classList.toggle('is-after', key === this._returningTrackKeys[currentIndex + 1]);
            card.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        this.updateVisibleTrackPreviews(trackKey);
        this.updateReturningTrackSlider();
        if (syncPreviewTrack && this._onPreviewTrack) {
            this._onPreviewTrack(trackKey);
        }

        this.updateReturningTrackControls();
        this.updateTrackCountIndicator();
        this.updateTrackModeControls();
        this.updateReturningPlayerStartButton();
    }

    updateReturningTrackSlider() {
        if (!this.trackSelectorFrame || !this.trackCarouselShell || !this.trackCarousel || !this._selectedReturningTrackKey) return;

        if (!this._trackCarouselCardCenters.has(this._selectedReturningTrackKey) || this._trackCarouselShellWidth === 0) {
            this.refreshReturningTrackSliderMetrics();
        }

        const activeCardCenter = this._trackCarouselCardCenters.get(this._selectedReturningTrackKey);
        if (!Number.isFinite(activeCardCenter) || this._trackCarouselShellWidth === 0) return;

        this.setTrackCarouselTranslateX((this._trackCarouselShellWidth / 2) - activeCardCenter);
    }

    updateReturningTrackControls() {
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

    updateTrackCountIndicator() {
        if (!this.trackCountIndicator || !this._returningTrackKeys.length) return;

        const currentIndex = Math.max(0, this._returningTrackKeys.indexOf(this._selectedReturningTrackKey));
        const totalTracks = this._returningTrackKeys.length;
        this.trackCountIndicator.textContent = `${currentIndex + 1} / ${totalTracks}`;
        this.trackCountIndicator.setAttribute('aria-label', `Track ${currentIndex + 1} of ${totalTracks}`);
    }

    updateReturningPlayerStartButton() {
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

    updateTrackModeControls() {
        const trackKey = this._selectedReturningTrackKey || this._currentTrackKey;
        if (!trackKey) return;

        const preferences = this.getTrackPreferences(trackKey);
        const isPractice = preferences.mode === TRACK_MODE_PRACTICE;

        if (this.trackModeStandardBtn) {
            this.trackModeStandardBtn.classList.toggle('is-active', !isPractice);
            this.trackModeStandardBtn.setAttribute('aria-pressed', isPractice ? 'false' : 'true');
        }
        if (this.trackModePracticeBtn) {
            this.trackModePracticeBtn.classList.toggle('is-active', isPractice);
            this.trackModePracticeBtn.setAttribute('aria-pressed', isPractice ? 'true' : 'false');
        }
    }

    async loadReturningTrackPersonalBests() {
        const trackKeys = this._returningTrackKeys.slice();
        try {
            const trackDataList = await Promise.all(trackKeys.map((trackKey) => getTrackData(trackKey)));
            trackDataList.forEach((trackData, index) => {
                this.updateReturningTrackPersonalBest(trackKeys[index], trackData.bestTimes?.[TRACK_MODE_STANDARD] ?? null, TRACK_MODE_STANDARD);
                this.updateReturningTrackPersonalBest(trackKeys[index], trackData.bestTimes?.[TRACK_MODE_PRACTICE] ?? null, TRACK_MODE_PRACTICE);
            });
        } catch (error) {
            console.error('Error loading returning-player personal bests:', error);
        }
    }

    refreshReturningTrackPersonalBest(trackKey) {
        if (!trackKey || !this._returningTrackCards.has(trackKey)) return;

        const mode = this.getTrackPreferences(trackKey).mode === TRACK_MODE_PRACTICE
            ? TRACK_MODE_PRACTICE
            : TRACK_MODE_STANDARD;
        const bestTime = this._returningTrackPersonalBests.get(trackKey)?.[mode];
        const card = this._returningTrackCards.get(trackKey);
        const pbEl = card?.querySelector('[data-track-pb]');
        if (!pbEl) return;

        pbEl.textContent = bestTime !== null && bestTime !== undefined
            ? `${bestTime.toFixed(2)}s`
            : '--';
    }

    updateReturningTrackPersonalBest(trackKey, bestTime, mode = TRACK_MODE_STANDARD) {
        if (!trackKey || !this._returningTrackCards.has(trackKey)) return;

        const currentBests = this._returningTrackPersonalBests.get(trackKey) || {
            [TRACK_MODE_STANDARD]: null,
            [TRACK_MODE_PRACTICE]: null
        };
        const currentBest = currentBests[mode];
        const nextBest = bestTime !== null && bestTime !== undefined
            ? (currentBest !== null && currentBest !== undefined ? Math.min(currentBest, bestTime) : bestTime)
            : (currentBest !== null && currentBest !== undefined ? currentBest : null);

        this._returningTrackPersonalBests.set(trackKey, {
            ...currentBests,
            [mode]: nextBest
        });
        this.refreshReturningTrackPersonalBest(trackKey);
    }

    updateStartOverlayMode(hasAnyData) {
        this._startOverlayHasAnyData = Boolean(hasAnyData);
        const showTrackSelection = hasAnyData || this._introAcknowledged;

        if (this.firstTimeMsg) this.firstTimeMsg.style.display = showTrackSelection ? 'none' : 'block';
        if (this.startBtn) {
            this.startBtn.style.display = showTrackSelection ? 'none' : 'inline-flex';
            this.startBtn.textContent = 'Got It';
        }
        if (this.returningPlayerPanel) {
            this.returningPlayerPanel.hidden = !showTrackSelection;
            this.returningPlayerPanel.style.display = showTrackSelection ? 'grid' : 'none';
        }
        document.body.classList.toggle('ftu-onboarding-active', !showTrackSelection);
        this.setStartSelectionMode(showTrackSelection);

        if (showTrackSelection) {
            requestAnimationFrame(() => {
                this.setReturningTrackSelection(
                    this._selectedReturningTrackKey || this._currentTrackKey || this._returningTrackKeys[0],
                    { scrollIntoView: true, syncPreviewTrack: true }
                );
            });
        }
    }

    showStartLights() {
        if (this.startLights) this.startLights.classList.add('visible');
    }

    turnOnCountdownLight(index) {
        const light = this.countdownLights[index];
        if (light) light.classList.add('on');
    }

    hideStartLights() {
        if (this.startLights) this.startLights.classList.remove('visible');
        this.countdownLights.forEach((light) => {
            if (!light) return;
            light.className = 'light';
        });
    }

    showGoMessage() {
        if (this.goMessage) this.goMessage.classList.add('visible');
    }

    showPracticeLapFlash({ lapNumber, lapTime, deltaVsBest, isBest, isNewBest = false }) {
        if (!this.practiceLapFlash || !this.practiceLapFlashLabel || !this.practiceLapFlashTime || !this.practiceLapFlashDelta) return;

        if (this._practiceLapFlashTimer !== null) {
            clearTimeout(this._practiceLapFlashTimer);
            this._practiceLapFlashTimer = null;
        }

        this.practiceLapFlashLabel.textContent = isBest ? `Lap ${lapNumber} Best` : `Lap ${lapNumber}`;
        this.practiceLapFlashTime.textContent = `${lapTime.toFixed(2)}s`;

        if (isNewBest) {
            this.practiceLapFlashDelta.hidden = false;
            this.practiceLapFlashDelta.textContent = 'New PB';
            this.practiceLapFlashDelta.classList.add('is-gain');
            this.practiceLapFlashDelta.classList.remove('is-loss');
        } else if (deltaVsBest === null || deltaVsBest === undefined) {
            this.practiceLapFlashDelta.textContent = '';
            this.practiceLapFlashDelta.hidden = true;
            this.practiceLapFlashDelta.classList.remove('is-gain', 'is-loss');
        } else if (deltaVsBest < -0.005) {
            this.practiceLapFlashDelta.hidden = false;
            this.practiceLapFlashDelta.textContent = `${deltaVsBest.toFixed(2)}s`;
            this.practiceLapFlashDelta.classList.add('is-gain');
            this.practiceLapFlashDelta.classList.remove('is-loss');
        } else if (deltaVsBest > 0.005) {
            this.practiceLapFlashDelta.hidden = false;
            this.practiceLapFlashDelta.textContent = `+${deltaVsBest.toFixed(2)}s`;
            this.practiceLapFlashDelta.classList.add('is-loss');
            this.practiceLapFlashDelta.classList.remove('is-gain');
        } else {
            this.practiceLapFlashDelta.hidden = false;
            this.practiceLapFlashDelta.textContent = 'Even lap';
            this.practiceLapFlashDelta.classList.remove('is-gain', 'is-loss');
        }

        this.practiceLapFlash.classList.add('visible');
        this._practiceLapFlashTimer = setTimeout(() => this.hidePracticeLapFlash(), 1400);
    }

    hidePracticeLapFlash() {
        if (this._practiceLapFlashTimer !== null) {
            clearTimeout(this._practiceLapFlashTimer);
            this._practiceLapFlashTimer = null;
        }
        if (this.practiceLapFlash) this.practiceLapFlash.classList.remove('visible');
    }

    resetCountdown() {
        this.hideStartLights();
        if (this.goMessage) this.goMessage.classList.remove('visible');
        this.hidePracticeLapFlash();
    }

    cancelPendingModalClose() {
        if (!this.modal) return;

        if (this._modalCloseFallbackTimer != null) {
            clearTimeout(this._modalCloseFallbackTimer);
            this._modalCloseFallbackTimer = null;
        }

        if (this._modalCloseTransitionEndHandler) {
            this.modal.removeEventListener('transitionend', this._modalCloseTransitionEndHandler);
            this._modalCloseTransitionEndHandler = null;
        }
    }

    showModal(title, msg, lapData, canShare, options = {}) {
        if (!this.modal || !this.modalTitle) return;

        this.cancelPendingModalClose();
        this.modalTitle.textContent = title;
        this._mainModalIsCrash = Boolean(lapData?.isCrash);
        this._modalKind = options.modalKind || null;
        this.modal.classList.toggle('modal--crash', this._mainModalIsCrash);
        this.modal.classList.toggle('modal--practice-pause', this._modalKind === 'practice-pause' || this._modalKind === 'crash');
        this.modal.classList.toggle('modal--standard-win', this._modalKind === 'standard-win');
        this._modalPrimaryAction = options.primaryAction || this._defaultModalPrimaryAction;
        this._modalSecondaryAction = options.secondaryAction || null;
        this._forceSharePanelVisible = Boolean(options.forceSharePanelVisible);
        this.setModalResetButtonLabel(
            options.primaryActionLabel || 'Race Again',
            Object.prototype.hasOwnProperty.call(options, 'primaryShortcutLabel') ? options.primaryShortcutLabel : 'R',
            options.primaryActionIcon || null
        );
        this.setModalSecondaryButton(
            options.secondaryActionLabel || '',
            Boolean(options.secondaryAction),
            options.secondaryActionIcon || null
        );
        this.setShareButtonContent(options.shareActionLabel || 'save your time', options.shareActionIcon || 'save');

        if (lapData) {
            if (this.modalMsg) this.modalMsg.style.display = 'none';
            if (this.modalStatsRow) {
                if (lapData.variant === 'practice-pause') {
                    this.setPracticePauseStats(
                        lapData.sessionBestTime,
                        lapData.practiceBestTime,
                        lapData.deltaToBest,
                        lapData.isNewBest
                    );
                    delete this.modalStatsRow.dataset.hasRuns;
                    this.modalStatsRow.style.display = 'grid';
                } else if (lapData.variant === 'standard-pause') {
                    this.setStandardPauseStats(
                        lapData.lapTime,
                        lapData.deltaToBest,
                        lapData.bestTime
                    );
                    delete this.modalStatsRow.dataset.hasRuns;
                    this.modalStatsRow.style.display = 'grid';
                } else if (lapData.hideStats) {
                    this.modalStatsRow.replaceChildren();
                    delete this.modalStatsRow.dataset.hasRuns;
                    this.modalStatsRow.style.display = 'none';
                } else if (lapData.isCrash) {
                    this.setModalStatCenter('Impact', `${lapData.impact} KPH`, 'modal-stat-value--crash');
                    this.modalStatsRow.dataset.hasRuns = '';
                    this.modalStatsRow.style.display = 'flex';
                } else if (lapData.variant === 'practice') {
                    this.setModalStatLeftRight(
                        `${lapData.lapCount ?? 0}`,
                        '',
                        lapData.bestTime !== null && lapData.bestTime !== undefined
                            ? `${lapData.bestTime.toFixed(2)}s`
                            : 'No laps',
                        {
                            leftLabel: 'Laps',
                            rightLabel: 'Best'
                        }
                    );
                    this.modalStatsRow.dataset.hasRuns = lapData.listData ? 'true' : '';
                    this.modalStatsRow.style.display = 'flex';
                } else if (lapData.isNewBest) {
                    this.setWinStats(
                        lapData.bestTime,
                        null
                    );
                    this.modalStatsRow.dataset.hasRuns = lapData.lapTimesArray?.length ? 'true' : '';
                    this.modalStatsRow.style.display = 'grid';
                } else {
                    const delta = lapData.lapTime - lapData.bestTime;
                    this.setWinStats(
                        lapData.lapTime,
                        delta
                    );
                    this.modalStatsRow.dataset.hasRuns = lapData.lapTimesArray?.length ? 'true' : '';
                    this.modalStatsRow.style.display = 'grid';
                }
            }
        } else {
            if (this.modalMsg) {
                this.modalMsg.style.display = '';
                this.modalMsg.textContent = msg || '';
            }
            if (this.modalStatsRow) this.modalStatsRow.style.display = 'none';
        }

        if (lapData?.listData !== undefined && this.modalLapTimes) {
            this.renderLapTimesList(this.modalLapTimes, lapData.listData, lapData.bestTime, lapData.lapTime);
        } else if (lapData?.lapTimesArray !== undefined && this.modalLapTimes) {
            this.renderLapTimesList(this.modalLapTimes, lapData.lapTimesArray, lapData.bestTime, lapData.lapTime);
        } else if (lapData && this.modalLapTimes) {
            this.modalLapTimes.replaceChildren();
        }

        if (this.modalMainView && this.modalRunsView) {
            this.showMainModalView();
        }

        if (canShare) {
            this.preparePendingShareLayout();
            this.updateShareState({ visible: true, ready: false, busy: true });
        } else {
            this.clearModalPreview();
            this.updateShareState({ visible: this._forceSharePanelVisible, ready: false, busy: false });
        }
        this.modal.classList.add('active');
        requestAnimationFrame(() => this.activateModalFocusTrap(this.modal));
    }

    showRunsModal(lapTimesArray, bestTime, currentTime = null, returnMode = 'close') {
        if (!this.modal || !this.modalTitle || !this.modalLapTimes || !this.modalRunsView || !this.modalMainView) return;

        this.cancelPendingModalClose();
        const wasActive = this.isModalActive();
        this.modal.classList.remove('modal--crash');
        this.renderLapTimesList(this.modalLapTimes, lapTimesArray, bestTime, currentTime);
        this._runsViewMode = returnMode === 'back' ? 'back' : 'close';
        if (this.backToMainBtn) this.backToMainBtn.textContent = this._runsViewMode === 'back' ? 'Back' : 'Close';
        this.modalMainView.classList.remove('active-view');
        this.modalRunsView.classList.add('active-view');
        this.modal.classList.add('active');
        if (wasActive) {
            if (this.backToMainBtn) this.backToMainBtn.focus();
            return;
        }
        requestAnimationFrame(() => this.activateModalFocusTrap(this.modal));
    }

    closeModal() {
        if (!this.modal) return;

        const modal = this.modal;
        modal.classList.remove('active');

        this.cancelPendingModalClose();

        const cleanupAfterClose = () => {
            this._modalCloseTransitionEndHandler = null;
            modal.classList.remove('modal--crash');
            modal.classList.remove('modal--practice-pause');
            modal.classList.remove('modal--standard-win');
            this._modalKind = null;
            this._modalPrimaryAction = this._defaultModalPrimaryAction;
            this._modalSecondaryAction = null;
            this._forceSharePanelVisible = false;
            this.setModalSecondaryButton('', false, null);
            this.setShareButtonContent('save your time', 'save');
            this.updateShareState({ visible: false, ready: false, busy: false });
            this.clearModalPreview();
            this.releaseModalFocusTrap(modal);
        };

        const onTransitionEnd = (e) => {
            if (e.target !== modal || e.propertyName !== 'opacity') return;
            modal.removeEventListener('transitionend', onTransitionEnd);
            this._modalCloseTransitionEndHandler = null;
            if (this._modalCloseFallbackTimer != null) {
                clearTimeout(this._modalCloseFallbackTimer);
                this._modalCloseFallbackTimer = null;
            }
            cleanupAfterClose();
        };

        this._modalCloseTransitionEndHandler = onTransitionEnd;
        modal.addEventListener('transitionend', onTransitionEnd);
        this._modalCloseFallbackTimer = setTimeout(() => {
            this._modalCloseFallbackTimer = null;
            modal.removeEventListener('transitionend', onTransitionEnd);
            cleanupAfterClose();
        }, 350);
    }

    showMainModalView() {
        this._runsViewMode = 'back';
        if (this.backToMainBtn) this.backToMainBtn.textContent = 'Back';
        if (this.modal) this.modal.classList.toggle('modal--crash', this._mainModalIsCrash);
        if (this.modalRunsView) this.modalRunsView.classList.remove('active-view');
        if (this.modalMainView) this.modalMainView.classList.add('active-view');
    }

    isStandaloneRunsViewActive() {
        return this.isModalActive() && this._runsViewMode === 'close' && Boolean(this.modalRunsView?.classList.contains('active-view'));
    }

    isPauseModalActive() {
        return this.isModalActive() && this._modalKind === 'practice-pause';
    }

    setModalStatCenter(labelText, valueText, valueClass) {
        if (!this.modalStatsRow) return;
        this.modalStatsRow.replaceChildren();
        const center = document.createElement('span');
        center.className = 'modal-stat-center';
        if (labelText) {
            const label = document.createElement('span');
            label.className = 'modal-stat-label';
            label.textContent = labelText;
            center.appendChild(label);
        }
        const value = document.createElement('span');
        value.className = `modal-stat-value${valueClass ? ` ${valueClass}` : ''}`;
        value.textContent = valueText;
        center.appendChild(value);
        this.modalStatsRow.appendChild(center);
    }

    setModalStatLeftRight(lapText, deltaText, bestText, { leftLabel = 'Lap', rightLabel = 'Best' } = {}) {
        if (!this.modalStatsRow) return;
        this.modalStatsRow.replaceChildren();

        const left = document.createElement('span');
        left.className = 'modal-stat-left';
        const lapLabel = document.createElement('span');
        lapLabel.className = 'modal-stat-label';
        lapLabel.textContent = leftLabel;
        left.appendChild(lapLabel);
        const lapVal = document.createElement('span');
        lapVal.className = 'modal-stat-value';
        lapVal.textContent = lapText;
        if (deltaText) {
            const deltaSpan = document.createElement('span');
            deltaSpan.className = 'modal-stat-delta';
            deltaSpan.textContent = deltaText;
            lapVal.appendChild(document.createTextNode(' '));
            lapVal.appendChild(deltaSpan);
        }
        left.appendChild(lapVal);
        this.modalStatsRow.appendChild(left);

        const right = document.createElement('span');
        right.className = 'modal-stat-right';
        const bestLabel = document.createElement('span');
        bestLabel.className = 'modal-stat-label';
        bestLabel.textContent = rightLabel;
        right.appendChild(bestLabel);
        const bestVal = document.createElement('span');
        bestVal.className = 'modal-stat-value modal-stat-value--best';
        bestVal.textContent = bestText;
        right.appendChild(bestVal);
        this.modalStatsRow.appendChild(right);
    }

    setPracticePauseStats(sessionBestTime, _practiceBestTime, deltaToBest, isNewBest = false) {
        if (!this.modalStatsRow) return;
        this.modalStatsRow.replaceChildren();

        const buildStat = (labelText, valueText, valueClass = '') => {
            const stat = document.createElement('span');
            stat.className = 'modal-stat-stack';

            const label = document.createElement('span');
            label.className = 'modal-stat-label';
            label.textContent = labelText;
            stat.appendChild(label);

            const value = document.createElement('span');
            value.className = `modal-stat-value modal-stat-value--compact${valueClass ? ` ${valueClass}` : ''}`;
            value.textContent = valueText;
            stat.appendChild(value);

            return stat;
        };

        const sessionBestText = sessionBestTime === null || sessionBestTime === undefined
            ? '--'
            : `${sessionBestTime.toFixed(2)}s`;
        let deltaText = '--';
        let deltaClass = '';
        if (isNewBest) {
            deltaText = 'New PB';
            deltaClass = 'modal-stat-value--delta-negative';
        } else if (deltaToBest !== null && deltaToBest !== undefined) {
            if (deltaToBest > 0.005) {
                deltaText = `+${deltaToBest.toFixed(2)}s`;
                deltaClass = 'modal-stat-value--delta-positive';
            } else if (deltaToBest < -0.005) {
                deltaText = `${deltaToBest.toFixed(2)}s`;
                deltaClass = 'modal-stat-value--delta-negative';
            } else {
                deltaText = '0.00s';
            }
        }

        this.modalStatsRow.appendChild(buildStat('Session Best', sessionBestText, sessionBestTime !== null && sessionBestTime !== undefined ? 'modal-stat-value--best' : ''));
        this.modalStatsRow.appendChild(buildStat('Delta', deltaText, deltaClass));
    }

    setStandardPauseStats(lapTime, deltaToBest, _bestTime) {
        if (!this.modalStatsRow) return;
        this.modalStatsRow.replaceChildren();

        const buildStat = (labelText, valueText, valueClass = '') => {
            const stat = document.createElement('span');
            stat.className = 'modal-stat-stack';

            const label = document.createElement('span');
            label.className = 'modal-stat-label';
            label.textContent = labelText;
            stat.appendChild(label);

            const value = document.createElement('span');
            value.className = `modal-stat-value modal-stat-value--compact${valueClass ? ` ${valueClass}` : ''}`;
            value.textContent = valueText;
            stat.appendChild(value);

            return stat;
        };

        const lapText = lapTime === null || lapTime === undefined
            ? '--'
            : `${lapTime.toFixed(2)}s`;
        let deltaText = '--';
        let deltaClass = '';
        if (deltaToBest !== null && deltaToBest !== undefined) {
            if (deltaToBest > 0.005) {
                deltaText = `+${deltaToBest.toFixed(2)}s`;
                deltaClass = 'modal-stat-value--delta-positive';
            } else if (deltaToBest < -0.005) {
                deltaText = `${deltaToBest.toFixed(2)}s`;
                deltaClass = 'modal-stat-value--delta-negative';
            } else {
                deltaText = '0.00s';
            }
        }

        this.modalStatsRow.appendChild(buildStat('Lap Time', lapText));
        this.modalStatsRow.appendChild(buildStat('Delta', deltaText, deltaClass));
    }

    setWinStats(lapTime, deltaToBest) {
        if (!this.modalStatsRow) return;
        this.modalStatsRow.replaceChildren();

        const buildStat = (labelText, valueText, valueClass = '') => {
            const stat = document.createElement('span');
            stat.className = 'modal-stat-stack';

            const label = document.createElement('span');
            label.className = 'modal-stat-label';
            label.textContent = labelText;
            stat.appendChild(label);

            const value = document.createElement('span');
            value.className = `modal-stat-value modal-stat-value--compact${valueClass ? ` ${valueClass}` : ''}`;
            value.textContent = valueText;
            stat.appendChild(value);

            return stat;
        };

        const lapText = lapTime !== null && lapTime !== undefined
            ? `${lapTime.toFixed(2)}s`
            : '--';

        let deltaText = '--';
        let deltaClass = '';
        if (deltaToBest !== null && deltaToBest !== undefined) {
            if (deltaToBest > 0.005) {
                deltaText = `+${deltaToBest.toFixed(2)}s`;
                deltaClass = 'modal-stat-value--delta-positive';
            } else if (deltaToBest < -0.005) {
                deltaText = `${deltaToBest.toFixed(2)}s`;
                deltaClass = 'modal-stat-value--delta-negative';
            } else {
                deltaText = '0.00s';
            }
        } else {
            deltaText = 'New PB';
            deltaClass = 'modal-stat-value--delta-negative';
        }

        this.modalStatsRow.appendChild(buildStat('Lap Time', lapText));
        this.modalStatsRow.appendChild(buildStat('Delta', deltaText, deltaClass));
    }

    createModalActionIcon(iconName) {
        if (!iconName) return null;

        const svgNs = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('modal-action-icon');

        const addPath = (d) => {
            const path = document.createElementNS(svgNs, 'path');
            path.setAttribute('d', d);
            svg.appendChild(path);
        };

        const addRect = (x, y, width, height, rx) => {
            const rect = document.createElementNS(svgNs, 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', width);
            rect.setAttribute('height', height);
            rect.setAttribute('rx', rx);
            svg.appendChild(rect);
        };

        const addCircle = (cx, cy, r) => {
            const circle = document.createElementNS(svgNs, 'circle');
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);
            circle.setAttribute('r', r);
            svg.appendChild(circle);
        };

        switch (iconName) {
            case 'play':
                svg.setAttribute('fill', 'currentColor');
                svg.setAttribute('stroke', 'none');
                addPath('M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z');
                break;
            case 'quit':
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('stroke-width', '2');
                svg.setAttribute('stroke-linecap', 'round');
                svg.setAttribute('stroke-linejoin', 'round');
                addPath('M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z');
                addPath('m15 9-6 6');
                addPath('m9 9 6 6');
                break;
            case 'retry':
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('stroke-width', '2');
                svg.setAttribute('stroke-linecap', 'round');
                svg.setAttribute('stroke-linejoin', 'round');
                addPath('M10 2h4');
                addPath('M12 14v-4');
                addPath('M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14L4 17.6');
                addPath('M9 17H4v5');
                break;
            case 'share':
            case 'save':
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('stroke-width', '2');
                svg.setAttribute('stroke-linecap', 'round');
                svg.setAttribute('stroke-linejoin', 'round');
                addPath('M12 15V3');
                addPath('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4');
                addPath('m7 10 5 5 5-5');
                break;
            default:
                return null;
        }

        return svg;
    }

    setModalActionButtonContent(button, label, { shortcutLabel = null, iconName = null } = {}) {
        if (!button) return;

        button.replaceChildren();
        const icon = this.createModalActionIcon(iconName);
        if (icon) button.appendChild(icon);

        const text = document.createElement('span');
        text.className = 'modal-action-label';
        text.textContent = label;
        button.appendChild(text);

        if (!shortcutLabel) return;

        const kbd = document.createElement('kbd');
        kbd.className = 'modal-btn-kbd';
        kbd.textContent = shortcutLabel;
        button.appendChild(document.createTextNode(' '));
        button.appendChild(kbd);
    }

    setModalResetButtonLabel(label, shortcutLabel = 'R', iconName = null) {
        this.setModalActionButtonContent(this.modalResetBtn, label, { shortcutLabel, iconName });
    }

    setModalSecondaryButton(label, isVisible, iconName = null) {
        if (!this.modalSecondaryBtn) return;
        if (isVisible) {
            this.setModalActionButtonContent(this.modalSecondaryBtn, label, { iconName });
        } else {
            this.modalSecondaryBtn.replaceChildren();
        }
        this.modalSecondaryBtn.hidden = !isVisible;
        this.modalSecondaryBtn.style.display = isVisible ? 'inline-flex' : 'none';
    }

    setShareButtonContent(label, iconName = 'save') {
        this.setModalActionButtonContent(this.shareBtn, label, { iconName });
    }

    renderLapTimesList(container, lapTimesArray, bestTime, currentTime) {
        container.replaceChildren();
        if (!lapTimesArray || (Array.isArray(lapTimesArray) && lapTimesArray.length === 0)) return;

        if (!Array.isArray(lapTimesArray)) {
            this.renderPracticeLapTimesList(container, lapTimesArray);
            return;
        }

        const headerRow = document.createElement('div');
        headerRow.className = 'runs-header-row';
        const headerTitle = document.createElement('span');
        headerTitle.className = 'runs-header-title';
        headerTitle.textContent = 'Your 5 PBs';
        headerRow.appendChild(headerTitle);
        container.appendChild(headerRow);

        const list = document.createElement('div');
        list.className = 'lap-times-list';
        lapTimesArray.forEach((time, index) => {
            const isBest = index === 0;
            const isCurrent = Math.abs(time - currentTime) < 0.001;
            const delta = time - bestTime;

            const item = document.createElement('div');
            item.className = `lap-time-item${isBest ? ' best' : ''}${isCurrent ? ' current' : ''}`;

            const runLeft = document.createElement('span');
            runLeft.className = 'run-left';
            const runIndex = document.createElement('span');
            runIndex.className = 'run-index';
            runIndex.textContent = String(index + 1);
            const runTime = document.createElement('span');
            runTime.className = 'run-time';
            runTime.textContent = `${time.toFixed(2)}s`;
            runLeft.appendChild(runIndex);
            runLeft.appendChild(runTime);
            item.appendChild(runLeft);

            const deltaWrap = document.createElement('span');
            deltaWrap.className = 'run-delta-wrap';
            if (!isBest) {
                const deltaSpan = document.createElement('span');
                deltaSpan.className = 'run-delta';
                deltaSpan.textContent = `+${delta.toFixed(2)}s`;
                deltaWrap.appendChild(deltaSpan);
            }
            item.appendChild(deltaWrap);
            list.appendChild(item);
        });

        container.appendChild(list);
    }

    renderPracticeLapTimesList(container, practiceSummary) {
        const summary = practiceSummary || {};
        const laps = Array.isArray(summary.laps) ? summary.laps : [];

        const headerRow = document.createElement('div');
        headerRow.className = 'runs-header-row';

        const headerTitle = document.createElement('span');
        headerTitle.className = 'runs-header-title';
        headerTitle.textContent = 'Session';
        headerRow.appendChild(headerTitle);

        if (summary.bestLap) {
            const bestWrap = document.createElement('div');
            bestWrap.className = 'runs-header-best';

            const bestLabel = document.createElement('span');
            bestLabel.className = 'runs-header-label';
            bestLabel.textContent = 'Best Lap';
            bestWrap.appendChild(bestLabel);

            const bestValue = document.createElement('span');
            bestValue.className = 'runs-header-value';
            bestValue.textContent = `L${summary.bestLap.lapNumber} ${summary.bestLap.time.toFixed(2)}s`;
            bestWrap.appendChild(bestValue);
            headerRow.appendChild(bestWrap);
        }

        container.appendChild(headerRow);

        if (!laps.length) {
            const emptyState = document.createElement('p');
            emptyState.className = 'practice-empty-state';
            emptyState.textContent = 'No completed laps yet.';
            container.appendChild(emptyState);
            return;
        }

        const list = document.createElement('div');
        list.className = 'lap-times-list';

        laps.forEach((lap) => {
            const isBest = summary.bestLap?.lapNumber === lap.lapNumber;
            const item = document.createElement('div');
            item.className = `lap-time-item${isBest ? ' best' : ''}`;

            const runLeft = document.createElement('span');
            runLeft.className = 'run-left';

            const runIndex = document.createElement('span');
            runIndex.className = 'run-index';
            runIndex.textContent = `L${lap.lapNumber}`;

            const runTime = document.createElement('span');
            runTime.className = 'run-time';
            runTime.textContent = `${lap.time.toFixed(2)}s`;

            runLeft.appendChild(runIndex);
            runLeft.appendChild(runTime);
            item.appendChild(runLeft);

            const deltaWrap = document.createElement('span');
            deltaWrap.className = 'run-delta-wrap';
            if (lap.deltaVsBest !== null && lap.deltaVsBest !== undefined) {
                const deltaSpan = document.createElement('span');
                const prefix = lap.deltaVsBest > 0.005 ? '+' : '';
                deltaSpan.className = `run-delta${lap.deltaVsBest < -0.005 ? ' run-delta--negative' : ''}`;
                deltaSpan.textContent = `${prefix}${lap.deltaVsBest.toFixed(2)}s`;
                deltaWrap.appendChild(deltaSpan);
            } else {
                deltaWrap.textContent = '--';
            }
            item.appendChild(deltaWrap);

            list.appendChild(item);
        });

        container.appendChild(list);
    }

    updateShareState({ visible, ready, busy }) {
        if (!visible) {
            this.shareBtn?.classList.remove('pending-share');
        }
        if (this.shareBtn) {
            this.shareBtn.style.display = visible ? 'inline-flex' : 'none';
            this.shareBtn.disabled = !visible || !ready || busy;
        }
    }

    preparePendingShareLayout() {
        if (this.modalPreviewWrap) {
            this.modalPreviewWrap.classList.add('pending-share');
            this.modalPreviewWrap.style.display = 'block';
        }
        if (this.shareBtn) {
            this.shareBtn.classList.add('pending-share');
            this.shareBtn.style.display = 'inline-flex';
        }
    }

    setModalPreviewBlob(blob) {
        if (!blob || !this.modalPreviewImg) return;
        this.clearModalPreview();
        this._modalPreviewUrl = URL.createObjectURL(blob);
        this.modalPreviewImg.src = this._modalPreviewUrl;
        if (this.modalPreviewWrap) this.modalPreviewWrap.style.display = 'block';
        this.modalPreviewWrap?.classList.remove('pending-share');
        this.shareBtn?.classList.remove('pending-share');
    }

    clearModalPreview() {
        if (this._modalPreviewUrl) {
            URL.revokeObjectURL(this._modalPreviewUrl);
            this._modalPreviewUrl = null;
        }
        if (this.modalPreviewImg) this.modalPreviewImg.src = '';
        if (this.modalPreviewWrap) {
            this.modalPreviewWrap.classList.remove('pending-share');
            this.modalPreviewWrap.style.display = 'none';
        }
    }

    showHowToPlayModal() {
        if (!this.htpModal) return;
        this.htpModal.classList.add('active');
        this.activateModalFocusTrap(this.htpModal);
    }

    hideHowToPlayModal() {
        if (!this.htpModal) return;
        this.htpModal.classList.remove('active');
        this.releaseModalFocusTrap(this.htpModal);
    }

    resetTouchControls() {
        if (this.leftTouchBtn) this.leftTouchBtn.classList.remove('active');
        if (this.rightTouchBtn) this.rightTouchBtn.classList.remove('active');
    }

    getFocusables(root) {
        const selector = 'button:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex^="-"])';
        return Array.from(root.querySelectorAll(selector)).filter((el) => el.offsetParent !== null);
    }

    activateModalFocusTrap(modalEl) {
        if (!modalEl) return;

        if (this._modalTrapKeydown) {
            document.removeEventListener('keydown', this._modalTrapKeydown);
            this._modalTrapKeydown = null;
        }

        this._focusBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        this._activeTrapModal = modalEl;
        const focusables = this.getFocusables(modalEl);
        const preferredFocus = modalEl === this.modal && this.modalResetBtn && !this.modalResetBtn.hidden && this.modalResetBtn.offsetParent !== null
            ? this.modalResetBtn
            : null;
        if (preferredFocus) preferredFocus.focus();
        else if (focusables.length) focusables[0].focus();
        this._modalTrapKeydown = (e) => this.handleModalTrapKeydown(e);
        document.addEventListener('keydown', this._modalTrapKeydown);
    }

    releaseModalFocusTrap(modalEl) {
        if (this._activeTrapModal !== modalEl) return;
        document.removeEventListener('keydown', this._modalTrapKeydown);
        this._activeTrapModal = null;
        this._modalTrapKeydown = null;
        if (this._focusBeforeModal && this._focusBeforeModal !== document.body && document.contains(this._focusBeforeModal)) {
            this._focusBeforeModal.focus();
        }
        this._focusBeforeModal = null;
    }

    handleModalTrapKeydown(e) {
        if (!this._activeTrapModal) return;

        if (e.key === 'Escape' && this._activeTrapModal === this.htpModal) {
            e.preventDefault();
            e.stopPropagation();
            this.hideHowToPlayModal();
            return;
        }

        const isDesktopModalNav = window.matchMedia('(min-width: 769px)').matches;
        const actionButtons = isDesktopModalNav
            ? Array.from(this._activeTrapModal.querySelectorAll('.modal-action-row > button'))
                .filter((button) => !button.hidden && button.offsetParent !== null)
            : [];

        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && actionButtons.length > 1) {
            const activeIndex = actionButtons.indexOf(document.activeElement);
            if (activeIndex !== -1) {
                e.preventDefault();
                const direction = e.key === 'ArrowRight' ? 1 : -1;
                const nextIndex = (activeIndex + direction + actionButtons.length) % actionButtons.length;
                actionButtons[nextIndex].focus();
            }
            return;
        }

        if (e.key !== 'Tab') return;
        const focusables = this.getFocusables(this._activeTrapModal);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
            return;
        }
        if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
}
