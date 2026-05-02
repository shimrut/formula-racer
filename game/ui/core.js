export function setStartOverlayActive(isActive) {
    document.body.classList.toggle('start-overlay-active', Boolean(isActive));
    if (!isActive) {
        this._leaderboardRequestId += 1;
    }
}

export function setStartSelectionMode(isActive) {
    document.body.classList.toggle('start-selection-active', Boolean(isActive));
}

export function anchorHudBar() {
    const header = this.header;
    const hudBar = this.hudBar;
    if (!header || !hudBar) return;

    const getHeaderHeight = (entry) => {
        const observedSize = entry?.borderBoxSize;
        if (Array.isArray(observedSize) && observedSize[0]?.blockSize) {
            return observedSize[0].blockSize;
        }
        if (observedSize?.blockSize) {
            return observedSize.blockSize;
        }
        return header.offsetHeight;
    };

    const setHudTop = (entry) => {
        hudBar.style.top = `${Math.round(getHeaderHeight(entry)) + 12}px`;
    };
    setHudTop();
    this._hudAnchorResizeObserver?.disconnect?.();
    this._hudAnchorResizeObserver = new ResizeObserver((entries) => setHudTop(entries[0]));
    this._hudAnchorResizeObserver.observe(header);
}

export function isModalActive() {
    return Boolean(this.modal?.classList.contains('active'));
}

export function resetTouchControls() {
    if (this.leftTouchBtn) this.leftTouchBtn.classList.remove('active');
    if (this.rightTouchBtn) this.rightTouchBtn.classList.remove('active');
}
