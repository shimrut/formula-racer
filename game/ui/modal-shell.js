import { TRACK_MODE_STANDARD } from '../modes.js?v=1.91';
import { buildModalRunsPayload, buildModalStatsPlan } from '../result-flow.js?v=1.91';

export function cancelPendingModalClose() {
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

export function showModal(title, msg, lapData, canShare, options = {}) {
    if (!this.modal || !this.modalTitle) return;

    this.cancelPendingModalClose();
    this.modalTitle.textContent = title;
    this._mainModalIsCrash = Boolean(lapData?.isCrash);
    this._modalKind = options.modalKind || null;
    this.modal.classList.toggle('modal--crash', this._mainModalIsCrash);
    this.modal.classList.toggle('modal--practice-pause', this._modalKind === 'practice-pause' || this._modalKind === 'crash');
    this.modal.classList.toggle('modal--standard-win', this._modalKind === 'standard-win');
    this._modalPrimaryAction = options.primaryAction || this._defaultModalPrimaryAction;
    this._modalSecondaryAction = options.secondaryAction || null;
    this._modalRunsPayload = buildModalRunsPayload(lapData, {
        currentTrackKey: this._currentTrackKey
    });
    this._forceSharePanelVisible = Boolean(options.forceSharePanelVisible);
    this.setModalResetButtonLabel(
        options.primaryActionLabel || 'Race Again',
        Object.prototype.hasOwnProperty.call(options, 'primaryShortcutLabel') ? options.primaryShortcutLabel : null,
        options.primaryActionIcon || null
    );
    this.setModalSecondaryButton(
        options.secondaryActionLabel || '',
        Boolean(options.secondaryAction),
        options.secondaryActionIcon || null
    );
    this.setShareButtonContent(options.shareActionLabel || 'Challenge', options.shareActionIcon || 'save');

    if (lapData) {
        if (this.modalMsg) this.modalMsg.style.display = 'none';
        if (this.modalStatsRow) {
            const statsPlan = buildModalStatsPlan(lapData);
            if (statsPlan) {
                if (statsPlan.kind === 'practice-pause') {
                    this.setPracticePauseStats(...statsPlan.args);
                } else if (statsPlan.kind === 'left-right') {
                    this.setModalStatLeftRight(...statsPlan.args);
                } else if (statsPlan.kind === 'standard-pause') {
                    this.setStandardPauseStats(...statsPlan.args);
                } else if (statsPlan.kind === 'hide') {
                    this.modalStatsRow.replaceChildren();
                } else if (statsPlan.kind === 'crash') {
                    this.setModalStatCenter(...statsPlan.args);
                } else if (statsPlan.kind === 'practice') {
                    this.setModalStatLeftRight(...statsPlan.args);
                } else if (statsPlan.kind === 'daily-crash-budget') {
                    this.modalStatsRow.replaceChildren();
                    this.modalStatsRow.appendChild(this.createModalStat(
                        'Laps',
                        statsPlan.args[0],
                        'modal-stat-value--best'
                    ));
                    if (statsPlan.args[1]) {
                        this.modalStatsRow.appendChild(this.createRankModalStat(statsPlan.args[1]));
                    }
                } else if (statsPlan.kind === 'win') {
                    this.setWinStats(...statsPlan.args);
                }

                if (statsPlan.hasRuns === null) {
                    delete this.modalStatsRow.dataset.hasRuns;
                } else {
                    this.modalStatsRow.dataset.hasRuns = statsPlan.hasRuns;
                }
                this.modalStatsRow.style.display = statsPlan.display;
            }
        }
    } else {
        if (this.modalMsg) {
            this.modalMsg.style.display = '';
            this.modalMsg.textContent = msg || '';
        }
        if (this.modalStatsRow) this.modalStatsRow.style.display = 'none';
    }

    if (lapData?.listData !== undefined && this.modalLapTimes) {
        this.modalLapTimes.replaceChildren();
        this.renderLapTimesList(this.modalLapTimes, lapData.listData, lapData.bestTime, lapData.lapTime);
    } else if (lapData?.lapTimesArray !== undefined && this.modalLapTimes) {
        this.modalLapTimes.replaceChildren();
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
        this.updateShareState({ visible: this._forceSharePanelVisible, ready: false, busy: false });
    }
    this.modal.classList.add('active');
    requestAnimationFrame(() => this.activateModalFocusTrap(this.modal));
}

export function showRunsModal(lapTimesArray, bestTime, currentTime = null, returnMode = 'close', {
    scoreboardSnapshot = null,
    scoreboardMode = TRACK_MODE_STANDARD,
    scoreboardChallengeId = null,
    scoreboardTrackKey = null,
    scoreboardDailyChallengeSkin = null,
    scoreboardSubhead = null,
    showGlobalLeaderboard = true,
    allowLeaderboardOpen = true
} = {}) {
    if (!this.modal || !this.modalTitle || !this.modalLapTimes || !this.modalRunsView || !this.modalMainView) return;

    this.cancelPendingModalClose();
    const wasActive = this.isModalActive();
    this.modal.classList.remove('modal--crash');
    this.modalLapTimes.replaceChildren();
    this.renderLapTimesList(this.modalLapTimes, lapTimesArray, bestTime, currentTime);
    this._modalRunsPayload = buildModalRunsPayload({
        lapTimesArray,
        bestTime,
        currentTime,
        scoreboardChallengeId,
        scoreboardTrackKey,
        scoreboardDailyChallengeSkin,
        scoreboardSnapshot,
        scoreboardMode,
        scoreboardSubhead,
        showGlobalLeaderboard,
        allowLeaderboardOpen
    }, {
        currentTrackKey: this._currentTrackKey
    });
    if (this._modalRunsPayload.showGlobalLeaderboard) {
        this.renderScoreboardList(
            this.modalLapTimes,
            this._modalRunsPayload.scoreboardSnapshot,
            this._modalRunsPayload.scoreboardMode,
            this._modalRunsPayload.scoreboardTrackKey,
            this._modalRunsPayload.scoreboardSubhead,
            this._modalRunsPayload.scoreboardChallengeId,
            this._modalRunsPayload.scoreboardDailyChallengeSkin
        );
    }
    this._runsViewMode = returnMode === 'back' ? 'back' : 'close';
    if (this.backToMainBtn) this.backToMainBtn.textContent = this._runsViewMode === 'back' ? 'Back' : 'Close';
    this.modalMainView.classList.remove('active-view');
    this.modalRunsView.classList.add('active-view');
    this.modal.classList.add('active');
    if (wasActive) {
        requestAnimationFrame(() => {
            this.centerLeaderboardCurrentRow();
            if (this.backToMainBtn) this.backToMainBtn.focus();
        });
        return;
    }
    requestAnimationFrame(() => {
        this.centerLeaderboardCurrentRow();
        this.activateModalFocusTrap(this.modal);
    });
}

export function closeModal() {
    if (!this.modal) return;

    const modal = this.modal;
    modal.classList.remove('active');
    this._leaderboardRequestId += 1;

    this.cancelPendingModalClose();

    const cleanupAfterClose = () => {
        this._modalCloseTransitionEndHandler = null;
        modal.classList.remove('modal--crash');
        modal.classList.remove('modal--practice-pause');
        modal.classList.remove('modal--standard-win');
        this._modalKind = null;
        this._modalPrimaryAction = this._defaultModalPrimaryAction;
        this._modalSecondaryAction = null;
        this._modalRunsPayload = null;
        this._forceSharePanelVisible = false;
        this.setModalSecondaryButton('', false, null);
        this.setShareButtonContent('Challenge', 'save');
        this.updateShareState({ visible: false, ready: false, busy: false });
        this.clearModalPreview();
        this.releaseModalFocusTrap(modal);
    };

    const onTransitionEnd = (event) => {
        if (event.target !== modal || event.propertyName !== 'opacity') return;
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

export function showMainModalView() {
    this._runsViewMode = 'back';
    if (this.backToMainBtn) this.backToMainBtn.textContent = 'Back';
    if (this.modal) this.modal.classList.toggle('modal--crash', this._mainModalIsCrash);
    if (this.modalRunsView) this.modalRunsView.classList.remove('active-view');
    if (this.modalMainView) this.modalMainView.classList.add('active-view');
}

export function isStandaloneRunsViewActive() {
    return this.isModalActive() && this._runsViewMode === 'close' && Boolean(this.modalRunsView?.classList.contains('active-view'));
}

export function isPauseModalActive() {
    return this.isModalActive() && this._modalKind === 'practice-pause';
}

export function updateShareState({ visible, ready, busy }) {
    if (!visible) {
        this.shareBtn?.classList.remove('pending-share');
    }
    if (this.shareBtn) {
        this.shareBtn.style.display = visible ? 'inline-flex' : 'none';
        this.shareBtn.disabled = !visible || !ready || busy;
    }
}

export function preparePendingShareLayout() {
    if (this.modalPreviewWrap) {
        this.modalPreviewWrap.classList.add('pending-share');
        this.modalPreviewWrap.style.display = 'block';
    }
    if (this.shareBtn) {
        this.shareBtn.classList.add('pending-share');
        this.shareBtn.style.display = 'inline-flex';
    }
}

export function setModalPreviewBlob(blob) {
    if (!blob || !this.modalPreviewImg) return;
    this.clearModalPreview();
    this._modalPreviewUrl = URL.createObjectURL(blob);
    this.modalPreviewImg.src = this._modalPreviewUrl;
    if (this.modalPreviewWrap) this.modalPreviewWrap.style.display = 'block';
    this.modalPreviewWrap?.classList.remove('pending-share');
    this.shareBtn?.classList.remove('pending-share');
}

export function clearModalPreview() {
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

export function showHowToPlayModal() {
    if (!this.htpModal) return;
    if (this.htpModal.classList.contains('active')) return;
    this.htpModal.classList.add('active');
    this._onHowToPlayOpen?.();
    this.activateModalFocusTrap(this.htpModal);
}

export function hideHowToPlayModal() {
    if (!this.htpModal) return;
    this.htpModal.classList.remove('active');
    this.releaseModalFocusTrap(this.htpModal);
}

export function getFocusables(root) {
    const selector = 'button:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex^="-"])';
    return Array.from(root.querySelectorAll(selector)).filter((el) => el.offsetParent !== null);
}

export function activateModalFocusTrap(modalEl) {
    if (!modalEl) return;

    if (this._modalTrapKeydown) {
        document.removeEventListener('keydown', this._modalTrapKeydown);
        this._modalTrapKeydown = null;
    }

    this._focusBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this._activeTrapModal = modalEl;
    const focusables = this.getFocusables(modalEl);
    const preferredFocus = modalEl === this.modal && this.modalResetBtn && !this.modalResetBtn.hidden && this.modalResetBtn.offsetParent !== null
        ? this.modalResetBtn
        : null;
    if (preferredFocus) preferredFocus.focus();
    else if (focusables.length) focusables[0].focus();
    this._modalTrapKeydown = (event) => this.handleModalTrapKeydown(event);
    document.addEventListener('keydown', this._modalTrapKeydown);
}

export function releaseModalFocusTrap(modalEl) {
    if (this._activeTrapModal !== modalEl) return;
    document.removeEventListener('keydown', this._modalTrapKeydown);
    this._activeTrapModal = null;
    this._modalTrapKeydown = null;
    const activeElement = document.activeElement;
    if (
        activeElement
        && activeElement !== document.body
        && (
            modalEl?.contains?.(activeElement)
            || activeElement.offsetParent === null
        )
        && typeof activeElement.blur === 'function'
    ) {
        activeElement.blur();
    }
    const restoredActiveElement = document.activeElement;
    const focusAlreadyMoved = Boolean(
        restoredActiveElement
        && restoredActiveElement !== document.body
        && restoredActiveElement !== this._focusBeforeModal
        && document.contains(restoredActiveElement)
        && restoredActiveElement.offsetParent !== null
        && !modalEl?.contains?.(restoredActiveElement)
    );
    if (
        !focusAlreadyMoved
        && this._focusBeforeModal
        && this._focusBeforeModal !== document.body
        && document.contains(this._focusBeforeModal)
        && this._focusBeforeModal.offsetParent !== null
    ) {
        this._focusBeforeModal.focus();
    }
    this._focusBeforeModal = null;
}

export function handleModalTrapKeydown(event) {
    if (!this._activeTrapModal) return;

    if (event.key === 'Escape' && this._activeTrapModal === this.htpModal) {
        event.preventDefault();
        event.stopPropagation();
        this.hideHowToPlayModal();
        return;
    }

    const isDesktopModalNav = window.matchMedia('(min-width: 769px)').matches;
    const actionButtons = isDesktopModalNav
        ? Array.from(this._activeTrapModal.querySelectorAll('.modal-action-row > button'))
            .filter((button) => !button.hidden && button.offsetParent !== null)
        : [];

    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && actionButtons.length > 1) {
        const activeIndex = actionButtons.indexOf(document.activeElement);
        if (activeIndex !== -1) {
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const nextIndex = (activeIndex + direction + actionButtons.length) % actionButtons.length;
            actionButtons[nextIndex].focus();
        }
        return;
    }

    if (event.key !== 'Tab') return;
    const focusables = this.getFocusables(this._activeTrapModal);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey) {
        if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
        return;
    }
    if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}
