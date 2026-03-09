import { RealTimeRacer } from './engine.js?v=0.2';

const game = new RealTimeRacer();

// Make game available globally for onclick handlers in HTML
window.game = game;
