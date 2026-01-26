import { RealTimeRacer } from './engine.js';

const game = new RealTimeRacer();

// Make game available globally for onclick handlers in HTML
window.game = game;
