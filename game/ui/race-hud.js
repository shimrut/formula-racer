import { resolveTrackPreferenceScope } from './track-scope.js?v=1.91';

/** Speed readout: cap DOM writes (lap timer updates every frame when centiseconds change). */
const HUD_SPEED_MIN_MS = 1000 / 15;

export function syncHud({ time, speed, force = false }) {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const timeText = time.toFixed(2);
    const speedText = Math.round(speed * 20).toString();
    const useLapTimer = this._hudPrimaryMetricMode === 'time';

    if (force) {
        if (useLapTimer) {
            if (this.timeVal) this.timeVal.textContent = timeText;
            this._lastTimeText = timeText;
        }
        if (this.speedVal) this.speedVal.textContent = speedText;
        if (this.mobileSpeedVal) this.mobileSpeedVal.textContent = speedText;
        this._lastSpeedText = speedText;
        this._lastHudSpeedWrite = now;
        return;
    }

    if (useLapTimer && this._lastTimeText !== timeText) {
        if (this.timeVal) this.timeVal.textContent = timeText;
        this._lastTimeText = timeText;
    }

    const speedDue = !this._lastHudSpeedWrite || (now - this._lastHudSpeedWrite) >= HUD_SPEED_MIN_MS;
    if (speedDue && this._lastSpeedText !== speedText) {
        if (this.speedVal) this.speedVal.textContent = speedText;
        if (this.mobileSpeedVal) this.mobileSpeedVal.textContent = speedText;
        this._lastSpeedText = speedText;
        this._lastHudSpeedWrite = now;
    }
}

export function resetHud() {
    if (this.timeLabel) this.timeLabel.textContent = 'LAP';
    if (this.timeVal) this.timeVal.textContent = '0.00';
    if (this.speedVal) this.speedVal.textContent = '0';
    if (this.mobileSpeedVal) this.mobileSpeedVal.textContent = '0';
    this._hudPrimaryMetricMode = 'time';
    this._lastTimeText = '0.00';
    this._lastSpeedText = '0';
    this._lastHudSpeedWrite = undefined;
}

export function setHudPrimaryMetric({ label = 'LAP', value = '0.00', useTimer = true, visible = true } = {}) {
    if (!this.timeDisplay || !this.timeVal) return;

    this.setHudLapTimeVisible(visible);
    if (this.timeLabel) this.timeLabel.textContent = label;
    this._hudPrimaryMetricMode = useTimer ? 'time' : 'custom';

    if (!useTimer) {
        const nextValue = String(value);
        this.timeVal.textContent = nextValue;
        this._lastTimeText = nextValue;
    }
}

export function setHudLapTimeVisible(isVisible) {
    if (!this.timeDisplay) return;
    this.timeDisplay.style.display = isVisible ? '' : 'none';
}

export function setHudBestMetric({ label = 'BEST', value = '--', visible = false } = {}) {
    if (!this.bestTimeDisplay || !this.bestTimeVal) return;

    if (visible) {
        if (this.bestTimeLabel) this.bestTimeLabel.textContent = label;
        this.bestTimeVal.textContent = value;
        this.bestTimeDisplay.style.display = 'flex';
        if (this.bestTimeDivider) this.bestTimeDivider.style.display = 'block';
        return;
    }

    if (this.bestTimeLabel) this.bestTimeLabel.textContent = 'BEST';
    this.bestTimeVal.textContent = '--';
    this.bestTimeDisplay.style.display = 'none';
    if (this.bestTimeDivider) this.bestTimeDivider.style.display = 'none';
}

/** PB shown on track cards after bulk load; used to avoid HUD flicker while switching tracks. */
export function getCachedPersonalBestForTrack(trackKey) {
    if (!trackKey || !this._returningTrackPersonalBests.has(trackKey)) return null;
    const { mode, namespace } = resolveTrackPreferenceScope(this.getTrackPreferences(trackKey));
    const value = this._returningTrackPersonalBests.get(trackKey)?.[namespace]?.[mode];
    return value !== null && value !== undefined ? value : null;
}

export function setBestTime(bestLapTime, {
    persistToTrackCard = true,
    trackKey = this._currentTrackKey,
    mode = null,
    ranked = null,
    scoreboardSubmitPromise = null
} = {}) {
    if (!this.bestTimeDisplay || !this.bestTimeVal) return;

    if (persistToTrackCard && trackKey && mode && bestLapTime !== null && bestLapTime !== undefined) {
        const isRanked = ranked === null
            ? resolveTrackPreferenceScope(this.getTrackPreferences(trackKey)).isRanked
            : Boolean(ranked);
        this.invalidateReturningTrackRankSnapshot(trackKey, mode, isRanked);
        this.setPendingReturningTrackRankSubmission(trackKey, mode, isRanked, scoreboardSubmitPromise);
        this.updateReturningTrackPersonalBest(trackKey, bestLapTime, mode, isRanked);
        this.updateVisibleTrackRanks(trackKey);
    }

    if (bestLapTime !== null && bestLapTime !== undefined) {
        this.setHudBestMetric({
            label: 'BEST',
            value: bestLapTime.toFixed(2),
            visible: true
        });
        this._hasPersonalBests = true;
        this.updateHudStatsButtonState();
        return;
    }

    this.setHudBestMetric({ visible: false });
    this._hasPersonalBests = false;
    this.updateHudStatsButtonState();
}

export function setHudPersonalBestsOpenAllowed(isAllowed) {
    this._hudPersonalBestsAllowed = Boolean(isAllowed);
    this.updateHudStatsButtonState();
}

export function setPracticePauseVisible(isVisible) {
    const applyState = (container, button) => {
        if (container) {
            container.classList.toggle('has-practice-pause', isVisible);
            container.setAttribute('aria-label', isVisible ? 'Pause run' : 'Current speed');
        }
        if (!button) return;
        button.hidden = !isVisible;
        button.style.display = isVisible ? 'inline-flex' : 'none';
        button.setAttribute('aria-label', 'Pause run');
    };

    applyState(this.desktopSpeedometer, this.desktopPracticePauseBtn);
    applyState(this.mobileSpeedometer, this.mobilePracticePauseBtn);
}

export function updateHudStatsButtonState() {
    if (this.hudStatsBtn) {
        this.hudStatsBtn.disabled = !(this._hasPersonalBests && this._hudPersonalBestsAllowed);
    }
}

export function showStartLights() {
    if (this.startLights) this.startLights.classList.add('visible');
}

export function turnOnCountdownLight(index) {
    const light = this.countdownLights[index];
    if (light) light.classList.add('on');
}

export function hideStartLights() {
    if (this.startLights) this.startLights.classList.remove('visible');
    this.countdownLights.forEach((light) => {
        if (!light) return;
        light.className = 'light';
    });
}

export function showGoMessage() {
    if (this.goMessage) this.goMessage.classList.add('visible');
}

export function showPracticeLapFlash({ lapNumber, lapTime, deltaVsBest, isBest, isNewBest = false }) {
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

export function hidePracticeLapFlash() {
    if (this._practiceLapFlashTimer !== null) {
        clearTimeout(this._practiceLapFlashTimer);
        this._practiceLapFlashTimer = null;
    }
    if (this.practiceLapFlash) this.practiceLapFlash.classList.remove('visible');
}

export function resetCountdown() {
    this.hideStartLights();
    if (this.goMessage) this.goMessage.classList.remove('visible');
    this.hidePracticeLapFlash();
}
