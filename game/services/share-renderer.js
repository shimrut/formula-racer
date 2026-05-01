import { CONFIG } from '../config.js?v=1.89';
import {
    drawCheckeredLine,
    drawInnerDebris,
    drawOuterDebris,
    drawPresentationBackground,
    drawTrackBoundaries,
    drawTrackFinishLine,
    fillTrackPresentation
} from '../core/track-canvas.js?v=1.89';

const MODAL_SURFACE_COLOR = '#020617';
const SHARE_POSTER_TOP_INSET = 236;
const SHARE_POSTER_BOTTOM_INSET = 132;
const SHARE_POSTER_SIDE_INSET = 8;
const SHARE_POSTER_LIGHT_THEME = {
    accentColor: '#d73c40',
    footerTextColor: '#3b3c40',
    headlineShadowColor: 'rgba(15, 23, 42, 0.14)',
    surfaceColor: '#f7f7f4',
    textColor: '#2c2d31',
    timeColor: '#4f8453',
    timeShadowColor: 'rgba(15, 23, 42, 0.12)',
    vignetteStops: [
        [0, 'rgba(255, 255, 255, 0)'],
        [0.72, 'rgba(255, 255, 255, 0.24)'],
        [1, 'rgba(15, 23, 42, 0.08)']
    ]
};
const SHARE_POSTER_DARK_THEME = {
    accentColor: '#f87171',
    footerTextColor: '#e5e7eb',
    headlineShadowColor: 'rgba(0, 0, 0, 0.45)',
    surfaceColor: '#020617',
    textColor: '#f8fafc',
    timeColor: '#86efac',
    timeShadowColor: 'rgba(0, 0, 0, 0.5)',
    vignetteStops: [
        [0, 'rgba(255, 255, 255, 0.03)'],
        [0.72, 'rgba(15, 23, 42, 0.14)'],
        [1, 'rgba(0, 0, 0, 0.4)']
    ]
};
const SHARE_IMAGE_RENDER_SCALE = 2;
const SHARE_IMAGE_JPEG_QUALITY = 0.95;
const SHARE_POSTER_TIME_ICONS = ['helmet', 'swords', 'flame'];
const SHARE_POSTER_HEADLINES = [
    "THINK YOU'RE FAST?",
    'LOOKS EASY, RIGHT?',
    'GOT WHAT IT TAKES?'
];
const SHARE_POSTER_SUBHEADLINES = [
    'PROVE IT',
    'TRY IT',
    'BRING IT'
];

