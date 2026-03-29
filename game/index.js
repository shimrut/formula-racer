import { RealTimeRacer } from './engine.js?v=1.06';

function setupMobileViewportGuards() {
    const hasTouchInput = window.matchMedia('(pointer: coarse)').matches
        || navigator.maxTouchPoints > 0
        || 'ontouchstart' in window;
    if (!hasTouchInput) return;

    let lastTouchEndAt = 0;
    const preventDefault = (event) => event.preventDefault();
    const preventMultiTouchGesture = (event) => {
        if ((event.touches && event.touches.length > 1) || (event.scale && event.scale !== 1)) {
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
    document.addEventListener('touchstart', preventMultiTouchGesture, { passive: false });
    document.addEventListener('touchmove', preventMultiTouchGesture, { passive: false });
    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
    document.addEventListener('dblclick', preventDefault, { passive: false });
}

setupMobileViewportGuards();
const game = new RealTimeRacer();
// Debug/test hooks (including game reference) are on window.__RACER_DEBUG__
