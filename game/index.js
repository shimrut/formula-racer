import { RealTimeRacer } from './engine.js?v=0.93';

function setupMobileViewportGuards() {
    if (!window.matchMedia('(pointer: coarse)').matches) return;

    let lastTouchEndAt = 0;
    const preventDefault = (event) => event.preventDefault();
    const preventScaledTouch = (event) => {
        if (event.scale && event.scale !== 1) {
            event.preventDefault();
        }
    };
    const preventDoubleTapZoom = (event) => {
        const now = Date.now();
        if (now - lastTouchEndAt < 300) {
            event.preventDefault();
        }
        lastTouchEndAt = now;
    };

    document.addEventListener('gesturestart', preventDefault, { passive: false });
    document.addEventListener('gesturechange', preventDefault, { passive: false });
    document.addEventListener('gestureend', preventDefault, { passive: false });
    document.addEventListener('touchmove', preventScaledTouch, { passive: false });
    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
    document.addEventListener('dblclick', preventDefault, { passive: false });
}

setupMobileViewportGuards();
const game = new RealTimeRacer();
// Debug/test hooks (including game reference) are on window.__RACER_DEBUG__
