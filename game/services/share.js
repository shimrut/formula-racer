import {
    buildShareImageBlob,
    getShareCaption,
    getShareFilename
} from './share-renderer.js?v=0.81';

export class ShareService {
    constructor({ onStateChange, onPreviewChange }) {
        this.onStateChange = onStateChange;
        this.onPreviewChange = onPreviewChange;

        this.baseBlob = null;
        this.previewBlob = null;
        this.shareBlob = null;
        this.pendingBlobPromise = null;
        this.filename = '';
        this.sharingInProgress = false;
        this.generation = 0;
        this.visible = false;
    }

    reset({ visible = false, preservePreview = false, preserveVisibility = false } = {}) {
        this.generation += 1;
        this.baseBlob = null;
        this.previewBlob = null;
        this.shareBlob = null;
        this.pendingBlobPromise = null;
        this.filename = '';
        this.sharingInProgress = false;
        this.visible = preserveVisibility ? this.visible : visible;
        if (!preservePreview && this.onPreviewChange) this.onPreviewChange(null);
        this.emitState(this.visible);
    }

    emitState(visible) {
        this.visible = visible;
        if (!this.onStateChange) return;
        this.onStateChange({
            visible,
            ready: Boolean(this.baseBlob),
            busy: Boolean(this.pendingBlobPromise || this.sharingInProgress)
        });
    }

    prepare(payload) {
        if (!payload) return undefined;
        if (this.pendingBlobPromise) return this.pendingBlobPromise;
        if (this.baseBlob) {
            if (this.previewBlob && this.onPreviewChange) this.onPreviewChange(this.previewBlob);
            this.emitState(true);
            return Promise.resolve(this.baseBlob);
        }

        const generation = this.generation;
        this.baseBlob = null;
        this.previewBlob = null;
        this.shareBlob = null;
        this.filename = getShareFilename(payload);
        const pendingPromise = buildShareImageBlob(payload, {
            includeCaption: false,
            includeHeader: false
        })
            .then((previewBlob) => {
                if (generation !== this.generation) {
                    return previewBlob;
                }

                this.previewBlob = previewBlob;
                this.baseBlob = previewBlob;
                if (this.pendingBlobPromise === pendingPromise) {
                    this.pendingBlobPromise = null;
                }
                if (this.onPreviewChange) this.onPreviewChange(previewBlob);
                this.emitState(true);
                return previewBlob;
            })
            .catch((error) => {
                if (this.pendingBlobPromise === pendingPromise) {
                    this.pendingBlobPromise = null;
                }
                if (generation !== this.generation) {
                    return undefined;
                }
                this.baseBlob = null;
                this.previewBlob = null;
                this.emitState(true);
                throw error;
            });

        this.pendingBlobPromise = pendingPromise;
        this.emitState(true);
        return pendingPromise;
    }

    async share(payload) {
        if (!payload || this.sharingInProgress) return;

        if (!this.baseBlob) {
            this.emitState(true);
            return;
        }

        this.sharingInProgress = true;
        this.emitState(true);

        try {
            if (!this.shareBlob) {
                this.shareBlob = await buildShareImageBlob(payload, {
                    includeCaption: true,
                    includeHeader: true,
                    includeSourcePill: true
                });
            }

            const file = typeof File === 'function'
                ? new File([this.shareBlob], this.filename, { type: 'image/jpeg' })
                : null;
            const caption = getShareCaption(payload);
            const hasNavigatorShare = typeof navigator.share === 'function';

            if (hasNavigatorShare && file) {
                let canShareFile = true;
                if (typeof navigator.canShare === 'function') {
                    try {
                        canShareFile = navigator.canShare({ files: [file] });
                    } catch (error) {
                        canShareFile = false;
                    }
                }

                if (canShareFile) {
                    try {
                        await navigator.share({ files: [file] });
                        this.emitState(true);
                        return;
                    } catch (error) {
                        if (error?.name === 'AbortError') {
                            throw error;
                        }
                    }
                }
            }

            if (hasNavigatorShare) {
                await navigator.share({ text: caption, url: 'https://vectorgp.run' });
                this.emitState(true);
                return;
            }

            if (this.shareBlob && navigator.clipboard?.write && typeof ClipboardItem === 'function') {
                await navigator.clipboard.write([new ClipboardItem({ 'image/jpeg': this.shareBlob })]);
                this.emitState(true);
                return;
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(caption);
            }

            this.emitState(true);
        } finally {
            this.sharingInProgress = false;
            this.emitState(true);
        }
    }
}
