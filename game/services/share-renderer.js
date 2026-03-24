import { CONFIG } from '../config.js?v=0.71';

const SHARE_HEADER_HEIGHT = 128;
const SHARE_EXPORT_SIDE_INSET = 36;
const MODAL_SURFACE_COLOR = '#020617';

function getShareCaption(payload) {
    return `I ran ${payload.trackName} in 🏁 ${payload.lapTime.toFixed(2)}s. Can you beat it? \n 🏎️ vectorgp.run `;
}

function getShareFilename(payload) {
    return `${payload.trackKey}-${payload.lapTime.toFixed(2).replace('.', '-')}.jpg`;
}

function getReplayLayout(payload, width, height, topInset = 0, bottomInset = 0, sideInset = 0) {
    const padding = 28;
    const trackOuter = payload.trackGeometry?.outer ?? [];
    const trackInner = payload.trackGeometry?.inner ?? [];
    const runHistory = payload.runHistory ?? [];
    const startPos = payload.startPos ?? trackOuter[0] ?? { x: 0, y: 0 };
    const endPos = runHistory[runHistory.length - 1] ?? startPos;
    const run = runHistory.length > 1 ? runHistory : [startPos, endPos];
    const points = [...trackOuter, ...trackInner, ...run];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const usableWidth = width - padding * 2 - sideInset * 2;
    const usableHeight = height - topInset - bottomInset - padding * 2;
    const scale = Math.min(usableWidth / Math.max(1, maxX - minX), usableHeight / Math.max(1, maxY - minY));
    const offsetX = sideInset + padding + (usableWidth - (maxX - minX) * scale) / 2;
    const offsetY = topInset + padding + (usableHeight - (maxY - minY) * scale) / 2;

    return {
        bottomInset,
        run,
        mapPoint: (point) => ({
            x: offsetX + (point.x - minX) * scale,
            y: offsetY + (point.y - minY) * scale
        })
    };
}

function getReplayProgressPoint(run, progress) {
    if (run.length === 1) {
        return run[0];
    }

    const scaledIndex = progress * (run.length - 1);
    const baseIndex = Math.floor(scaledIndex);
    const nextIndex = Math.min(run.length - 1, baseIndex + 1);
    const t = scaledIndex - baseIndex;
    const start = run[baseIndex];
    const end = run[nextIndex];

    return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
    };
}

function traceMappedPath(ctx, points, mapPoint, closePath = false) {
    if (!points.length) return;

    const first = mapPoint(points[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
        const point = mapPoint(points[i]);
        ctx.lineTo(point.x, point.y);
    }
    if (closePath) {
        ctx.closePath();
    }
}

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

function drawNeonRoute(ctx, points, mapPoint) {
    if (points.length < 2) return;

    const strokePass = (width, color, blur, shadowRgb) => {
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        if (blur > 0) {
            ctx.shadowColor = shadowRgb;
            ctx.shadowBlur = blur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        } else {
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowColor = 'transparent';
        }
        traceMappedPath(ctx, points, mapPoint, false);
        ctx.stroke();
    };

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    strokePass(18, 'rgba(239, 68, 68, 0.12)', 22, 'rgba(239, 68, 68, 0.75)');
    strokePass(10, 'rgba(239, 68, 68, 0.22)', 14, 'rgba(248, 113, 113, 0.65)');
    strokePass(4, 'rgba(252, 165, 165, 0.85)', 6, 'rgba(254, 202, 202, 0.45)');
    strokePass(2, '#fecaca', 0, 'transparent');
    strokePass(1.25, CONFIG.curbRed, 0, 'transparent');

    ctx.restore();
}

function drawDirectionMarker(ctx, position, angle) {
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(angle || 0);

    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, -6);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

function drawShareHeader(ctx, payload, width, headerHeight) {
    const lapTimeText = `${payload.lapTime.toFixed(2)}s`;
    const trackNameText = payload.trackName ?? '';
    const lapTimeY = headerHeight * 0.7;
    const trackNameY = headerHeight;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.font = '900 64px "JetBrains Mono", "Courier New", monospace';
    ctx.fillStyle = '#22c55e';
    ctx.fillText(lapTimeText, width / 2, lapTimeY);

    ctx.font = '700 24px outfit, system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(trackNameText, width / 2, trackNameY);
    ctx.restore();
}

function renderReplayFrame(ctx, payload, layout, width, height, progress, options = {}) {
    const { bottomInset, run, mapPoint } = layout;
    const showHud = options.showHud ?? true;
    const showMarker = options.showMarker ?? true;
    const showRoute = options.showRoute ?? true;
    const showDirectionMarker = options.showDirectionMarker ?? false;
    const trackOuter = payload.trackGeometry?.outer ?? [];
    const trackInner = payload.trackGeometry?.inner ?? [];
    const startLine = payload.startLine ?? { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } };
    const startPos = payload.startPos ?? trackOuter[0] ?? { x: 0, y: 0 };
    const startAngle = payload.startAngle ?? 0;
    const currentPoint = getReplayProgressPoint(run, progress);
    const drawCount = Math.max(1, Math.floor(progress * (run.length - 1)));
    const revealedPoints = run.slice(0, drawCount + 1);
    if (revealedPoints[revealedPoints.length - 1] !== currentPoint) {
        revealedPoints.push(currentPoint);
    }

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = MODAL_SURFACE_COLOR;
    ctx.fillRect(0, 0, width, height);

    if (showHud && bottomInset > 0) {
        ctx.fillStyle = MODAL_SURFACE_COLOR;
        ctx.fillRect(0, height - bottomInset, width, bottomInset);
    }

    traceMappedPath(ctx, trackOuter, mapPoint, true);
    ctx.fillStyle = '#334155';
    ctx.fill();

    traceMappedPath(ctx, trackInner, mapPoint, true);
    ctx.fillStyle = '#020617';
    ctx.fill();

    traceMappedPath(ctx, trackOuter, mapPoint, true);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineJoin = 'round';
    ctx.stroke();

    traceMappedPath(ctx, trackInner, mapPoint, true);
    ctx.strokeStyle = '#cbd5e1';
    ctx.stroke();

    const lineStart = mapPoint(startLine.p1);
    const lineEnd = mapPoint(startLine.p2);
    drawCheckeredLine(ctx, lineStart, lineEnd, 8);
    if (showDirectionMarker) {
        drawDirectionMarker(ctx, mapPoint(startPos), startAngle);
    }

    if (showRoute) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (progress < 1 && run.length > 1) {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.06)';
            ctx.lineWidth = 7;
            ctx.shadowBlur = 0;
            traceMappedPath(ctx, run, mapPoint, false);
            ctx.stroke();
        }
        ctx.restore();

        drawNeonRoute(ctx, revealedPoints, mapPoint);
    }

    if (showRoute && showMarker) {
        const marker = mapPoint(currentPoint);
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 8, 0, Math.PI * 2);
        ctx.fill();
    }
}

