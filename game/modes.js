export const TRACK_MODE_STANDARD = 'standard';
export const TRACK_MODE_PRACTICE = 'practice';

export const TRACK_MODE_LABELS = {
    [TRACK_MODE_STANDARD]: 'Time trial',
    [TRACK_MODE_PRACTICE]: 'Session'
};

export const DEFAULT_TRACK_PREFERENCES = {
    mode: TRACK_MODE_STANDARD,
    ranked: true
};
