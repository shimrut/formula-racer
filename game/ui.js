import { CONFIG } from './config.js?v=0.71';
import { TRACKS } from './tracks.js?v=0.80';
import { getTrackData } from './storage.js?v=0.71';
import { buildTrackRuntime } from './core/track-runtime.js?v=0.71';
import { renderTrackPreviewCanvas } from './services/share-renderer.js?v=0.78';

/** Horizontal swipe distance (px) to change track on mobile carousel. */
const MOBILE_CAROUSEL_SWIPE_PX = 42;

export class GameUi {
    constructor({ onOpenTrackSelection, onPreviewTrack, onPreviewPresentation, onStart, onReset, onShare, onShowPersonalBests, previewQualityLevel = 0, previewFrameSkip = 0 }) {
        this.trackChangeBtn = document.getElementById('track-change-btn');
        this.hudBar = document.querySelector('.hud-bar');
        this.hudStatsBtn = document.getElementById('hud-stats-btn');
        this.timeVal = document.getElementById('time-val');
        this.speedVal = document.getElementById('speed-val');
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
        this.sharePanel = document.getElementById('share-panel');
        this.shareBtn = document.getElementById('share-btn');
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
        this.returningStartBtn = document.getElementById('returning-start-btn');
        this.startLights = document.getElementById('start-lights');
        this.goMessage = document.getElementById('go-message');
        this.htpModal = document.getElementById('how-to-play-modal');
        this.closeHtpBtn = document.getElementById('close-htp-btn');
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
        this._mainModalIsCrash = false;
        this._hasPersonalBests = false;
        this._hudPersonalBestsAllowed = true;
        this._runsViewMode = 'back';
        this._startOverlayHasAnyData = false;
        this._introAcknowledged = false;
        this._currentTrackKey = 'circuit';
        this._returningTrackKeys = [];
        this._returningTrackCards = new Map();
        this._returningTrackPersonalBests = new Map();
        this._selectedReturningTrackKey = null;
        this._carouselResizeObserver = null;
        this._touchStartX = null;
        this._touchDeltaX = 0;
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
        this.bindTrackChangeAction(onOpenTrackSelection);
        this.bindModalViewToggles();
        this.bindHowToPlay();
        this.bindPrimaryActions(onStart, onReset, onShare, onShowPersonalBests);
        this.bindReturningPlayerKeyboardNavigation();
        this.updateShareState({ visible: false, ready: false, busy: false });
    }

    setStartOverlayActive(isActive) {
        document.body.classList.toggle('start-overlay-active', Boolean(isActive));
    }

    setStartSelectionMode(isActive) {
        document.body.classList.toggle('start-selection-active', Boolean(isActive));
    }

    anchorHudBar() {
        const header = document.querySelector('header');
        const hudBar = document.querySelector('.hud-bar');
        if (!header || !hudBar) return;

        const setHudTop = () => {
            const bottom = header.getBoundingClientRect().bottom;
            hudBar.style.top = `${bottom + 12}px`;
        };
        setHudTop();
        new ResizeObserver(setHudTop).observe(header);
    }

