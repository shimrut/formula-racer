import { CONFIG } from '../config.js?v=1.90';
import { TRACKS } from '../tracks.js?v=1.90';
import { getTrackPreviewGeometry } from '../core/track-assets.js?v=1.90';
import { renderTrackPreviewCanvas } from '../services/share-renderer.js?v=1.90';
import {
    createDailyChallengePresentationEvent,
    resolveTrackPresentation,
    TRACK_PRESENTATION_SURFACES
} from '../track-presentation.js?v=1.90';

export function setTrackCarouselTranslateX(translateX) {
    this._trackCarouselTranslateX = Number.isFinite(translateX)
        ? Math.round(translateX * 100) / 100
        : 0;
    if (this.trackCarousel) {
        this.trackCarousel.style.transform = `translate3d(${this._trackCarouselTranslateX}px, 0, 0)`;
    }
}

export function scheduleTrackCarouselDragTranslateX(translateX) {
    this._pendingCarouselDragTranslateX = translateX;
    if (this._pendingCarouselDragRaf !== null) return;

    this._pendingCarouselDragRaf = requestAnimationFrame(() => {
        this._pendingCarouselDragRaf = null;
        const nextTranslateX = this._pendingCarouselDragTranslateX;
        this._pendingCarouselDragTranslateX = null;
        this.setTrackCarouselTranslateX(nextTranslateX);
    });
}

export function cancelPendingTrackCarouselDrag() {
    if (this._pendingCarouselDragRaf !== null) {
        cancelAnimationFrame(this._pendingCarouselDragRaf);
    }
    this._pendingCarouselDragRaf = null;
    this._pendingCarouselDragTranslateX = null;
}

export function getTrackCarouselKeys() {
    return CONFIG.visibleTrackKeys?.filter((trackKey) => TRACKS[trackKey]) || Object.keys(TRACKS);
}

export function renderReturningTrackPreview(trackKey) {
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
        transparentBackground: true,
        presentation: resolveTrackPresentation(trackKey, {
            surface: TRACK_PRESENTATION_SURFACES.TRACK_PICKER
        }),
        startLine: track.startLine,
        startPos: track.startPos,
        startAngle: track.startAngle,
        runHistory: []
    });
    this._renderedTrackPreviewKeys.add(trackKey);
}

export function renderDailyChallengePreview(trackKey) {
    if (!trackKey) return;

    const track = TRACKS[trackKey];
    const previewCanvas = this.dailyChallengePreviewCanvas;
    if (!track || !previewCanvas) return;

    const presentation = resolveTrackPresentation(trackKey, {
        surface: TRACK_PRESENTATION_SURFACES.DAILY_CHALLENGE_PREVIEW,
        event: createDailyChallengePresentationEvent(this._dailyChallengeSummary)
    });
    const previewRenderKey = `${trackKey}:${presentation.key}`;
    if (this._dailyChallengePreviewTrackKey === previewRenderKey) return;

    const previewGeometry = getTrackPreviewGeometry(trackKey, track, {
        qualityLevel: this._previewQualityLevel,
        frameSkip: this._previewFrameSkip
    });
    renderTrackPreviewCanvas(previewCanvas, {
        trackGeometry: {
            outer: previewGeometry.outer,
            inner: previewGeometry.inner
        },
        transparentBackground: true,
        presentation,
        startLine: track.startLine,
        startPos: track.startPos,
        startAngle: track.startAngle,
        runHistory: []
    });
    this._dailyChallengePreviewTrackKey = previewRenderKey;
}

export function queueReturningTrackPreview(trackKey) {
    if (!trackKey || this._renderedTrackPreviewKeys.has(trackKey) || this._queuedTrackPreviewKeySet.has(trackKey)) {
        return;
    }

    this._queuedTrackPreviewKeys.push(trackKey);
    this._queuedTrackPreviewKeySet.add(trackKey);
    if (this._pendingTrackPreviewRaf === null) {
        this._pendingTrackPreviewRaf = requestAnimationFrame(() => this.flushQueuedTrackPreviews());
    }
}

export function flushQueuedTrackPreviews() {
    this._pendingTrackPreviewRaf = null;
    const trackKey = this._queuedTrackPreviewKeys.shift();
    if (!trackKey) return;

    this._queuedTrackPreviewKeySet.delete(trackKey);
    this.renderReturningTrackPreview(trackKey);

    if (this._queuedTrackPreviewKeys.length > 0) {
        this._pendingTrackPreviewRaf = requestAnimationFrame(() => this.flushQueuedTrackPreviews());
    }
}

export function updateVisibleTrackPreviews(trackKey) {
    const currentIndex = this._returningTrackKeys.indexOf(trackKey);
    if (currentIndex === -1) return;

    this.renderReturningTrackPreview(trackKey);
    this.queueReturningTrackPreview(this._returningTrackKeys[currentIndex - 1]);
    this.queueReturningTrackPreview(this._returningTrackKeys[currentIndex + 1]);
}

export function refreshReturningTrackSliderMetrics() {
    if (!this.trackCarouselShell) return;

    const shellStyle = window.getComputedStyle(this.trackCarouselShell);
    const shellPaddingLeft = parseFloat(shellStyle.paddingLeft) || 0;
    const shellPaddingRight = parseFloat(shellStyle.paddingRight) || 0;
    const shellWidth = this.trackCarouselShell.clientWidth - shellPaddingLeft - shellPaddingRight;
    if (shellWidth <= 0) return;

    const nextCenters = new Map();
    for (const [key, card] of this._returningTrackCards.entries()) {
        if (card.offsetWidth <= 0) return;
        nextCenters.set(key, card.offsetLeft + (card.offsetWidth / 2));
    }

    this._trackCarouselShellWidth = shellWidth;
    this._trackCarouselCardCenters = nextCenters;
}

export function isMobileTrackCarouselView() {
    return window.matchMedia('(max-width: 768px)').matches
        || window.matchMedia('(hover: none) and (pointer: coarse)').matches
        || window.matchMedia('(max-height: 600px) and (orientation: landscape)').matches;
}
