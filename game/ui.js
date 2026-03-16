export class GameUi {
    constructor({ isCoarsePointer, onTrackChange, onStart, onReset, onShare }) {
        this.trackSelect = document.getElementById('track-select');
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
        this.startLights = document.getElementById('start-lights');
        this.goMessage = document.getElementById('go-message');
        this.htpModal = document.getElementById('how-to-play-modal');
        this.closeHtpBtn = document.getElementById('close-htp-btn');
        this.headerHtpBtn = document.getElementById('header-htp-btn');
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

        this.anchorHudBar();
        this.bindTrackSelection(isCoarsePointer, onTrackChange);
        this.bindModalViewToggles();
        this.bindHowToPlay();
        this.bindPrimaryActions(onStart, onReset, onShare);
        this.updateShareState({ visible: false, ready: false, busy: false });
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

    bindTrackSelection(isCoarsePointer, onTrackChange) {
        if (this.trackSelect && onTrackChange) {
            this.trackSelect.addEventListener('change', (e) => onTrackChange(e.target.value));
        }

        if (!isCoarsePointer || !this.trackSelect) return;

        let hiddenOptsRestore = null;
        const removeHidden = () => {
            const opts = Array.from(this.trackSelect.querySelectorAll('option[hidden]'));
            if (!opts.length) return;
            hiddenOptsRestore = opts.map((option) => ({ el: option, next: option.nextSibling }));
            hiddenOptsRestore.forEach(({ el }) => el.remove());
        };
        const restoreHidden = () => {
            if (!hiddenOptsRestore) return;
            hiddenOptsRestore.reverse().forEach(({ el, next }) => {
                this.trackSelect.insertBefore(el, next);
            });
            hiddenOptsRestore = null;
        };

        this.trackSelect.addEventListener('focus', removeHidden);
        this.trackSelect.addEventListener('mousedown', removeHidden, { passive: true });
        this.trackSelect.addEventListener('touchstart', removeHidden, { passive: true });
        this.trackSelect.addEventListener('change', restoreHidden);
        this.trackSelect.addEventListener('blur', restoreHidden);
    }

    bindModalViewToggles() {
        if (this.modalStatsRow) {
            this.modalStatsRow.addEventListener('click', () => {
                if (this.modalStatsRow.dataset.hasRuns === 'true') {
                    if (this.modalMainView) this.modalMainView.classList.remove('active-view');
                    if (this.modalRunsView) this.modalRunsView.classList.add('active-view');
                }
            });
        }

        if (this.backToMainBtn) {
            this.backToMainBtn.addEventListener('click', () => {
                if (this.modalRunsView) this.modalRunsView.classList.remove('active-view');
                if (this.modalMainView) this.modalMainView.classList.add('active-view');
            });
        }
    }

    bindHowToPlay() {
        if (this.headerHtpBtn) {
            this.headerHtpBtn.addEventListener('click', () => this.showHowToPlayModal());
        }
        if (this.closeHtpBtn) {
            this.closeHtpBtn.addEventListener('click', () => this.hideHowToPlayModal());
        }
    }

    bindPrimaryActions(onStart, onReset, onShare) {
        if (this.startBtn && onStart) {
            this.startBtn.addEventListener('click', onStart);
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
        if (this.trackSelect) {
            this.trackSelect.value = trackKey;
        }
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

    setBestTime(bestLapTime) {
        if (!this.bestTimeDisplay || !this.bestTimeVal) return;

        if (bestLapTime !== null && bestLapTime !== undefined) {
            this.bestTimeVal.textContent = bestLapTime.toFixed(2);
            this.bestTimeDisplay.style.display = 'flex';
            if (this.bestTimeDivider) this.bestTimeDivider.style.display = 'block';
            return;
        }

        this.bestTimeDisplay.style.display = 'none';
        if (this.bestTimeDivider) this.bestTimeDivider.style.display = 'none';
    }

    refreshStartOverlay(status, hasAnyData) {
        if (!this.firstTimeMsg || status !== 'ready' || this.startOverlay?.style.display === 'none') return;
        this.firstTimeMsg.style.display = hasAnyData ? 'none' : 'block';
    }

    showStartOverlay(hasAnyData) {
        if (this.startOverlay) this.startOverlay.style.display = 'flex';
        if (this.startGroup) this.startGroup.style.display = 'flex';
        if (this.firstTimeMsg) this.firstTimeMsg.style.display = hasAnyData ? 'none' : 'block';
    }

    hideStartOverlay() {
        if (this.startOverlay) this.startOverlay.style.display = 'none';
    }

    showStartLights() {
        if (this.startLights) this.startLights.classList.add('visible');
    }

    turnOnCountdownLight(index) {
        const light = this.countdownLights[index];
        if (light) light.classList.add('on');
    }

    turnCountdownLightsGreen() {
        this.countdownLights.forEach((light) => {
            if (!light) return;
            light.classList.remove('on');
            light.classList.add('green');
        });
    }

    showGoMessage() {
        if (this.goMessage) this.goMessage.classList.add('visible');
    }

    resetCountdown() {
        if (this.startLights) this.startLights.classList.remove('visible');
        if (this.goMessage) this.goMessage.classList.remove('visible');
        this.countdownLights.forEach((light) => {
            if (light) light.className = 'light';
        });
    }

    showModal(title, msg, lapData, canShare) {
        if (!this.modal || !this.modalTitle) return;

        this.modalTitle.textContent = title;
        this.modal.classList.toggle('modal--crash', Boolean(lapData?.isCrash));

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
            if (this.modalPreviewWrap) this.modalPreviewWrap.style.display = 'none';
        }

        if (lapData?.lapTimesArray !== undefined && this.modalLapTimes) {
            this.renderLapTimesList(this.modalLapTimes, lapData.lapTimesArray, lapData.bestTime, lapData.lapTime);
        } else if (lapData && this.modalLapTimes) {
            this.modalLapTimes.replaceChildren();
        }

        if (this.modalMainView && this.modalRunsView) {
            this.modalMainView.classList.add('active-view');
            this.modalRunsView.classList.remove('active-view');
        }

        this.updateShareState({ visible: canShare, ready: false, busy: false });
        this.modal.classList.add('active');
        requestAnimationFrame(() => this.activateModalFocusTrap(this.modal));
    }

    closeModal() {
        if (!this.modal) return;

        const modal = this.modal;
        modal.classList.remove('active');

        if (this._modalCloseFallbackTimer != null) {
            clearTimeout(this._modalCloseFallbackTimer);
            this._modalCloseFallbackTimer = null;
        }

        const cleanupAfterClose = () => {
            modal.classList.remove('modal--crash');
            this.clearModalPreview();
            this.releaseModalFocusTrap(modal);
        };

        const onTransitionEnd = (e) => {
            if (e.target !== modal || e.propertyName !== 'opacity') return;
            modal.removeEventListener('transitionend', onTransitionEnd);
            if (this._modalCloseFallbackTimer != null) {
                clearTimeout(this._modalCloseFallbackTimer);
                this._modalCloseFallbackTimer = null;
            }
            cleanupAfterClose();
        };

        modal.addEventListener('transitionend', onTransitionEnd);
        this._modalCloseFallbackTimer = setTimeout(() => {
            this._modalCloseFallbackTimer = null;
            modal.removeEventListener('transitionend', onTransitionEnd);
            cleanupAfterClose();
        }, 350);
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
        if (this.sharePanel) {
            this.sharePanel.style.display = visible ? 'flex' : 'none';
        }
        if (this.shareBtn) {
            this.shareBtn.disabled = !visible || !ready || busy;
            this.shareBtn.textContent = 'Challenge a Friend';
        }
    }

    setModalPreviewBlob(blob) {
        if (!blob || !this.modalPreviewImg) return;
        this.clearModalPreview();
        this._modalPreviewUrl = URL.createObjectURL(blob);
        this.modalPreviewImg.src = this._modalPreviewUrl;
        if (this.modalPreviewWrap) this.modalPreviewWrap.style.display = 'block';
    }

    clearModalPreview() {
        if (this._modalPreviewUrl) {
            URL.revokeObjectURL(this._modalPreviewUrl);
            this._modalPreviewUrl = null;
        }
        if (this.modalPreviewImg) this.modalPreviewImg.src = '';
        if (this.modalPreviewWrap) this.modalPreviewWrap.style.display = 'none';
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