function getShareCaption(payload) {
    return `Think you're fast? Prove it. Beat my ${payload.lapTime.toFixed(2)}s on ${payload.trackName}: vectorgp.run`;
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

function getSharePosterTheme() {
    const prefersDarkMode = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches;

    return prefersDarkMode ? SHARE_POSTER_DARK_THEME : SHARE_POSTER_LIGHT_THEME;
}

function getRandomSharePosterCopy() {
    return {
        headline: SHARE_POSTER_HEADLINES[Math.floor(Math.random() * SHARE_POSTER_HEADLINES.length)],
        subheadline: SHARE_POSTER_SUBHEADLINES[Math.floor(Math.random() * SHARE_POSTER_SUBHEADLINES.length)]
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

function buildMappedPath(points, mapPoint) {
    const path = new Path2D();
    if (!points.length) return path;

    const first = mapPoint(points[0]);
    path.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i += 1) {
        const point = mapPoint(points[i]);
        path.lineTo(point.x, point.y);
    }
    path.closePath();
    return path;
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

function drawFittedText(ctx, text, x, y, maxWidth, {
    family = 'outfit, system-ui, -apple-system, sans-serif',
    maxSize = 48,
    minSize = 24,
    weight = 900,
    style = 'normal'
} = {}) {
    let fontSize = maxSize;
    while (fontSize > minSize) {
        ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
        if (ctx.measureText(text).width <= maxWidth) break;
        fontSize -= 1;
    }
    ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
    ctx.fillText(text, x, y);
}

function drawPosterSpeedWing(ctx, x, y, fillColor, direction = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(direction, 1);
    ctx.fillStyle = fillColor;

    [
        { x0: 0, y0: -10, x1: 58, y1: -12, x2: 62, y2: -4, x3: 10, y3: -5 },
        { x0: 12, y0: 6, x1: 58, y1: 4, x2: 64, y2: 12, x3: 4, y3: 12 }
    ].forEach((wing) => {
        ctx.beginPath();
        ctx.moveTo(wing.x0, wing.y0);
        ctx.lineTo(wing.x1, wing.y1);
        ctx.lineTo(wing.x2, wing.y2);
        ctx.lineTo(wing.x3, wing.y3);
        ctx.closePath();
        ctx.fill();
    });

    ctx.restore();
}

function drawSharePosterBackground(ctx, width, height, theme) {
    ctx.fillStyle = theme.surfaceColor;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        width * 0.18,
        width * 0.5,
        height * 0.45,
        width * 0.8
    );
    theme.vignetteStops.forEach(([offset, color]) => {
        vignette.addColorStop(offset, color);
    });
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
}

function drawSharePosterHeadline(ctx, width, theme, copy) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.textColor;
    ctx.shadowColor = theme.headlineShadowColor;
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;

    drawFittedText(ctx, copy.headline, width / 2, 88, width - 96, {
        maxSize: 40,
        minSize: 28,
        weight: 900
    });

    drawPosterSpeedWing(ctx, width / 2 - 172, 146, theme.accentColor, -1);
    drawPosterSpeedWing(ctx, width / 2 + 172, 146, theme.accentColor, 1);

    ctx.fillStyle = theme.accentColor;
    drawFittedText(ctx, copy.subheadline, width / 2, 148, width - 140, {
        maxSize: 52,
        minSize: 32,
        weight: 900,
        style: 'italic'
    });

    ctx.restore();
}

function drawPosterTrackBoundary(ctx, points, mapPoint) {
    if (!points.length) return;

    const strokePasses = [
        { width: 10, color: '#475569', blur: 0, shadow: 'transparent' },
        { width: 5, color: '#ffffff', blur: 0, shadow: 'transparent' }
    ];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePasses.forEach((pass) => {
        ctx.lineWidth = pass.width;
        ctx.strokeStyle = pass.color;
        ctx.shadowBlur = pass.blur;
        ctx.shadowColor = pass.shadow;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        traceMappedPath(ctx, points, mapPoint, true);
        ctx.stroke();
    });
    ctx.restore();
}

function drawPosterRunTrace(ctx, points, mapPoint) {
    if (points.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.16)';
    ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
    ctx.shadowBlur = 18;
    traceMappedPath(ctx, points, mapPoint, false);
    ctx.stroke();

    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.28)';
    ctx.shadowColor = 'rgba(248, 113, 113, 0.5)';
    ctx.shadowBlur = 10;
    traceMappedPath(ctx, points, mapPoint, false);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fecaca';
    ctx.shadowBlur = 0;
    traceMappedPath(ctx, points, mapPoint, false);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ef4444';
    traceMappedPath(ctx, points, mapPoint, false);
    ctx.stroke();

    ctx.restore();
}

function drawSharePosterTrack(ctx, payload, layout, theme) {
    const { mapPoint, run } = layout;
    const trackOuter = payload.trackGeometry?.outer ?? [];
    const trackInner = payload.trackGeometry?.inner ?? [];
    const startLine = payload.startLine ?? { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } };

    ctx.save();

    const trackFill = ctx.createLinearGradient(84, 280, 584, 500);
    trackFill.addColorStop(0, '#475569');
    trackFill.addColorStop(0.48, '#1f2937');
    trackFill.addColorStop(1, '#334155');

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    traceMappedPath(ctx, trackOuter, mapPoint, true);
    ctx.fillStyle = trackFill;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    traceMappedPath(ctx, trackInner, mapPoint, true);
    ctx.fillStyle = theme.surfaceColor;
    ctx.fill();

    drawPosterTrackBoundary(ctx, trackOuter, mapPoint);
    drawPosterTrackBoundary(ctx, trackInner, mapPoint);
    drawPosterRunTrace(ctx, run, mapPoint);
    drawCheckeredLine(ctx, mapPoint(startLine.p1), mapPoint(startLine.p2), 14);

    ctx.restore();
}

function drawSharePosterFooter(ctx, payload, width, height, theme) {
    const trackUpper = String(payload.trackName ?? '').toUpperCase();
    const siteY = height - 108;
    const trackNameY = height - 72;

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.footerTextColor;

    ctx.textAlign = 'center';
    drawFittedText(ctx, 'vectorgp.run', width / 2, siteY + 1, width - 280, {
        maxSize: 26,
        minSize: 18,
        weight: 700
    });

    drawFittedText(ctx, trackUpper, width / 2, trackNameY, width - 280, {
        maxSize: 31,
        minSize: 20,
        weight: 800
    });

    ctx.restore();
}

