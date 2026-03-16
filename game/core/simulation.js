export function compactPathPoints(points, maxPoints, preserveTail) {
    if (points.length <= maxPoints) return points;

    const tailCount = Math.min(preserveTail, points.length);
    const headEnd = points.length - tailCount;
    const compacted = [];

    for (let i = 0; i < headEnd; i += 2) {
        compacted.push(points[i]);
    }
    for (let i = headEnd; i < points.length; i++) {
        compacted.push(points[i]);
    }

    if (compacted.length > maxPoints) {
        return compacted.slice(compacted.length - maxPoints);
    }
    return compacted;
}

export function recordRunPoint(runHistory, point, { frameSkip, qualityLevel }) {
    const x = Number(point.x.toFixed(3));
    const y = Number(point.y.toFixed(3));
    const lastPoint = runHistory[runHistory.length - 1];
    if (lastPoint && Math.abs(lastPoint.x - x) < 0.001 && Math.abs(lastPoint.y - y) < 0.001) {
        return runHistory;
    }

    return compactPathPoints(
        [...runHistory, { x, y }],
        (frameSkip > 0 || qualityLevel > 0) ? 900 : 1400,
        160
    );
}

export function createSparkParticles(pos, count, sparkColor) {
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

export function checkWallCollision(p1, p2, collisionSegments, carRadius, getIntersection) {
    if (collisionSegments.length === 0) return false;

    const carRadiusSq = carRadius * carRadius;
    const minX = Math.min(p1.x, p2.x) - carRadius;
    const maxX = Math.max(p1.x, p2.x) + carRadius;
    const minY = Math.min(p1.y, p2.y) - carRadius;
    const maxY = Math.max(p1.y, p2.y) + carRadius;

    for (const segment of collisionSegments) {
        if (maxX < segment.minX || minX > segment.maxX || maxY < segment.minY || minY > segment.maxY) {
            continue;
        }

        if (getIntersection(p1, p2, segment.start, segment.end)) return true;

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

export function checkFinishLine(p1, p2, startLine, getIntersection) {
    return !!getIntersection(p1, p2, startLine.p1, startLine.p2);
}

export function updateSimulation({
    dt,
    state,
    config,
    currentTrack,
    collisionSegments,
    frameSkip,
    qualityLevel,
    getIntersection
}) {
    let {
        status,
        currentTime,
        angle,
        pos,
        velocity,
        cachedSpeed,
        nextCheckpointIndex,
        skidMarks,
        routeTrace,
        particles,
        trailTimer,
        runHistory,
        runHistoryTimer
    } = state;
    let winTriggered = false;
    let crashImpact = null;

    if (status === 'playing') {
        currentTime += dt;

        let ax = 0;
        let ay = 0;

        ax += Math.cos(angle) * config.accel;
        ay += Math.sin(angle) * config.accel;

        if (state.keys.left) angle -= config.turnSpeed * dt;
        if (state.keys.right) angle += config.turnSpeed * dt;

        velocity = {
            x: velocity.x + ax * dt,
            y: velocity.y + ay * dt
        };

        const frictionFactor = Math.pow(config.friction, dt * 60);
        velocity = {
            x: velocity.x * frictionFactor,
            y: velocity.y * frictionFactor
        };

        cachedSpeed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);

        const nextPos = {
            x: pos.x + velocity.x * dt,
            y: pos.y + velocity.y * dt
        };

        const hitWall = checkWallCollision(pos, nextPos, collisionSegments, config.carRadius, getIntersection);

        const checkpoints = currentTrack.checkpoints || [];
        if (nextCheckpointIndex < checkpoints.length) {
            const cp = checkpoints[nextCheckpointIndex];
            if (getIntersection(pos, nextPos, cp.p1, cp.p2)) {
                nextCheckpointIndex++;
            }
        }

        const crossedFinish = checkFinishLine(pos, nextPos, currentTrack.startLine, getIntersection);
        const allPassed = checkpoints.length === 0 || nextCheckpointIndex >= checkpoints.length;
        if (crossedFinish) {
            if (allPassed && currentTime >= 2.0) {
                status = 'won';
                winTriggered = true;
            }
            nextCheckpointIndex = 0;
        }

        if (hitWall) {
            if (cachedSpeed > config.crashSpeed) {
                status = 'crashed';
                crashImpact = Math.round(cachedSpeed * 20);
                const particleCount = frameSkip > 0 ? 10 : 20;
                particles = [...particles, ...createSparkParticles(pos, particleCount * 5, config.sparkColor)];
            } else {
                velocity = {
                    x: velocity.x * -0.5,
                    y: velocity.y * -0.5
                };
                pos = {
                    x: pos.x - velocity.x * dt * 2,
                    y: pos.y - velocity.y * dt * 2
                };
                const particleCount = frameSkip > 0 ? 3 : 5;
                particles = [...particles, ...createSparkParticles(pos, particleCount * 5, config.sparkColor)];
            }
        } else {
            pos = nextPos;
        }

        const vx = Math.cos(angle);
        const vy = Math.sin(angle);
        const vMag = cachedSpeed || 1;
        const vNormX = velocity.x / vMag;
        const vNormY = velocity.y / vMag;
        const slip = 1 - (vx * vNormX + vy * vNormY);

        if (slip > 0.05 && cachedSpeed > 2) {
            skidMarks = [
                ...skidMarks,
                {
                    x: pos.x,
                    y: pos.y,
                    angle,
                    alpha: 1.0
                }
            ];
            const maxSkids = (frameSkip > 0 || qualityLevel > 0) ? 60 : 160;
            if (skidMarks.length > maxSkids) skidMarks = skidMarks.slice(1);
        }

        trailTimer += dt;
        const traceInterval = (frameSkip > 0 || qualityLevel > 0) ? 0.08 : 0.05;
        if (trailTimer > traceInterval) {
            routeTrace = compactPathPoints(
                [...routeTrace, { x: pos.x, y: pos.y }],
                (frameSkip > 0 || qualityLevel > 0) ? 240 : 480,
                96
            );
            trailTimer %= traceInterval;
        }

        runHistoryTimer += dt;
        if (runHistoryTimer >= 0.05) {
            runHistory = recordRunPoint(runHistory, pos, { frameSkip, qualityLevel });
            runHistoryTimer %= 0.05;
        }
    }

    const maxParticles = frameSkip > 0 ? 30 : 50;
    if (particles.length > maxParticles) {
        particles = particles.slice(particles.length - maxParticles);
    }

    particles = particles.reduceRight((nextParticles, particle) => {
        const nextParticle = {
            ...particle,
            x: particle.x + particle.vx * dt,
            y: particle.y + particle.vy * dt,
            life: particle.life - dt
        };
        if (nextParticle.life > 0) {
            nextParticles.unshift(nextParticle);
        }
        return nextParticles;
    }, []);

    return {
        status,
        currentTime,
        angle,
        pos,
        velocity,
        cachedSpeed,
        nextCheckpointIndex,
        skidMarks,
        routeTrace,
        particles,
        trailTimer,
        runHistory,
        runHistoryTimer
,
        events: {
            winTriggered,
            crashImpact
        }
    };
}
