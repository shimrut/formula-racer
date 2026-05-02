import { segmentsIntersect } from '../math.js?v=1.90';
import {
    handleFinishCrossing,
    handleHardCrash,
    resolveRunPolicy
} from '../run-policy.js?v=1.90';

/**
 * Mutate-in-place simulation. The `state` object (the engine instance) is
 * modified directly — no packing, no return-object copy-back. Only the
 * lightweight events descriptor is returned.
 *
 * Trail data (skidMarks, routeTrace, runHistory) are RingBuffers with
 * pre-allocated slots, so the hot loop produces zero garbage.
 */

// Pre-allocated nextPos — reused every tick, never returned.
const _nextPos = { x: 0, y: 0 };

// Pre-allocated events object — reused every tick.
const _events = {
    winTriggered: false,
    winData: null,
    lapCompleted: false,
    completedLapTime: null,
    challengeLapCompleted: false,
    challengeCompletedLapTime: null,
    challengeProgressLaps: 0,
    challengeCrashReset: false,
    challengeCrashCount: 0,
    challengeFailed: false,
    challengeFailureReason: null,
    crashImpact: null,
    crashEndedRun: false,
    practiceCrashReset: false
};

function resetEvents() {
    _events.winTriggered = false;
    _events.winData = null;
    _events.lapCompleted = false;
    _events.completedLapTime = null;
    _events.challengeLapCompleted = false;
    _events.challengeCompletedLapTime = null;
    _events.challengeProgressLaps = 0;
    _events.challengeCrashReset = false;
    _events.challengeCrashCount = 0;
    _events.challengeFailed = false;
    _events.challengeFailureReason = null;
    _events.crashImpact = null;
    _events.crashEndedRun = false;
    _events.practiceCrashReset = false;
}

function createSparkParticles(pos, count, sparkColor) {
    const particles = [];

    for (let i = 0; i < count; i++) {
        const spread = 0.5;
        const px = pos.x + (Math.random() - 0.5) * spread;
        const py = pos.y + (Math.random() - 0.5) * spread;

        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        const pvX = Math.cos(angle) * speed;
        const pvY = Math.sin(angle) * speed;
        const life = 0.2 + Math.random() * 0.2;

        particles.push({
            x: px,
            y: py,
            vx: pvX,
            vy: pvY,
            life,
            maxLife: life,
            color: sparkColor,
            size: 2
        });
    }

    return particles;
}

function checkWallCollision(p1, p2, wallSegments, carRadius) {
    if (!wallSegments || wallSegments.length === 0) return false;

    const carRadiusSq = carRadius * carRadius;

    // Always test every segment (same as scoreboard replay-validation on the server).
    const segments = wallSegments._segments ? wallSegments._segments : wallSegments;

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        if (segmentsIntersect(p1, p2, segment.start, segment.end)) return true;

        const ax = p2.x - segment.start.x;
        const ay = p2.y - segment.start.y;
        let param = -1;
        if (segment.lenSq !== 0) {
            param = (ax * segment.dx + ay * segment.dy) / segment.lenSq;
        }

        let xx;
        let yy;
        if (param < 0) {
            xx = segment.start.x;
            yy = segment.start.y;
        } else if (param > 1) {
            xx = segment.end.x;
            yy = segment.end.y;
        } else {
            xx = segment.start.x + param * segment.dx;
            yy = segment.start.y + param * segment.dy;
        }

        const dx = p2.x - xx;
        const dy = p2.y - yy;
        if ((dx * dx + dy * dy) < carRadiusSq) {
            return true;
        }
    }

    return false;
}

function getCollisionCandidates(p1, p2, collisionData, carRadius) {
    if (!collisionData) return [];
    if (!collisionData.cells || !collisionData.segments) {
        return collisionData._segments ? collisionData._segments : collisionData;
    }

    const expandedMinX = Math.min(p1.x, p2.x) - carRadius;
    const expandedMaxX = Math.max(p1.x, p2.x) + carRadius;
    const expandedMinY = Math.min(p1.y, p2.y) - carRadius;
    const expandedMaxY = Math.max(p1.y, p2.y) + carRadius;
    const startCellX = Math.floor(expandedMinX / collisionData.cellSize);
    const endCellX = Math.floor(expandedMaxX / collisionData.cellSize);
    const startCellY = Math.floor(expandedMinY / collisionData.cellSize);
    const endCellY = Math.floor(expandedMaxY / collisionData.cellSize);
    const stamp = ++collisionData.queryStamp;
    const candidates = collisionData.candidateSegments;
    candidates.length = 0;

    for (let cellY = startCellY; cellY <= endCellY; cellY++) {
        for (let cellX = startCellX; cellX <= endCellX; cellX++) {
            const bucket = collisionData.cells.get(`${cellX},${cellY}`);
            if (!bucket) continue;

            for (let i = 0; i < bucket.length; i++) {
                const segment = bucket[i];
                if (segment.queryStamp === stamp) continue;
                segment.queryStamp = stamp;
                candidates.push(segment);
            }
        }
    }

    return candidates.length > 0 ? candidates : collisionData.segments;
}

function checkFinishLine(p1, p2, startLine) {
    return segmentsIntersect(p1, p2, startLine.p1, startLine.p2);
}

