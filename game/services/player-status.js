const FIRST_SEEN_AT_KEY = 'playerFirstSeenAt';
const RETURNING_PLAYER_DELAY_MS = 24 * 60 * 60 * 1000;

export class PlayerStatusStore {
    constructor(now = () => Date.now()) {
        this.now = now;
    }

    getOrCreateFirstSeenAt() {
        const stored = this.getStoredFirstSeenAt();
        if (stored !== null) return stored;

        const firstSeenAt = this.now();
        this.setStoredFirstSeenAt(firstSeenAt);
        return firstSeenAt;
    }

    isReturningPlayer(hasAnyTrackData) {
        if (!hasAnyTrackData) {
            this.getOrCreateFirstSeenAt();
            return false;
        }

        const firstSeenAt = this.getOrCreateFirstSeenAt();
        return (this.now() - firstSeenAt) > RETURNING_PLAYER_DELAY_MS;
    }

    getStoredFirstSeenAt() {
        try {
            const raw = localStorage.getItem(FIRST_SEEN_AT_KEY);
            if (!raw) return null;
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    setStoredFirstSeenAt(value) {
        try {
            localStorage.setItem(FIRST_SEEN_AT_KEY, String(value));
        } catch (error) {
            // Storage access can fail in privacy-restricted contexts; gameplay should continue.
        }
    }
}