    bindTrackChangeAction(onOpenTrackSelection) {
        if (this.trackChangeBtn && onOpenTrackSelection) {
            this.trackChangeBtn.addEventListener('click', onOpenTrackSelection);
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

    bindPrimaryActions(onStart, onReset, onShare, onShowPersonalBests) {
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
                onStart(this._selectedReturningTrackKey || this._currentTrackKey || this._returningTrackKeys[0]);
            });
        }
        if (this.hudStatsBtn && onShowPersonalBests) {
            this.hudStatsBtn.addEventListener('click', onShowPersonalBests);
        }
        if (this.modalResetBtn && onReset) {
            this.modalResetBtn.addEventListener('click', onReset);
        }
        if (this.shareBtn && onShare) {
            this.shareBtn.addEventListener('click', onShare);
        }
    }

    bindSteeringControls({ onLeftDown, onLeftUp, onRightDown, onRightUp }) {
        this.bindTouchButton(this.leftTouchBtn, onLeftDown, onLeftUp);
        this.bindTouchButton(this.rightTouchBtn, onRightDown, onRightUp);
    }

    bindTouchButton(button, onDown, onUp) {
        if (!button) return;

        const down = (e) => {
            e.preventDefault();
            if (onDown) onDown();
            button.classList.add('active');
        };
        const up = (e) => {
            e.preventDefault();
            if (onUp) onUp();
            button.classList.remove('active');
        };

        button.addEventListener('touchstart', down, { passive: false });
        button.addEventListener('touchend', up, { passive: false });
        button.addEventListener('touchcancel', up, { passive: false });
        button.addEventListener('mousedown', down);
        button.addEventListener('mouseup', up);
        button.addEventListener('mouseleave', up);
    }

    setTrackSelection(trackKey) {
        if (!trackKey) return;

        this._currentTrackKey = trackKey;
        if (this.trackChangeBtn) {
            this.trackChangeBtn.textContent = 'Change Track';
        }
        this.setReturningTrackSelection(trackKey, { scrollIntoView: true });
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
            this._lastSpeedText = speedText;
        }
    }

    resetHud() {
        if (this.timeVal) this.timeVal.textContent = '0.00';
        if (this.speedVal) this.speedVal.textContent = '0';
        this._lastTimeText = '0.00';
        this._lastSpeedText = '0';
    }

    /** PB shown on track cards after bulk load; used to avoid HUD flicker while switching tracks. */
    getCachedPersonalBestForTrack(trackKey) {
        if (!trackKey || !this._returningTrackPersonalBests.has(trackKey)) return null;
        const v = this._returningTrackPersonalBests.get(trackKey);
        return v !== null && v !== undefined ? v : null;
    }

    setBestTime(bestLapTime) {
        if (!this.bestTimeDisplay || !this.bestTimeVal) return;

        const currentTrackKey = this._currentTrackKey;
        if (currentTrackKey && bestLapTime !== null && bestLapTime !== undefined) {
            this.updateReturningTrackPersonalBest(currentTrackKey, bestLapTime);
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

        this._returningTrackKeys.forEach((trackKey, index) => {
            const track = TRACKS[trackKey];
            if (!track) return;

            const card = document.createElement('article');
            card.className = 'track-card';
            card.dataset.trackKey = trackKey;
            card.setAttribute('role', 'option');
            card.setAttribute('aria-selected', 'false');
            card.tabIndex = 0;
            card.innerHTML = `
                <div class="modal-card track-card-modal">
                    <div class="track-card-modal-view">
                        <h2 class="track-card-modal-title">${track.name}</h2>
                        <div class="modal-stats-row track-card-stats-row">
                            <span class="modal-stat-center">
                                <span class="modal-stat-label">Best</span>
                                <span class="modal-stat-value modal-stat-value--best" data-track-pb>--</span>
                            </span>
                        </div>
                        <div class="modal-preview-wrap track-card-preview-wrap">
                            <canvas class="track-card-preview-canvas" width="640" height="420" aria-hidden="true"></canvas>
                        </div>
                    </div>
                </div>
            `;
            const previewCanvas = card.querySelector('.track-card-preview-canvas');
            const previewRuntime = buildTrackRuntime(track, {
                qualityLevel: this._previewQualityLevel,
                frameSkip: this._previewFrameSkip
            });
            renderTrackPreviewCanvas(previewCanvas, {
                trackGeometry: {
                    outer: previewRuntime.outer,
                    inner: previewRuntime.inner
                },
                startLine: track.startLine,
                startPos: track.startPos,
                startAngle: track.startAngle,
                runHistory: []
            });
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
                        this._onStart(trackKey);
                    }
                    return;
                }

                if (event.key === ' ') {
                    event.preventDefault();
                    this.setReturningTrackSelection(trackKey, { scrollIntoView: true, syncPreviewTrack: true });
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
            this._carouselResizeObserver = new ResizeObserver(() => this.updateReturningTrackSlider());
            this._carouselResizeObserver.observe(this.trackCarouselShell);
        }

        this.setReturningTrackSelection(this._currentTrackKey || this._returningTrackKeys[0], { scrollIntoView: false });
        this.loadReturningTrackPersonalBests();
    }

    _isMobileTrackCarouselView() {
        return window.matchMedia('(max-width: 768px)').matches
            || window.matchMedia('(hover: none) and (pointer: coarse)').matches
            || window.matchMedia('(max-height: 600px) and (orientation: landscape)').matches;
    }

    bindReturningPlayerSwipe() {
        if (!this.trackCarouselShell || !this.trackCarousel) return;

        const readCarouselTranslateX = () => {
            const t = window.getComputedStyle(this.trackCarousel).transform;
            if (!t || t === 'none') return 0;
            return new DOMMatrixReadOnly(t).m41;
        };

        const applyDragTransform = () => {
            if (!this._carouselTouchDragging) return;

            let d = this._touchDeltaX;
            const idx = this._returningTrackKeys.indexOf(this._selectedReturningTrackKey);
            const last = this._returningTrackKeys.length - 1;
            const rubber = 0.26;
            if (idx <= 0 && d > 0) d *= rubber;
            else if (idx >= last && d < 0) d *= rubber;

            this.trackCarousel.style.transform =
                `translate3d(${this._touchCarouselStartTranslate + d}px, 0, 0)`;
        };

        this.trackCarouselShell.addEventListener('touchstart', (event) => {
            if (event.touches.length !== 1) return;
            this._touchStartX = event.touches[0].clientX;
            this._touchDeltaX = 0;

            if (!this._isMobileTrackCarouselView()) return;

            this._carouselTouchDragging = true;
            this._touchCarouselStartTranslate = readCarouselTranslateX();
            this.trackCarousel.style.transition = 'none';
        }, { passive: true });

        this.trackCarouselShell.addEventListener('touchmove', (event) => {
            if (this._touchStartX === null || event.touches.length !== 1) return;
            this._touchDeltaX = event.touches[0].clientX - this._touchStartX;
            if (this._carouselTouchDragging) {
                applyDragTransform();
                const t = Math.min(1, Math.abs(this._touchDeltaX) / MOBILE_CAROUSEL_SWIPE_PX);
                const opacity = 1 - t * 0.58;
                this._onPreviewPresentation?.({ opacity, instant: true });
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
                let changedTrack = false;
                if (delta <= -threshold) {
                    this.moveReturningTrack(1);
                    changedTrack = true;
                } else if (delta >= threshold) {
                    this.moveReturningTrack(-1);
                    changedTrack = true;
                } else if (Math.abs(delta) > 1.5) {
                    this.updateReturningTrackSlider();
                }
                if (!changedTrack) {
                    this._onPreviewPresentation?.({ opacity: 1, instant: false });
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
                this._onStart(trackKey);
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
            if (syncPreviewTrack && this._onPreviewTrack) {
                this._onPreviewTrack(trackKey);
            }
            this.updateReturningTrackControls();
            this.updateTrackCountIndicator();
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

        this.updateReturningTrackSlider();
        if (syncPreviewTrack && this._onPreviewTrack) {
            this._onPreviewTrack(trackKey);
        }

        this.updateReturningTrackControls();
        this.updateTrackCountIndicator();
        this.updateReturningPlayerStartButton();
    }

    updateReturningTrackSlider() {
        if (!this.trackSelectorFrame || !this.trackCarouselShell || !this.trackCarousel || !this._selectedReturningTrackKey) return;

        const activeCard = this._returningTrackCards.get(this._selectedReturningTrackKey);
        if (!activeCard) return;

        const frameRect = this.trackSelectorFrame.getBoundingClientRect();
        const cardRect = activeCard.getBoundingClientRect();
        const currentTransform = window.getComputedStyle(this.trackCarousel).transform;
        const currentTranslateX = currentTransform && currentTransform !== 'none'
            ? new DOMMatrixReadOnly(currentTransform).m41
            : 0;
        const targetCenter = frameRect.left + (frameRect.width / 2);
        const currentCenter = cardRect.left + (cardRect.width / 2);
        const translateX = currentTranslateX + (targetCenter - currentCenter);

        this.trackCarousel.style.transform = `translate3d(${translateX}px, 0, 0)`;
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
        if (this.returningPlayerHeading) {
            this.returningPlayerHeading.textContent = trackName;
        }
        if (this.returningStartBtn) {
            this.returningStartBtn.textContent = 'Start Your Engine';
        }
    }

    async loadReturningTrackPersonalBests() {
        const trackKeys = this._returningTrackKeys.slice();
        try {
            const trackDataList = await Promise.all(trackKeys.map((trackKey) => getTrackData(trackKey)));
            trackDataList.forEach((trackData, index) => {
                this.updateReturningTrackPersonalBest(trackKeys[index], trackData.bestTime);
            });
        } catch (error) {
            console.error('Error loading returning-player personal bests:', error);
        }
    }

    updateReturningTrackPersonalBest(trackKey, bestTime) {
        if (!trackKey || !this._returningTrackCards.has(trackKey)) return;

        const currentBest = this._returningTrackPersonalBests.get(trackKey);
        const nextBest = bestTime !== null && bestTime !== undefined
            ? (currentBest !== null && currentBest !== undefined ? Math.min(currentBest, bestTime) : bestTime)
            : (currentBest !== null && currentBest !== undefined ? currentBest : null);

        this._returningTrackPersonalBests.set(trackKey, nextBest);
        const card = this._returningTrackCards.get(trackKey);
        const pbEl = card?.querySelector('[data-track-pb]');
        if (!pbEl) return;

        pbEl.textContent = nextBest !== null && nextBest !== undefined
            ? `${nextBest.toFixed(2)}s`
            : '--';
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

    resetCountdown() {
        this.hideStartLights();
        if (this.goMessage) this.goMessage.classList.remove('visible');
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

    showModal(title, msg, lapData, canShare) {
        if (!this.modal || !this.modalTitle) return;

        this.cancelPendingModalClose();
        this.modalTitle.textContent = title;
        this._mainModalIsCrash = Boolean(lapData?.isCrash);
        this.modal.classList.toggle('modal--crash', this._mainModalIsCrash);

        if (lapData) {
            if (this.modalMsg) this.modalMsg.style.display = 'none';
            if (this.modalStatsRow) {
                if (lapData.isCrash) {
                    this.setModalStatCenter('Impact', `${lapData.impact} KPH`, 'modal-stat-value--crash');
                    this.modalStatsRow.dataset.hasRuns = '';
                } else if (lapData.isNewBest) {
                    this.setModalStatCenter('', `${lapData.bestTime.toFixed(2)}s`, 'modal-stat-value--best');
                    this.modalStatsRow.dataset.hasRuns = lapData.lapTimesArray?.length ? 'true' : '';
                } else {
                    const delta = lapData.lapTime - lapData.bestTime;
                    const deltaText = delta > 0.005 ? `+${delta.toFixed(2)}s` : '';
                    this.setModalStatLeftRight(
                        `${lapData.lapTime.toFixed(2)}s`,
                        deltaText,
                        `${lapData.bestTime.toFixed(2)}s`
                    );
                    this.modalStatsRow.dataset.hasRuns = lapData.lapTimesArray?.length ? 'true' : '';
                }
                this.modalStatsRow.style.display = 'flex';
            }
        } else {
            if (this.modalMsg) {
                this.modalMsg.style.display = '';
                this.modalMsg.textContent = msg || '';
            }
            if (this.modalStatsRow) this.modalStatsRow.style.display = 'none';
        }

        if (lapData?.lapTimesArray !== undefined && this.modalLapTimes) {
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
            this.updateShareState({ visible: false, ready: false, busy: false });
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

    setModalStatLeftRight(lapText, deltaText, bestText) {
        if (!this.modalStatsRow) return;
        this.modalStatsRow.replaceChildren();

        const left = document.createElement('span');
        left.className = 'modal-stat-left';
        const lapLabel = document.createElement('span');
        lapLabel.className = 'modal-stat-label';
        lapLabel.textContent = 'Lap';
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
        bestLabel.textContent = 'Best';
        right.appendChild(bestLabel);
        const bestVal = document.createElement('span');
        bestVal.className = 'modal-stat-value modal-stat-value--best';
        bestVal.textContent = bestText;
        right.appendChild(bestVal);
        this.modalStatsRow.appendChild(right);
    }

    renderLapTimesList(container, lapTimesArray, bestTime, currentTime) {
        container.replaceChildren();
        if (!lapTimesArray || lapTimesArray.length === 0) return;

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

    updateShareState({ visible, ready, busy }) {
        if (!visible) {
            this.sharePanel?.classList.remove('pending-share');
        }
        if (this.sharePanel) {
            this.sharePanel.style.display = visible ? 'flex' : 'none';
        }
        if (this.shareBtn) {
            this.shareBtn.disabled = !visible || !ready || busy;
        }
    }

    preparePendingShareLayout() {
        if (this.modalPreviewWrap) {
            this.modalPreviewWrap.classList.add('pending-share');
            this.modalPreviewWrap.style.display = 'block';
        }
        if (this.sharePanel) {
            this.sharePanel.classList.add('pending-share');
            this.sharePanel.style.display = 'flex';
        }
    }

    setModalPreviewBlob(blob) {
        if (!blob || !this.modalPreviewImg) return;
        this.clearModalPreview();
        this._modalPreviewUrl = URL.createObjectURL(blob);
        this.modalPreviewImg.src = this._modalPreviewUrl;
        if (this.modalPreviewWrap) this.modalPreviewWrap.style.display = 'block';
        this.modalPreviewWrap?.classList.remove('pending-share');
        this.sharePanel?.classList.remove('pending-share');
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
        if (focusables.length) focusables[0].focus();
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
        if (e.key !== 'Tab' || !this._activeTrapModal) return;
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
