import { STOCK_PHYSICS } from './stock-physics.js';

const SPEED_DISPLAY_SCALE = 20;
const MAX_SIMULATION_FRAMES = 60 * 60;
const STABLE_DELTA_THRESHOLD = 0.00001;
const STABLE_FRAME_COUNT = 90;

function toPositiveFiniteNumber(value, fallback) {
    return Number.isFinite(value) && value > 0 ? Number(value) : fallback;
}

function round(value, digits = 2) {
    return Number(value.toFixed(digits));
}

export function resolvePhysicsConfig(overrides = {}) {
    return {
        accel: toPositiveFiniteNumber(overrides?.accel, STOCK_PHYSICS.accel),
        friction: toPositiveFiniteNumber(overrides?.friction, STOCK_PHYSICS.friction),
        turnSpeed: toPositiveFiniteNumber(overrides?.turnSpeed, STOCK_PHYSICS.turnSpeed)
    };
}

export function simulatePhysicsMetrics(overrides = {}) {
    const physics = resolvePhysicsConfig(overrides);
    const fixedDt = STOCK_PHYSICS.fixedDt;
    const frictionFactor = Math.pow(physics.friction, fixedDt * 60);
    const targetsKph = [100, 200];
    const timeToTargetSeconds = new Map(targetsKph.map((target) => [target, null]));
    const checkpointFrames = new Map([
        [1, null],
        [3, null],
        [5, null]
    ]);

    let speed = 0;
    let stableFrames = 0;
    let previousSpeed = 0;

    for (let frame = 1; frame <= MAX_SIMULATION_FRAMES; frame += 1) {
        speed = (speed + physics.accel * fixedDt) * frictionFactor;
        const elapsedSeconds = frame * fixedDt;
        const speedKph = speed * SPEED_DISPLAY_SCALE;

        for (const target of targetsKph) {
            if (timeToTargetSeconds.get(target) === null && speedKph >= target) {
                timeToTargetSeconds.set(target, round(elapsedSeconds, 2));
            }
        }

        for (const seconds of checkpointFrames.keys()) {
            if (checkpointFrames.get(seconds) === null && elapsedSeconds >= seconds) {
                checkpointFrames.set(seconds, Math.round(speedKph));
            }
        }

        if (Math.abs(speed - previousSpeed) <= STABLE_DELTA_THRESHOLD) {
            stableFrames += 1;
        } else {
            stableFrames = 0;
        }

        previousSpeed = speed;

        if (stableFrames >= STABLE_FRAME_COUNT) {
            break;
        }
    }

    const turnRateDegPerSecond = physics.turnSpeed * (180 / Math.PI);

    return {
        physics,
        topSpeedKph: Math.round(speed * SPEED_DISPLAY_SCALE),
        timeTo100KphSeconds: timeToTargetSeconds.get(100),
        timeTo200KphSeconds: timeToTargetSeconds.get(200),
        speedAt1SecondKph: checkpointFrames.get(1),
        speedAt3SecondsKph: checkpointFrames.get(3),
        speedAt5SecondsKph: checkpointFrames.get(5),
        turnRateDegPerSecond: Math.round(turnRateDegPerSecond),
        quarterTurnSeconds: round((Math.PI / 2) / physics.turnSpeed, 3),
        halfTurnSeconds: round(Math.PI / physics.turnSpeed, 3)
    };
}
