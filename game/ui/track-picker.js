import { TRACK_MODE_LABELS, TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from '../modes.js?v=1.91';
import { TRACKS } from '../tracks.js?v=1.91';
import { getTrackPreferences } from '../storage.js?v=1.91';

/** Horizontal swipe distance (px) to change track on mobile carousel. */
const MOBILE_CAROUSEL_SWIPE_PX = 42;

export function bindReturningPlayerCarousel() {
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

    this._returningTrackKeys.forEach((trackKey) => {
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
                <button class="track-card-ranked-btn" type="button" data-track-ranked-toggle aria-pressed="false">LOCAL</button>
                <div class="track-card-modal-view">
                    <div class="track-card-modal-content">
                        <h2 class="track-card-modal-title">${track.name}</h2>
                        <div class="modal-stats-row track-card-stats-row">
                            <span class="modal-stat-left">
                                <span class="modal-stat-label">Best</span>
                                <span class="modal-stat-value modal-stat-value--best" data-track-pb>--</span>
                            </span>
                            <button class="modal-stat-right modal-stat-button track-card-rank-btn" type="button" data-track-rank-action disabled>
                                <span class="modal-stat-label">Rank</span>
                                <span class="modal-stat-value modal-stat-value--rank" data-track-rank>--</span>
                            </button>
                        </div>
                    </div>
                    <div class="track-card-preview-wrap">
                        <canvas class="track-card-preview-canvas" width="448" height="294" aria-hidden="true"></canvas>
                    </div>
                </div>
            </div>
        `;
        const rankedToggleBtn = card.querySelector('[data-track-ranked-toggle]');
        if (rankedToggleBtn) {
            rankedToggleBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (this.isScoreModeIntroVisible()) return;
                this.setReturningTrackSelection(trackKey, { scrollIntoView: true, syncPreviewTrack: true });
                const preferences = this.getTrackPreferences(trackKey);
                this.updateSelectedTrackPreferences({ ranked: !preferences.ranked });
            });
            rankedToggleBtn.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.stopPropagation();
                }
            });
        }
        const trackRankBtn = card.querySelector('[data-track-rank-action]');
        if (trackRankBtn) {
            trackRankBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (this.isScoreModeIntroVisible()) return;
                this.openTrackCardLeaderboard(trackKey);
            });
            trackRankBtn.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.stopPropagation();
                }
            });
        }
        const previewCanvas = card.querySelector('.track-card-preview-canvas');
        this._returningTrackPreviewCanvases.set(trackKey, previewCanvas);
        card.addEventListener('click', (event) => {
            if (this._suppressCarouselCardClick) {
                this._suppressCarouselCardClick = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (this.isScoreModeIntroVisible()) return;
            this.setReturningTrackSelection(trackKey, { scrollIntoView: true, syncPreviewTrack: true });
        });
        card.addEventListener('keydown', (event) => {
            if (this.isScoreModeIntroVisible()) {
                event.preventDefault();
                this.scoreModeIntroDismiss?.focus();
                return;
            }
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
        this.trackPrevBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible()) return;
            this.moveReturningTrack(-1);
        });
    }
    if (this.trackNextBtn) {
        this.trackNextBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible()) return;
            this.moveReturningTrack(1);
        });
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

export function bindReturningPlayerSwipe() {
    if (!this.trackCarouselShell || !this.trackCarousel) return;

    const applyDragTransform = () => {
        if (!this._carouselTouchDragging) return;

        let deltaX = this._touchDeltaX;
        const index = this._returningTrackKeys.indexOf(this._selectedReturningTrackKey);
        const lastIndex = this._returningTrackKeys.length - 1;
        const rubberBand = 0.26;
        if (index <= 0 && deltaX > 0) deltaX *= rubberBand;
        else if (index >= lastIndex && deltaX < 0) deltaX *= rubberBand;

        this.scheduleTrackCarouselDragTranslateX(this._touchCarouselStartTranslate + deltaX);
    };

    this.trackCarouselShell.addEventListener('touchstart', (event) => {
        if (this.isScoreModeIntroVisible()) return;
        if (event.touches.length !== 1) return;
        this._touchStartX = event.touches[0].clientX;
        this._touchDeltaX = 0;

        if (!this._isMobileTrackCarouselView()) return;

        this._carouselTouchDragging = true;
        this._touchCarouselStartTranslate = this._trackCarouselTranslateX;
        this.cancelPendingTrackCarouselDrag();
        this.trackCarousel.style.transition = 'none';
    }, { passive: true });

    this.trackCarouselShell.addEventListener('touchmove', (event) => {
        if (this._touchStartX === null || event.touches.length !== 1) return;
        this._touchDeltaX = event.touches[0].clientX - this._touchStartX;
        if (this._carouselTouchDragging) {
            applyDragTransform();
        }
    }, { passive: true });

    const finishSwipe = () => {
        if (this.isScoreModeIntroVisible()) {
            this._touchStartX = null;
            this._touchDeltaX = 0;
            this._carouselTouchDragging = false;
            this.cancelPendingTrackCarouselDrag();
            this.trackCarousel.style.removeProperty('transition');
            return;
        }
        const hadTouch = this._touchStartX !== null;
        const deltaX = this._touchDeltaX;

        if (this._carouselTouchDragging) {
            this.cancelPendingTrackCarouselDrag();
            this.trackCarousel.style.removeProperty('transition');
        }
        this._carouselTouchDragging = false;

        if (!hadTouch) return;

        const isMobile = this._isMobileTrackCarouselView();
        const threshold = isMobile ? MOBILE_CAROUSEL_SWIPE_PX : 36;

        if (isMobile && Math.abs(deltaX) > 12) {
            this._suppressCarouselCardClick = true;
        }

        if (isMobile) {
            if (deltaX <= -threshold) {
                this.moveReturningTrack(1);
            } else if (deltaX >= threshold) {
                this.moveReturningTrack(-1);
            } else if (Math.abs(deltaX) > 1.5) {
                this.updateReturningTrackSlider();
            }
        } else if (deltaX <= -threshold) {
            this.moveReturningTrack(1);
        } else if (deltaX >= threshold) {
            this.moveReturningTrack(-1);
        }

        this._touchStartX = null;
        this._touchDeltaX = 0;
    };

    this.trackCarouselShell.addEventListener('touchend', finishSwipe, { passive: true });
    this.trackCarouselShell.addEventListener('touchcancel', finishSwipe, { passive: true });
}

export function bindReturningPlayerKeyboardNavigation() {
    if (this._selectorKeydownHandler) return;

    this._selectorKeydownHandler = (event) => {
        if (!this.isDesktopTrackSelectionActive()) return;
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        if (this.isScoreModeIntroVisible()) {
            if (event.target instanceof HTMLElement && this.scoreModeIntro?.contains(event.target)) {
                return;
            }
            event.preventDefault();
            this.scoreModeIntroDismiss?.focus();
            return;
        }

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

export function isDesktopTrackSelectionActive() {
    if (this.isModalActive()) return false;
    if (!this.startOverlay || this.startOverlay.style.display === 'none') return false;
    if (!this.returningPlayerPanel || this.returningPlayerPanel.hidden || this.returningPlayerPanel.style.display === 'none') return false;
    return window.matchMedia('(min-width: 769px)').matches;
}

export function updateTrackModeControls() {
    const trackKey = this._selectedReturningTrackKey || this._currentTrackKey;
    if (!trackKey) return;

    const activeMode = this.getSelectedTrackMode(trackKey);
    const selectedOverlay = this._startOverlaySelection;
    const isStandardSelected = selectedOverlay === TRACK_MODE_STANDARD;
    const isPracticeSelected = selectedOverlay === TRACK_MODE_PRACTICE;
    const isDailySelected = selectedOverlay === 'daily';

    if (this.modeSelectStandardBtn) {
        this.modeSelectStandardBtn.classList.toggle('is-active', isStandardSelected);
        this.modeSelectStandardBtn.setAttribute('aria-pressed', isStandardSelected ? 'true' : 'false');
    }
    if (this.modeSelectPracticeBtn) {
        this.modeSelectPracticeBtn.classList.toggle('is-active', isPracticeSelected);
        this.modeSelectPracticeBtn.setAttribute('aria-pressed', isPracticeSelected ? 'true' : 'false');
    }
    if (this.modeSelectDailyBtn) {
        this.modeSelectDailyBtn.classList.toggle('is-active', isDailySelected);
        this.modeSelectDailyBtn.setAttribute('aria-pressed', isDailySelected ? 'true' : 'false');
    }
    if (this.changeTrackModeBtn) {
        const modeLabel = TRACK_MODE_LABELS[activeMode] || 'Time trial';
        this.changeTrackModeBtn.setAttribute('aria-label', `Change mode. Current mode: ${modeLabel}.`);
        this.changeTrackModeBtn.title = `Change mode from ${modeLabel}`;
    }
}