function renderSharePosterFrame(ctx, payload, width, height) {
    const theme = getSharePosterTheme();
    const copy = getRandomSharePosterCopy();

    ctx.clearRect(0, 0, width, height);
    drawSharePosterBackground(ctx, width, height, theme);
    drawSharePosterHeadline(ctx, width, theme, copy);

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const timeIcon = SHARE_POSTER_TIME_ICONS[Math.floor(Math.random() * SHARE_POSTER_TIME_ICONS.length)];
    drawShareCardIcon(ctx, timeIcon, width - 240, 190, 120, {
        stroke: theme.timeColor,
        alpha: 0.12,
        lineWidth: 1.8
    });
    ctx.fillStyle = theme.timeColor;
    ctx.shadowColor = theme.timeShadowColor;
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    drawFittedText(ctx, `${payload.lapTime.toFixed(2)}s`, width - 44, 248, width - 240, {
        maxSize: 54,
        minSize: 34,
        weight: 900,
        style: 'italic'
    });
    ctx.restore();

    const layout = getReplayLayout(
        payload,
        width,
        height,
        SHARE_POSTER_TOP_INSET,
        SHARE_POSTER_BOTTOM_INSET,
        SHARE_POSTER_SIDE_INSET
    );
    drawSharePosterTrack(ctx, payload, layout, theme);
    drawSharePosterFooter(ctx, payload, width, height, theme);
}

function drawSvgPolylinePath(ctx, points) {
    const coords = points.trim().split(/\s+/).map(Number);
    if (coords.length < 4) return;

    ctx.moveTo(coords[0], coords[1]);
    for (let i = 2; i < coords.length; i += 2) {
        ctx.lineTo(coords[i], coords[i + 1]);
    }
}

function drawShareCardIcon(ctx, iconName, x, y, size, { stroke = '#f8fafc', alpha = 1, lineWidth = 2 } = {}) {
    const scale = size / 24;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const strokePath = (d) => ctx.stroke(new Path2D(d));
    const strokeLine = (x1, y1, x2, y2) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };
    const strokePolyline = (points) => {
        ctx.beginPath();
        drawSvgPolylinePath(ctx, points);
        ctx.stroke();
    };

    switch (iconName) {
        case 'helmet':
            strokePath('M22 12.2a10 10 0 1 0-19.4 3.2c.2.5.8 1.1 1.3 1.3l13.2 5.1c.5.2 1.2 0 1.6-.3l2.6-2.6c.4-.4.7-1.2.7-1.7Z');
            strokePath('m21.8 18-10.5-4a2 2.06 0 0 1 .7-4h9.8');
            break;
        case 'ghost':
            strokePath('M9 10h.01');
            strokePath('M15 10h.01');
            strokePath('M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z');
            break;
        case 'cat':
            strokePath('m6 7 .5.5');
            strokePath('m18 7-.5.5');
            strokePath('M5 13a5 5 0 1 0 6.8 7.2l3-3.6A1 1 0 0 0 14 15h-4a1 1 0 0 0-.8 1.6l3 3.6A5 5 0 1 0 19 13h3c0-1.2-.4-2.4-1-3.4a3 3 0 0 0-5.8-5.3l-1 1a7 4 0 0 0-4.4 0l-1-1A3 3 0 0 0 3 9.6c-.6 1-1 2.2-1 3.4Z');
            strokePath('M10 11v-.5');
            strokePath('M14 11v-.5');
            strokePath('M5 18H2');
            strokePath('M19 18h3');
            break;
        case 'swords':
            strokePolyline('14.5 17.5 3 6 3 3 6 3 17.5 14.5');
            strokeLine(13, 19, 19, 13);
            strokeLine(16, 16, 20, 20);
            strokeLine(19, 21, 21, 19);
            strokePolyline('14.5 6.5 18 3 21 3 21 6 17.5 9.5');
            strokeLine(5, 14, 9, 18);
            strokeLine(7, 17, 4, 20);
            strokeLine(3, 19, 5, 21);
            break;
        case 'flame':
            strokePath('M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4');
            break;
        default:
            break;
    }

    ctx.restore();
}

