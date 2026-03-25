// --- Game Config ---
export const CONFIG = {
    gridSize: 40, 
    visibleTrackKeys: ['circuit', 'harborParkLoop', 'jadeSpiralCircuit', 'cedarRidgeCircuit', 'sakuraWeave'],
    
    // Environment Colors
    offTrackColor: '#0f172a', // Deep Blue/Grey for runoff areas
    trackColor: '#334155',    // Lighter Slate for Asphalt
    
    // F1 Style Colors
    curbRed: '#ef4444',
    curbWhite: '#f8fafc',
    carColor: '#dc2626',
    carAccent: '#facc15',
    tireColor: '#171717',

    skidColor: 'rgba(0, 0, 0, 0.4)',
    smokeColor: 'rgba(200,200,200,0.4)',
    sparkColor: '#fcd34d',
    
    finishLineColor: '#fff',
    finishLineDarkColor: '#020617',
    finishLineBorderColor: 'rgba(248, 250, 252, 0.45)',
    
    // Physics Constants
    accel: 28.0, // Tuned for ~220 kph top speed
    turnSpeed: 5.0,  // Balanced steering response
    friction: 0.96, // Lower drag for higher top speed
    crashSpeed: 2.0, // Higher impact tolerance
    
    // Collision radius (approximate car half-width in grid units)
    carRadius: 0.2 
};
