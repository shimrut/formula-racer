import { TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from '../modes.js?v=1.90';

export function bindModalViewToggles() {
    if (this.backToMainBtn) {
        this.backToMainBtn.addEventListener('click', () => {
            if (this._runsViewMode === 'close') {
                this.closeModal();
                return;
            }
            this.showMainModalView();
        });
    }
}

/**
 * Mobile / WebKit often leaves :focus on the first-tapped action while another looks “active”.
 * Blur siblings on pointerdown (capture) so only the pressed control keeps focus + focus ring.
 */
export function bindModalActionRowPointerFocus() {
    const row = this.modal?.querySelector('.modal-action-row');
    if (!row) return;
    row.addEventListener(
        'pointerdown',
        (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const pressed = e.target.closest('button');
            if (!(pressed instanceof HTMLButtonElement) || !row.contains(pressed)) return;
            row.querySelectorAll(':scope > button').forEach((button) => {
                if (button !== pressed) button.blur();
            });
        },
        true
    );
}

export function bindHowToPlay() {
    const closeHeaderMenu = () => {
        if (!this.headerNavMenu || !this.headerHtpBtn) return;
        this.headerNavMenu.hidden = true;
        this.headerHtpBtn.setAttribute('aria-expanded', 'false');
        this._headerMenuOpen = false;
    };

    const openHeaderMenu = () => {
        if (!this.headerNavMenu || !this.headerHtpBtn) return;
        document.dispatchEvent(new CustomEvent('header-menu-opened'));
        this.headerNavMenu.hidden = false;
        this.headerHtpBtn.setAttribute('aria-expanded', 'true');
        this._headerMenuOpen = true;
        this._onHeaderMenuOpen?.();
        const first = this.menuHowToPlayBtn || this.headerNavMenu.querySelector('a');
        if (first instanceof HTMLElement) first.focus();
    };

    const toggleHeaderMenu = () => {
        if (this._headerMenuOpen) closeHeaderMenu();
        else openHeaderMenu();
    };

    this._headerMenuOpen = false;

    if (this.headerHtpBtn) {
        this.headerHtpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHeaderMenu();
        });
    }

    if (this.menuHowToPlayBtn) {
        this.menuHowToPlayBtn.addEventListener('click', () => {
            closeHeaderMenu();
            this.showHowToPlayModal();
        });
    }

    this.headerNavMenu?.querySelectorAll('a').forEach((anchor) => {
        anchor.addEventListener('click', () => closeHeaderMenu());
    });

    if (this.closeHtpBtn) {
        this.closeHtpBtn.addEventListener('click', () => this.hideHowToPlayModal());
    }
    if (this.closeHtpXBtn) {
        this.closeHtpXBtn.addEventListener('click', () => this.hideHowToPlayModal());
    }

    this._headerMenuDocClick = (e) => {
        if (!this._headerMenuOpen) return;
        const wrap = document.querySelector('.header-menu');
        if (wrap && !wrap.contains(e.target)) closeHeaderMenu();
    };
    document.addEventListener('click', this._headerMenuDocClick);

    this._headerMenuEscape = (e) => {
        if (e.key !== 'Escape' || !this._headerMenuOpen) return;
        closeHeaderMenu();
        this.headerHtpBtn?.focus();
    };
    document.addEventListener('keydown', this._headerMenuEscape);
}

