import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from '../modes.js?v=1.91';

export function normalizeTrackMode(mode) {
    return mode === TRACK_MODE_PRACTICE ? TRACK_MODE_PRACTICE : TRACK_MODE_STANDARD;
}
