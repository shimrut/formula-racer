import { RealTimeRacer } from './engine.js?v=0.21';

const game = new RealTimeRacer();

// Make game available globally for onclick handlers in HTML
window.game = game;