function wrapText(ctx, text, maxWidth) {
    const paragraphs = text.split(/\n/);
    const lines = [];
    for (const para of paragraphs) {
        const words = para.split(/\s+/).filter((word) => word.length > 0);
        let line = '';
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            const metrics = ctx.measureText(test);
            if (metrics.width > maxWidth && line) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
    }
    return lines;
}

function drawShareCaption(ctx, payload, width, height) {
    const caption = 'vectorgp.run';
    const pad = 21;
    const lineHeight = 32;
    const fontSize = 24;
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, caption, width - pad * 2);
    const textBlockHeight = lines.length * lineHeight + pad * 2;
    const y0 = height - textBlockHeight;
    ctx.fillStyle = '#f8fafc';
    lines.forEach((line, index) => {
        ctx.fillText(line, width / 2, y0 + pad + lineHeight / 2 + index * lineHeight);
    });
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        if (canvas.toBlob) {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }
                reject(new Error('Canvas export returned an empty blob.'));
            }, 'image/jpeg', 0.9);
            return;
        }

        try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            fetch(dataUrl)
                .then((response) => response.blob())
                .then(resolve)
                .catch(reject);
        } catch (error) {
            reject(error);
        }
    });
}

function buildShareImageBlob(payload, options = {}) {
    const {
        includeCaption = true,
        includeHeader = true
    } = options;
    const width = 640;
    const height = 640;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const layout = getReplayLayout(
        payload,
        width,
        height,
        includeHeader ? SHARE_HEADER_HEIGHT : 0,
        0,
        includeHeader ? SHARE_EXPORT_SIDE_INSET : 0
    );

    renderReplayFrame(ctx, payload, layout, width, height, 1, {
        showHud: false,
        showMarker: false
    });
    if (includeHeader) {
        drawShareHeader(ctx, payload, width, SHARE_HEADER_HEIGHT);
    }

    if (includeCaption) {
        drawShareCaption(ctx, payload, width, height);
    }

    return canvasToBlob(canvas);
}

function renderTrackPreviewCanvas(canvas, payload) {
    if (!canvas || !payload) return;

    const width = canvas.width || 640;
    const height = canvas.height || 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const layout = getReplayLayout(payload, width, height, 0, 0);
    renderReplayFrame(ctx, payload, layout, width, height, 1, {
        showHud: false,
        showMarker: false,
        showRoute: false,
        showDirectionMarker: true
    });
}

function addCaptionToBlob(blob, payload, options = {}) {
    const { includeCaption = true } = options;
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            if (includeCaption) {
                drawShareCaption(ctx, payload, canvas.width, canvas.height);
            }
            canvasToBlob(canvas).then(resolve).catch(reject);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for caption'));
        };
        img.src = url;
    });
}

export {
    addCaptionToBlob,
    buildShareImageBlob,
    getShareCaption,
    getShareFilename,
    renderTrackPreviewCanvas
};