function renderReplayFrame(ctx, payload, layout, width, height, progress, options = {}) {
    const { bottomInset, run, mapPoint } = layout;
    const showHud = options.showHud ?? true;
    const showMarker = options.showMarker ?? true;
    const showRoute = options.showRoute ?? true;
    const showDirectionMarker = options.showDirectionMarker ?? false;
    const transparentBackground = options.transparentBackground ?? false;
    const trackOuter = payload.trackGeometry?.outer ?? [];
    const trackInner = payload.trackGeometry?.inner ?? [];
    const startLine = payload.startLine ?? { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } };
    const startPos = payload.startPos ?? trackOuter[0] ?? { x: 0, y: 0 };
    const startAngle = payload.startAngle ?? 0;
    const presentation = payload.presentation ?? {};
    const currentPoint = getReplayProgressPoint(run, progress);
    const drawCount = Math.max(1, Math.floor(progress * (run.length - 1)));
    const revealedPoints = run.slice(0, drawCount + 1);
    if (revealedPoints[revealedPoints.length - 1] !== currentPoint) {
        revealedPoints.push(currentPoint);
    }

    ctx.clearRect(0, 0, width, height);

    if (!transparentBackground) {
        drawPresentationBackground(ctx, width, height, presentation, `${payload.trackName || payload.trackKey || 'track'}:share:${width}x${height}`);
    }

    if (!transparentBackground && showHud && bottomInset > 0) {
        ctx.fillStyle = presentation.offTrackColor || MODAL_SURFACE_COLOR;
        ctx.fillRect(0, height - bottomInset, width, bottomInset);
    }

    const surfacePath = new Path2D();
    surfacePath.addPath(buildMappedPath(trackOuter, mapPoint));
    surfacePath.addPath(buildMappedPath(trackInner, mapPoint));

    const outerPath = buildMappedPath(trackOuter, mapPoint);
    const innerPath = buildMappedPath(trackInner, mapPoint);

    fillTrackPresentation(ctx, surfacePath, innerPath, outerPath, width, height, presentation);
    drawTrackBoundaries(ctx, outerPath, innerPath, presentation);
    drawOuterDebris(ctx, trackOuter, mapPoint, presentation);
    drawInnerDebris(ctx, trackInner, mapPoint, presentation);

    const lineStart = mapPoint(startLine.p1);
    const lineEnd = mapPoint(startLine.p2);
    drawTrackFinishLine(ctx, lineStart, lineEnd, 8, presentation);
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

function canvasToBlob(canvas, {
    type = 'image/jpeg',
    quality = SHARE_IMAGE_JPEG_QUALITY
} = {}) {
    return new Promise((resolve, reject) => {
        if (canvas.toBlob) {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }
                reject(new Error('Canvas export returned an empty blob.'));
            }, type, type === 'image/jpeg' ? quality : undefined);
            return;
        }

        try {
            const dataUrl = canvas.toDataURL(type, type === 'image/jpeg' ? quality : undefined);
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
        includeHeader = true,
        includeSourcePill = false
    } = options;
    const width = 640;
    const height = 640;
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = width * SHARE_IMAGE_RENDER_SCALE;
    renderCanvas.height = height * SHARE_IMAGE_RENDER_SCALE;
    const renderCtx = renderCanvas.getContext('2d');
    renderCtx.scale(SHARE_IMAGE_RENDER_SCALE, SHARE_IMAGE_RENDER_SCALE);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const shouldRenderPoster = includeCaption || includeHeader || includeSourcePill;
    if (shouldRenderPoster) {
        renderSharePosterFrame(renderCtx, payload, width, height);
        ctx.drawImage(renderCanvas, 0, 0, width, height);
        return canvasToBlob(canvas, { type: 'image/jpeg' });
    }

    const layout = getReplayLayout(payload, width, height, 0, 0, 0);
    renderReplayFrame(renderCtx, payload, layout, width, height, 1, {
        showHud: false,
        showMarker: false,
        transparentBackground: true
    });
    ctx.drawImage(renderCanvas, 0, 0, width, height);

    return canvasToBlob(canvas, { type: 'image/png' });
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
        showDirectionMarker: true,
        transparentBackground: payload.transparentBackground ?? true
    });
}

export {
    buildShareImageBlob,
    getShareCaption,
    getShareFilename,
    renderTrackPreviewCanvas
};