export function bindPrimaryActions(onStart, onStartDailyChallenge, onShare, onShowPersonalBests, onPausePractice) {
    if (this.startBtn && onStart) {
        this.startBtn.addEventListener('click', () => {
            if (!this._startOverlayHasAnyData && !this._introAcknowledged) {
                this._introAcknowledged = true;
                this.updateStartOverlayMode(false);
                return;
            }
            onStart();
        });
    }
    if (this.returningStartBtn && onStart) {
        this.returningStartBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible()) return;
            const trackKey = this._selectedReturningTrackKey || this._currentTrackKey || this._returningTrackKeys[0];
            onStart(trackKey, this.getTrackPreferences(trackKey));
        });
    }
    if (this.modeSelectDailyBtn) {
        this.modeSelectDailyBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible() || this.modeSelectDailyBtn.hidden || this.modeSelectDailyBtn.disabled) return;
            this.selectDailyChallenge();
        });
    }
    if (this.dailyChallengeStartBtn && onStartDailyChallenge) {
        this.dailyChallengeStartBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible() || this.dailyChallengeStartBtn.disabled) return;
            onStartDailyChallenge();
        });
    }
    if (this.dailyChallengeRankBtn) {
        this.dailyChallengeRankBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible() || this.dailyChallengeRankBtn.disabled) return;
            void this.openDailyChallengeLeaderboard();
        });
    }
    if (this.hudStatsBtn && onShowPersonalBests) {
        this.hudStatsBtn.addEventListener('click', onShowPersonalBests);
    }
    if (this.modalResetBtn) {
        this.modalResetBtn.addEventListener('click', () => {
            if (this._modalPrimaryAction) this._modalPrimaryAction();
        });
    }
    if (this.modalSecondaryBtn) {
        this.modalSecondaryBtn.addEventListener('click', () => {
            if (this._modalSecondaryAction) this._modalSecondaryAction();
        });
    }
    if (this.shareBtn && onShare) {
        this.shareBtn.addEventListener('click', onShare);
    }
    if (this.desktopSpeedometer && onPausePractice) this.desktopSpeedometer.addEventListener('click', onPausePractice);
    if (this.mobileSpeedometer && onPausePractice) bindTapAction.call(this, this.mobileSpeedometer, onPausePractice);
}

export function bindScoreModeIntro() {
    if (this.scoreModeIntroDismiss) {
        this.scoreModeIntroDismiss.addEventListener('click', () => {
            this.dismissScoreModeIntro();
        });
    }
    if (this.scoreModeIntro) {
        this.scoreModeIntro.addEventListener('keydown', (event) => {
            if (!this.isScoreModeIntroVisible()) return;
            if (event.key === 'Tab') {
                event.preventDefault();
                this.scoreModeIntroDismiss?.focus();
            }
        });
    }
}

export function bindTrackModeControls() {
    if (this.modeSelectStandardBtn) {
        this.modeSelectStandardBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible()) return;
            this.selectTrackMode(TRACK_MODE_STANDARD);
        });
    }
    if (this.modeSelectPracticeBtn) {
        this.modeSelectPracticeBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible()) return;
            this.selectTrackMode(TRACK_MODE_PRACTICE);
        });
    }
    if (this.changeTrackModeBtn) {
        this.changeTrackModeBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible()) return;
            this._startOverlaySelection = null;
            this.updateStartOverlayMode(this._startOverlayHasAnyData);
        });
    }
    if (this.dailyChallengeBackBtn) {
        this.dailyChallengeBackBtn.addEventListener('click', () => {
            if (this.isScoreModeIntroVisible()) return;
            this._startOverlaySelection = null;
            this.updateStartOverlayMode(this._startOverlayHasAnyData);
        });
    }
}

export function bindSteeringControls({ onLeftDown, onLeftUp, onRightDown, onRightUp }) {
    bindTouchButton.call(this, this.leftTouchBtn, onLeftDown, onLeftUp);
    bindTouchButton.call(this, this.rightTouchBtn, onRightDown, onRightUp);
}

export function bindTapAction(element, onTap) {
    if (!element || !onTap) return;

    if (window.PointerEvent) {
        element.addEventListener('pointerup', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault?.();
            onTap();
        });
        return;
    }

    element.addEventListener('touchend', (e) => {
        e.preventDefault();
        onTap();
    }, { passive: false });
}

export function bindTouchButton(button, onDown, onUp) {
    if (!button) return;

    let isPressed = false;

    const press = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        if (isPressed) return;
        isPressed = true;
        onDown?.();
        button.classList.add('active');
        if (e.pointerId !== undefined) {
            button.setPointerCapture?.(e.pointerId);
        }
    };

    const release = (e) => {
        e?.preventDefault?.();
        if (!isPressed) return;
        isPressed = false;
        onUp?.();
        button.classList.remove('active');
        if (e?.pointerId !== undefined && button.hasPointerCapture?.(e.pointerId)) {
            button.releasePointerCapture?.(e.pointerId);
        }
    };

    if (window.PointerEvent) {
        button.addEventListener('pointerdown', press);
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', release);
        return;
    }

    button.addEventListener('touchstart', press, { passive: false });
    button.addEventListener('touchend', release, { passive: false });
    button.addEventListener('touchcancel', release, { passive: false });
    button.addEventListener('mousedown', press);
    button.addEventListener('mouseup', release);
    button.addEventListener('mouseleave', release);
}
