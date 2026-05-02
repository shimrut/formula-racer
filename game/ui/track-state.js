import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from '../modes.js?v=1.90';
import {
    getTrackPreferences as readTrackPreferences,
    saveTrackPreferences
} from '../storage.js?v=1.90';
import { normalizeTrackMode } from './track-mode.js?v=1.90';

/**
 * @param {object} [options]
 * @param {boolean} [options.refreshRankSnapshots=true] Set false when syncing engine track (e.g. loadTrack) — carousel rank fetch is for the picker only.
 */
export function setTrackSelection(trackKey, { refreshRankSnapshots = true } = {}) {
    if (!trackKey) return;

    this._currentTrackKey = trackKey;
    this.setReturningTrackSelection(trackKey, { scrollIntoView: true, refreshRankSnapshots });
}

export function getTrackPreferences(trackKey) {
    if (!trackKey) {
        return readTrackPreferences(this._selectedReturningTrackKey || this._currentTrackKey);
    }
    if (!this._trackPreferences.has(trackKey)) {
        this._trackPreferences.set(trackKey, readTrackPreferences(trackKey));
    }
    return this._trackPreferences.get(trackKey);
}

export function updateSelectedTrackPreferences(nextPreferences) {
    const trackKey = this._selectedReturningTrackKey || this._currentTrackKey;
    if (!trackKey) return;

    const updated = saveTrackPreferences(trackKey, nextPreferences);
    this._trackPreferences.set(trackKey, updated);
    this.refreshReturningTrackPersonalBest(trackKey);
    // The ranked toggle only affects this card — do not prefetch neighbor tracks.
    this.updateVisibleTrackRanks(trackKey, { prefetchNeighbors: false });
    this.updateTrackModeControls();
    this.updateReturningPlayerStartButton();
}

export function getSelectedTrackMode(trackKey = this._selectedReturningTrackKey || this._currentTrackKey) {
    const preferences = this.getTrackPreferences(trackKey);
    return normalizeTrackMode(preferences.mode);
}

export function createEmptyTrackPersonalBestState() {
    return {
        local: {
            [TRACK_MODE_STANDARD]: null,
            [TRACK_MODE_PRACTICE]: null
        },
        ranked: {
            [TRACK_MODE_STANDARD]: null,
            [TRACK_MODE_PRACTICE]: null
        }
    };
}
