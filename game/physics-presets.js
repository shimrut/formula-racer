const EPSILON = 0.0001;

export const PHYSICS_PRESET_LIST = Object.freeze([
    Object.freeze({
        key: 'muscle',
        label: 'Muscle',
        accel: 42,
        turnSpeed: 4,
        friction: 0.95,
    }),
    Object.freeze({
        key: 'tuner',
        label: 'Tuner',
        accel: 40,
        turnSpeed: 5.6,
        friction: 0.952,
    }),
    Object.freeze({
        key: 'hyper',
        label: 'Hyper',
        accel: 46,
        turnSpeed: 5.75,
        friction: 0.95,
    }),
    Object.freeze({
        key: 'ship',
        label: 'Ship',
        accel: 58,
        turnSpeed: 5.25,
        friction: 0.95,
    }),
    Object.freeze({
        key: 'stock',
        label: 'Stock',
        accel: 28,
        turnSpeed: 5,
        friction: 0.96,
    }),
]);

export const PHYSICS_PRESETS = Object.freeze(
    Object.fromEntries(PHYSICS_PRESET_LIST.map((preset) => [preset.key, preset]))
);

function isSameNumber(a, b, epsilon = EPSILON) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
}

export function getPhysicsPresetForConfig(config = {}) {
    const accel = Number(config?.accel);
    const friction = Number(config?.friction);
    const turnSpeed = Number(config?.turnSpeed);

    return PHYSICS_PRESET_LIST.find((preset) => (
        isSameNumber(accel, preset.accel)
        && isSameNumber(friction, preset.friction)
        && isSameNumber(turnSpeed, preset.turnSpeed)
    )) || null;
}
