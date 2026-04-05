import { CONFIG } from '../config.js?v=1.35';

function drawCheckeredLine(ctx, p1, p2, width) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;

    const tx = dx / length;
    const ty = dy / length;
    const nx = -ty;
    const ny = tx;
    const rows = 2;
    const columns = Math.max(2, Math.ceil(length / Math.max(6, width * 0.8)));
    const cellLength = length / columns;
    const rowHeight = width / rows;

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    ctx.strokeStyle = 'rgba(2, 6, 23, 0.45)';
    ctx.lineWidth = width + 4;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    for (let row = 0; row < rows; row++) {
        const innerOffset = -width / 2 + row * rowHeight;
        const outerOffset = innerOffset + rowHeight;

        for (let col = 0; col < columns; col++) {
            const startDist = col * cellLength;
            const endDist = (col + 1) * cellLength;
            const sx = p1.x + tx * startDist;
            const sy = p1.y + ty * startDist;
            const ex = p1.x + tx * endDist;
            const ey = p1.y + ty * endDist;

            ctx.fillStyle = (row + col) % 2 === 0
                ? CONFIG.finishLineColor
                : CONFIG.finishLineDarkColor;
            ctx.beginPath();
            ctx.moveTo(sx + nx * innerOffset, sy + ny * innerOffset);
            ctx.lineTo(ex + nx * innerOffset, ey + ny * innerOffset);
            ctx.lineTo(ex + nx * outerOffset, ey + ny * outerOffset);
            ctx.lineTo(sx + nx * outerOffset, sy + ny * outerOffset);
            ctx.closePath();
            ctx.fill();
        }
    }

    ctx.strokeStyle = CONFIG.finishLineBorderColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * (width / 2), p1.y + ny * (width / 2));
    ctx.lineTo(p2.x + nx * (width / 2), p2.y + ny * (width / 2));
    ctx.moveTo(p1.x - nx * (width / 2), p1.y - ny * (width / 2));
    ctx.lineTo(p2.x - nx * (width / 2), p2.y - ny * (width / 2));
    ctx.stroke();
    ctx.restore();
}

function drawTireBarrier(ctx, x, y, angle) {
    const tireOffsets = [-12, 0, 12];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    for (let i = 0; i < tireOffsets.length; i++) {
        const offset = tireOffsets[i];
        const yOffset = i === 1 ? 0 : 2;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.28)';
        ctx.beginPath();
        ctx.ellipse(offset + 1.5, yOffset + 2, 8, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();

        const sidewall = ctx.createRadialGradient(offset - 2, yOffset - 2, 1, offset, yOffset, 8);
        sidewall.addColorStop(0, '#4b5563');
        sidewall.addColorStop(0.3, '#1f2937');
        sidewall.addColorStop(0.75, '#0f172a');
        sidewall.addColorStop(1, '#020617');
        ctx.fillStyle = sidewall;
        ctx.beginPath();
        ctx.ellipse(offset, yOffset, 7.5, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(offset, yOffset, 5.5, 4.4, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.ellipse(offset, yOffset, 2.2, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(226, 232, 240, 0.12)';
        ctx.lineWidth = 1;
        for (let tread = -3; tread <= 3; tread += 3) {
            ctx.beginPath();
            ctx.moveTo(offset + tread, yOffset - 4.8);
            ctx.lineTo(offset + tread, yOffset + 4.8);
            ctx.stroke();
        }
    }

    ctx.restore();
}

function buildClosedPath(points, mapPoint) {
    const path = new Path2D();
    let mappedPoint = mapPoint(points[0]);
    path.moveTo(mappedPoint.x, mappedPoint.y);
    for (let i = 1; i < points.length; i++) {
        mappedPoint = mapPoint(points[i]);
        path.lineTo(mappedPoint.x, mappedPoint.y);
    }
    path.closePath();
    return path;
}

export function buildTrackCanvas(track, geometry) {
    const gs = CONFIG.gridSize;
    const outer = geometry.outer ?? [];
    const inner = geometry.inner ?? [];

    if (outer.length < 3 || inner.length < 3) {
        return {
            canvas: null,
            origin: { x: 0, y: 0 }
        };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of [...outer, ...inner]) {
        const px = point.x * gs;
        const py = point.y * gs;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
    }

    const padding = gs * 5;
    const origin = {
        x: minX - padding,
        y: minY - padding
    };
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((maxX - minX) + padding * 2);
    canvas.height = Math.ceil((maxY - minY) + padding * 2);

    const ctx = canvas.getContext('2d', { alpha: false });
    const offsetX = -origin.x;
    const offsetY = -origin.y;
    const mapTrackPoint = (point) => ({
        x: point.x * gs + offsetX,
        y: point.y * gs + offsetY
    });

    ctx.fillStyle = CONFIG.offTrackColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const surfacePath = new Path2D();
    let mappedPoint = mapTrackPoint(outer[0]);
    surfacePath.moveTo(mappedPoint.x, mappedPoint.y);
    for (let i = 1; i < outer.length; i++) {
        mappedPoint = mapTrackPoint(outer[i]);
        surfacePath.lineTo(mappedPoint.x, mappedPoint.y);
    }
    surfacePath.closePath();
    mappedPoint = mapTrackPoint(inner[0]);
    surfacePath.moveTo(mappedPoint.x, mappedPoint.y);
    for (let i = 1; i < inner.length; i++) {
        mappedPoint = mapTrackPoint(inner[i]);
        surfacePath.lineTo(mappedPoint.x, mappedPoint.y);
    }
    surfacePath.closePath();

    const outerPath = buildClosedPath(outer, mapTrackPoint);
    const innerPath = buildClosedPath(inner, mapTrackPoint);

    ctx.fillStyle = CONFIG.trackColor;
    ctx.fill(surfacePath, 'evenodd');

    const drawCurb = (path) => {
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([20, 20]);
        ctx.strokeStyle = CONFIG.curbRed;
        ctx.stroke(path);
        ctx.lineDashOffset = 20;
        ctx.strokeStyle = CONFIG.curbWhite;
        ctx.stroke(path);
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke(path);
    };

    drawCurb(outerPath);
    drawCurb(innerPath);

    const tireStep = 18;
    for (let i = 0; i < outer.length; i += tireStep) {
        const point = outer[i];
        const prev = outer[(i - 1 + outer.length) % outer.length];
        const next = outer[(i + 1) % outer.length];
        const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
        drawTireBarrier(ctx, point.x * gs + offsetX, point.y * gs + offsetY, angle);
    }

    const startLine = track.startLine;
    drawCheckeredLine(
        ctx,
        { x: startLine.p1.x * gs + offsetX, y: startLine.p1.y * gs + offsetY },
        { x: startLine.p2.x * gs + offsetX, y: startLine.p2.y * gs + offsetY },
        10
    );

    return { canvas, origin };
}