/**
 * Run one simulation tick, mutating `state` in-place.
 * Returns the shared `_events` descriptor (valid until the next call).
 */
export function updateSimulation(
    state, dt, config, currentTrack, collisionSegments
) {
    resetEvents();
    const runPolicy = resolveRunPolicy(state);

    if (state.status === 'playing') {
        if (state.relaunchDelayRemaining > 0) {
            state.relaunchDelayRemaining = Math.max(0, state.relaunchDelayRemaining - dt);
        } else {
            state.currentTime += dt;

            const ax = Math.cos(state.angle) * config.accel;
            const ay = Math.sin(state.angle) * config.accel;

            if (state.keys.left) state.angle -= config.turnSpeed * dt;
            if (state.keys.right) state.angle += config.turnSpeed * dt;

            state.velocity.x += ax * dt;
            state.velocity.y += ay * dt;

            state.velocity.x *= state.frictionFactor;
            state.velocity.y *= state.frictionFactor;

            state.cachedSpeed = Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2);

            _nextPos.x = state.pos.x + state.velocity.x * dt;
            _nextPos.y = state.pos.y + state.velocity.y * dt;

            const hitWall = checkWallCollision(
                state.pos,
                _nextPos,
                getCollisionCandidates(state.pos, _nextPos, state.collisionHash || collisionSegments, config.carRadius),
                config.carRadius
            );

            // Checkpoint detection
            const checkpoints = currentTrack.checkpoints || [];
            if (state.nextCheckpointIndex < checkpoints.length) {
                const cp = checkpoints[state.nextCheckpointIndex];
                if (segmentsIntersect(state.pos, _nextPos, cp.p1, cp.p2)) {
                    state.nextCheckpointIndex++;
                }
            }

            // Finish line
            const crossedFinish = checkFinishLine(state.pos, _nextPos, currentTrack.startLine);
            const allPassed = checkpoints.length === 0 || state.nextCheckpointIndex >= checkpoints.length;
            if (crossedFinish) {
                if (allPassed && state.currentTime >= 2.0) {
                    Object.assign(_events, handleFinishCrossing(state, runPolicy, checkpoints.length));
                }
                state.nextCheckpointIndex = 0;
            }

            // Collision response
            if (hitWall) {
                if (state.cachedSpeed > config.crashSpeed) {
                    _events.crashImpact = Math.round(state.cachedSpeed * 20);
                    const particleCount = state.frameSkip > 0 ? 10 : 20;
                    const crashSparks = createSparkParticles(state.pos, particleCount * 5, config.sparkColor);
                    for (let j = 0; j < crashSparks.length; j++) state.particles.push(crashSparks[j]);
                    Object.assign(_events, handleHardCrash(state, runPolicy, checkpoints.length));
                } else {
                    state.velocity.x *= -0.5;
                    state.velocity.y *= -0.5;
                    state.cachedSpeed = Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2);
                    const particleCount = state.frameSkip > 0 ? 3 : 5;
                    const bounceSparks = createSparkParticles(state.pos, particleCount * 5, config.sparkColor);
                    for (let j = 0; j < bounceSparks.length; j++) state.particles.push(bounceSparks[j]);
                }
            } else {
                state.pos.x = _nextPos.x;
                state.pos.y = _nextPos.y;
            }

            // Slip / skid detection — pre-compute cos/sin and store on the slot
            const vx = Math.cos(state.angle);
            const vy = Math.sin(state.angle);
            const vMag = state.cachedSpeed || 1;
            const slip = 1 - (vx * (state.velocity.x / vMag) + vy * (state.velocity.y / vMag));

            if (slip > 0.05 && state.cachedSpeed > 2) {
                const slot = state.skidMarks.write();
                slot.x = state.pos.x;
                slot.y = state.pos.y;
                slot.cos = vx;   // cos(angle) already computed above
                slot.sin = vy;   // sin(angle) already computed above
            }

            // Route trace
            state.trailTimer += dt;
            const traceInterval = (state.frameSkip > 0 || state.qualityLevel > 0) ? 0.08 : 0.05;
            if (state.trailTimer > traceInterval) {
                const slot = state.routeTrace.write();
                slot.x = state.pos.x;
                slot.y = state.pos.y;
                state.trailTimer %= traceInterval;
            }

            // Run history (arithmetic rounding — no string alloc)
            state.runHistoryTimer += dt;
            if (state.runHistoryTimer >= 0.05) {
                const rx = Math.round(state.pos.x * 1000) / 1000;
                const ry = Math.round(state.pos.y * 1000) / 1000;
                const last = state.runHistory.last();
                if (!last || Math.abs(last.x - rx) >= 0.001 || Math.abs(last.y - ry) >= 0.001) {
                    const slot = state.runHistory.write();
                    slot.x = rx;
                    slot.y = ry;
                }
                state.runHistoryTimer %= 0.05;
            }
        }
    }

    // Particle update (in-place compaction sweep — already efficient)
    const maxParticles = state.frameSkip > 0 ? 30 : 50;
    const particles = state.particles;
    const particleStart = Math.max(0, particles.length - maxParticles);
    let writeIdx = 0;
    for (let i = particleStart; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life > 0) {
            particles[writeIdx++] = p;
        }
    }
    particles.length = writeIdx;

    return _events;
}
