import { normalizeTrackMode } from './track-mode.js?v=1.90';

export function getTrackResultNamespace(ranked) {
    return ranked ? 'ranked' : 'local';
}

export function resolveTrackPreferenceScope(preferences = {}) {
    const isRanked = Boolean(preferences?.ranked);
    return {
        mode: normalizeTrackMode(preferences?.mode),
        isRanked,
        namespace: getTrackResultNamespace(isRanked)
    };
}
