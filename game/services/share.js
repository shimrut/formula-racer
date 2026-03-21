import {
    addCaptionToBlob,
    buildShareImageBlob,
    getShareCaption,
    getShareFilename
} from './share-renderer.js?v=0.77';

export class ShareService {
    constructor({ onStateChange, onPreviewChange }) {
        this.onStateChange = onStateChange;
        this.onPreviewChange = onPreviewChange;

        this.baseBlob = null;
        this.previewBlob = null;
        this.pendingBlobPromise = null;
        this.filename = '';
        this.sharingInProgress = false;
    }

    reset({ visible = false } = {}) {
        this.baseBlob = null;
        this.previewBlob = null;
        this.pendingBlobPromise = null;
        this.filename = '';
        this.sharingInProgress = false;
        if (this.onPreviewChange) this.onPreviewChange(null);
        this.emitState(visible);
    }

    emitState(visible) {
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
        if (this.baseBlob) return Promise.resolve(this.baseBlob);

        this.baseBlob = null;
        this.previewBlob = null;
        this.filename = getShareFilename(payload);
        this.pendingBlobPromise = Promise.all([
            buildShareImageBlob(payload, { includeCaption: false, includeHeader: false }),
            buildShareImageBlob(payload, { includeCaption: false, includeHeader: true })
        ])
            .then(([previewBlob, shareBlob]) => {
                this.previewBlob = previewBlob;
                this.baseBlob = shareBlob;
                this.pendingBlobPromise = null;
                if (this.onPreviewChange) this.onPreviewChange(previewBlob);
                this.emitState(true);
                return shareBlob;
            })
            .catch((error) => {
                this.pendingBlobPromise = null;
                this.baseBlob = null;
                this.previewBlob = null;
                this.emitState(true);
                throw error;
            });

        this.emitState(true);
        return this.pendingBlobPromise;
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
            const captionBlob = await addCaptionToBlob(this.baseBlob, payload);
            const file = typeof File === 'function'
                ? new File([captionBlob], this.filename, { type: 'image/jpeg' })
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

            if (captionBlob && navigator.clipboard?.write && typeof ClipboardItem === 'function') {
                await navigator.clipboard.write([new ClipboardItem({ 'image/jpeg': captionBlob })]);
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
