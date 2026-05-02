import { TRACKS } from '../tracks.js?v=1.90';
import { TRACK_MODE_LABELS } from '../modes.js?v=1.90';
import { getLeaderboardPlayerName } from '../services/scoreboard.js?v=1.90';
import { buildModalDeltaDisplay } from '../result-flow.js?v=1.90';

export function setModalStatCenter(labelText, valueText, valueClass) {
    if (!this.modalStatsRow) return;
    this.modalStatsRow.replaceChildren();
    const center = document.createElement('span');
    center.className = 'modal-stat-center';
    if (labelText) {
        const label = document.createElement('span');
        label.className = 'modal-stat-label';
        label.textContent = labelText;
        center.appendChild(label);
    }
    const value = document.createElement('span');
    value.className = `modal-stat-value${valueClass ? ` ${valueClass}` : ''}`;
    value.textContent = valueText;
    center.appendChild(value);
    this.modalStatsRow.appendChild(center);
}

export function setModalStatLeftRight(lapText, deltaText, bestText, { leftLabel = 'Lap', rightLabel = 'Best' } = {}) {
    if (!this.modalStatsRow) return;
    this.modalStatsRow.replaceChildren();

    const left = document.createElement('span');
    left.className = 'modal-stat-left';
    const lapLabel = document.createElement('span');
    lapLabel.className = 'modal-stat-label';
    lapLabel.textContent = leftLabel;
    left.appendChild(lapLabel);
    const lapVal = document.createElement('span');
    lapVal.className = 'modal-stat-value';
    lapVal.textContent = lapText;
    if (deltaText) {
        const deltaSpan = document.createElement('span');
        deltaSpan.className = 'modal-stat-delta';
        deltaSpan.textContent = deltaText;
        lapVal.appendChild(document.createTextNode(' '));
        lapVal.appendChild(deltaSpan);
    }
    left.appendChild(lapVal);
    this.modalStatsRow.appendChild(left);

    const right = document.createElement('span');
    right.className = 'modal-stat-right';
    const bestLabel = document.createElement('span');
    bestLabel.className = 'modal-stat-label';
    bestLabel.textContent = rightLabel;
    right.appendChild(bestLabel);
    const bestVal = document.createElement('span');
    bestVal.className = 'modal-stat-value modal-stat-value--best';
    bestVal.textContent = bestText;
    right.appendChild(bestVal);
    this.modalStatsRow.appendChild(right);
}

export function setPracticePauseStats(sessionBestTime, _practiceBestTime, deltaToBest, isNewBest = false, scoreboardSnapshot = null) {
    if (!this.modalStatsRow) return;
    this.modalStatsRow.replaceChildren();

    const sessionBestText = sessionBestTime === null || sessionBestTime === undefined
        ? '--'
        : `${sessionBestTime.toFixed(2)}s`;
    const deltaDisplay = buildModalDeltaDisplay({
        deltaToBest: isNewBest ? null : deltaToBest,
        emptyText: isNewBest ? 'New PB' : '--',
        emptyValueClass: isNewBest ? 'modal-stat-value--delta-negative' : ''
    });

    this.modalStatsRow.appendChild(this.createModalStat(
        'Session Best',
        sessionBestText,
        sessionBestTime !== null && sessionBestTime !== undefined ? 'modal-stat-value--best' : ''
    ));
    if (isNewBest && scoreboardSnapshot) {
        this.modalStatsRow.appendChild(this.createRankModalStat(scoreboardSnapshot));
        return;
    }
    this.modalStatsRow.appendChild(this.createModalStat('Delta', deltaDisplay.text, deltaDisplay.valueClass));
}

export function setStandardPauseStats(lapTime, deltaToBest, _bestTime, primaryLabel = 'Lap Time') {
    if (!this.modalStatsRow) return;
    this.modalStatsRow.replaceChildren();

    const lapText = lapTime === null || lapTime === undefined
        ? '--'
        : `${lapTime.toFixed(2)}s`;
    const deltaDisplay = buildModalDeltaDisplay({ deltaToBest });

    this.modalStatsRow.appendChild(this.createModalStat(primaryLabel, lapText));
    this.modalStatsRow.appendChild(this.createModalStat('Delta', deltaDisplay.text, deltaDisplay.valueClass));
}

export function setWinStats(lapTime, deltaToBest, scoreboardSnapshot = null, primaryLabel = 'Lap Time') {
    if (!this.modalStatsRow) return;
    this.modalStatsRow.replaceChildren();

    const lapText = lapTime !== null && lapTime !== undefined
        ? `${lapTime.toFixed(2)}s`
        : '--';
    const deltaDisplay = buildModalDeltaDisplay({
        deltaToBest,
        emptyText: 'New PB',
        emptyValueClass: 'modal-stat-value--delta-negative'
    });

    this.modalStatsRow.appendChild(this.createModalStat(primaryLabel, lapText));
    if (scoreboardSnapshot) {
        this.modalStatsRow.appendChild(this.createRankModalStat(scoreboardSnapshot));
        return;
    }

    this.modalStatsRow.appendChild(this.createModalStat('Delta', deltaDisplay.text, deltaDisplay.valueClass));
}

export function createModalStat(labelText, valueText, valueClass = '', onClick = null) {
    const stat = onClick ? document.createElement('button') : document.createElement('span');
    stat.className = `modal-stat-stack${onClick ? ' modal-stat-button' : ''}`;
    if (onClick) {
        stat.type = 'button';
        stat.addEventListener('click', onClick);
    }

    const label = document.createElement('span');
    label.className = 'modal-stat-label';
    label.textContent = labelText;
    stat.appendChild(label);

    const value = document.createElement('span');
    value.className = `modal-stat-value modal-stat-value--compact${valueClass ? ` ${valueClass}` : ''}`;
    value.textContent = valueText;
    stat.appendChild(value);

    return stat;
}

export function createModalActionIcon(iconName) {
    if (!iconName) return null;

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('modal-action-icon');

    const addPath = (d) => {
        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
    };

    const addRect = (x, y, width, height, rx) => {
        const rect = document.createElementNS(svgNs, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('rx', rx);
        svg.appendChild(rect);
    };

    const addCircle = (cx, cy, r) => {
        const circle = document.createElementNS(svgNs, 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        svg.appendChild(circle);
    };

    const addLine = (x1, y1, x2, y2) => {
        const line = document.createElementNS(svgNs, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        svg.appendChild(line);
    };

    const addPolyline = (points) => {
        const polyline = document.createElementNS(svgNs, 'polyline');
        polyline.setAttribute('points', points);
        svg.appendChild(polyline);
    };

    switch (iconName) {
        case 'play':
            svg.setAttribute('fill', 'currentColor');
            svg.setAttribute('stroke', 'none');
            addPath('M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z');
            break;
        case 'quit':
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            addPath('M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z');
            addPath('m15 9-6 6');
            addPath('m9 9 6 6');
            break;
        case 'done':
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            addPath('M21.801 10A10 10 0 1 1 17 3.335');
            addPath('m9 11 3 3L22 4');
            break;
        case 'retry':
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            addPath('M10 2h4');
            addPath('M12 14v-4');
            addPath('M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14L4 17.6');
            addPath('M9 17H4v5');
            break;
        case 'save':
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            addPolyline('14.5 17.5 3 6 3 3 6 3 17.5 14.5');
            addLine('13', '19', '19', '13');
            addLine('16', '16', '20', '20');
            addLine('19', '21', '21', '19');
            addPolyline('14.5 6.5 18 3 21 3 21 6 17.5 9.5');
            addLine('5', '14', '9', '18');
            addLine('7', '17', '4', '20');
            addLine('3', '19', '5', '21');
            break;
        case 'share':
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            addPath('M12 15V3');
            addPath('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4');
            addPath('m7 10 5 5 5-5');
            break;
        default:
            return null;
    }

    return svg;
}

export function setModalActionButtonContent(button, label, { shortcutLabel = null, iconName = null } = {}) {
    if (!button) return;

    button.replaceChildren();
    const icon = this.createModalActionIcon(iconName);
    if (icon) button.appendChild(icon);

    const text = document.createElement('span');
    text.className = 'modal-action-label';
    text.textContent = label;
    button.appendChild(text);

    if (!shortcutLabel) return;

    const kbd = document.createElement('kbd');
    kbd.className = 'modal-btn-kbd';
    kbd.textContent = shortcutLabel;
    button.appendChild(document.createTextNode(' '));
    button.appendChild(kbd);
}

export function setModalResetButtonLabel(label, shortcutLabel = null, iconName = null) {
    this.setModalActionButtonContent(this.modalResetBtn, label, { shortcutLabel, iconName });
}

export function setModalSecondaryButton(label, isVisible, iconName = null) {
    if (!this.modalSecondaryBtn) return;
    if (isVisible) {
        this.setModalActionButtonContent(this.modalSecondaryBtn, label, { iconName });
    } else {
        this.modalSecondaryBtn.replaceChildren();
    }
    this.modalSecondaryBtn.hidden = !isVisible;
    this.modalSecondaryBtn.style.display = isVisible ? 'inline-flex' : 'none';
}

export function setShareButtonContent(label, iconName = 'save') {
    this.setModalActionButtonContent(this.shareBtn, label, { iconName });
}

export function renderLapTimesList(container, lapTimesArray, bestTime, currentTime) {
    if (!lapTimesArray || (Array.isArray(lapTimesArray) && lapTimesArray.length === 0)) return;

    if (!Array.isArray(lapTimesArray)) {
        this.renderPracticeLapTimesList(container, lapTimesArray);
        return;
    }

    const headerRow = document.createElement('div');
    headerRow.className = 'runs-header-row';
    const headerTitle = document.createElement('span');
    headerTitle.className = 'runs-header-title';
    headerTitle.textContent = 'Your 5 PBs';
    headerRow.appendChild(headerTitle);
    container.appendChild(headerRow);

    const list = document.createElement('div');
    list.className = 'lap-times-list';
    lapTimesArray.forEach((time, index) => {
        const isBest = index === 0;
        const isCurrent = Math.abs(time - currentTime) < 0.001;
        const delta = time - bestTime;

        const item = document.createElement('div');
        item.className = `lap-time-item${isBest ? ' best' : ''}${isCurrent ? ' current' : ''}`;

        const runLeft = document.createElement('span');
        runLeft.className = 'run-left';
        const runIndex = document.createElement('span');
        runIndex.className = 'run-index';
        runIndex.textContent = String(index + 1);
        const runTime = document.createElement('span');
        runTime.className = 'run-time';
        runTime.textContent = `${time.toFixed(2)}s`;
        runLeft.appendChild(runIndex);
        runLeft.appendChild(runTime);
        item.appendChild(runLeft);

        const deltaWrap = document.createElement('span');
        deltaWrap.className = 'run-delta-wrap';
        if (!isBest) {
            const deltaSpan = document.createElement('span');
            deltaSpan.className = 'run-delta';
            deltaSpan.textContent = `+${delta.toFixed(2)}s`;
            deltaWrap.appendChild(deltaSpan);
        }
        item.appendChild(deltaWrap);
        list.appendChild(item);
    });

    container.appendChild(list);
}

export function renderScoreboardList(container, scoreboardSnapshot, scoreboardMode, trackKey = null, scoreboardSubhead = null) {
    if (!container) return;
    const isLoading = Boolean(scoreboardSnapshot?.isLoading);
    const topRows = Array.isArray(scoreboardSnapshot?.topRows)
        ? scoreboardSnapshot.topRows
        : [];
    const nearbyRows = Array.isArray(scoreboardSnapshot?.nearbyRows)
        ? scoreboardSnapshot.nearbyRows
        : [];
    const currentPlayerRow = scoreboardSnapshot?.currentPlayerRow || null;
    const objectiveType = typeof scoreboardSnapshot?.objectiveType === 'string'
        ? scoreboardSnapshot.objectiveType
        : null;
    const trackMeta = trackKey && TRACKS[trackKey] ? TRACKS[trackKey] : null;
    const trackName = trackMeta?.name || null;

    const section = document.createElement('section');
    const leaderboardOnly = container.childElementCount === 0;
    section.className = `leaderboard-section${leaderboardOnly ? ' leaderboard-section--solo' : ''}`;
    section.setAttribute('role', 'region');
    section.setAttribute(
        'aria-label',
        trackName ? `Leaderboard for ${trackName}` : 'Global leaderboard'
    );

    const headerRow = document.createElement('div');
    headerRow.className = 'runs-header-row leaderboard-header-row';

    const headerStack = document.createElement('div');
    headerStack.className = 'leaderboard-header-stack';

    const trackLine = document.createElement('span');
    trackLine.className = 'leaderboard-hero-track';
    trackLine.textContent = trackName || 'This track';
    headerStack.appendChild(trackLine);

    const modeLabel = TRACK_MODE_LABELS[scoreboardMode] || 'Time trial';
    const subhead = document.createElement('span');
    subhead.className = 'leaderboard-subhead';
    subhead.textContent = scoreboardSubhead || `Leaderboard · ${modeLabel}`;
    headerStack.appendChild(subhead);
    headerRow.appendChild(headerStack);
    section.appendChild(headerRow);

    if (!topRows.length && !nearbyRows.length && !currentPlayerRow) {
        const emptyState = document.createElement('p');
        emptyState.className = 'practice-empty-state';
        if (isLoading) {
            emptyState.classList.add('leaderboard-loading-state');
            const spinner = document.createElement('span');
            spinner.className = 'modal-rank-spinner';
            spinner.setAttribute('aria-hidden', 'true');
            emptyState.appendChild(spinner);
            emptyState.appendChild(document.createTextNode('Loading leaderboard...'));
        } else {
            emptyState.textContent = 'No global times yet.';
        }
        section.appendChild(emptyState);
        container.appendChild(section);
        return;
    }

    const list = document.createElement('div');
    list.className = 'lap-times-list leaderboard-list';

    const appendScoreboardRow = (entry) => {
        const item = document.createElement('div');
        item.className = `lap-time-item leaderboard-row${entry.rank === 1 ? ' best' : ''}${entry.isCurrentPlayer ? ' current' : ''}`;

        const runIndex = document.createElement('span');
        runIndex.className = 'run-index';
        runIndex.textContent = Number.isFinite(entry.rank)
            ? `#${entry.rank}`
            : (entry.rankLabel || '—');
        item.appendChild(runIndex);

        const rowLabel = document.createElement('span');
        rowLabel.className = 'leaderboard-row-label';
        if (entry.isCurrentPlayer) {
            rowLabel.textContent = 'You';
        } else {
            rowLabel.textContent = getLeaderboardPlayerName(entry.playerId);
        }
        item.appendChild(rowLabel);

        const runTime = document.createElement('span');
        runTime.className = 'run-time';
        if (
            objectiveType === 'finish_with_crash_budget'
            && Number.isFinite(entry.completedLaps)
        ) {
            runTime.textContent = `${entry.completedLaps}L`;
        } else {
            runTime.textContent = `${entry.bestTime.toFixed(2)}s`;
        }
        item.appendChild(runTime);

        list.appendChild(item);
    };

    topRows.forEach((entry) => appendScoreboardRow(entry));

    if (nearbyRows.length) {
        if (topRows.length > 0 && nearbyRows[0]?.rank > (topRows[topRows.length - 1]?.rank || 0) + 1) {
            const gapRow = document.createElement('div');
            gapRow.className = 'leaderboard-gap-row';
            gapRow.setAttribute('aria-hidden', 'true');
            gapRow.textContent = '· · ·';
            list.appendChild(gapRow);
        }
        nearbyRows.forEach((entry) => appendScoreboardRow(entry));
    } else if (
        currentPlayerRow
        && (Number.isFinite(currentPlayerRow.rank) || currentPlayerRow.rankLabel)
        && !topRows.some((entry) => entry.playerId === currentPlayerRow.playerId)
    ) {
        appendScoreboardRow(currentPlayerRow);
    }

    section.appendChild(list);
    container.appendChild(section);
}

export function centerLeaderboardCurrentRow() {
    const list = this.modalLapTimes?.querySelector('.leaderboard-list');
    const currentRow = list?.querySelector('.leaderboard-row.current');
    if (!list || !currentRow || list.scrollHeight <= list.clientHeight) return;

    const targetScrollTop = currentRow.offsetTop - (list.clientHeight / 2) + (currentRow.offsetHeight / 2);
    const maxScrollTop = list.scrollHeight - list.clientHeight;
    list.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
}

export function renderPracticeLapTimesList(container, practiceSummary) {
    const summary = practiceSummary || {};
    const laps = Array.isArray(summary.laps) ? summary.laps : [];

    const headerRow = document.createElement('div');
    headerRow.className = 'runs-header-row';

    const headerTitle = document.createElement('span');
    headerTitle.className = 'runs-header-title';
    headerTitle.textContent = 'Session';
    headerRow.appendChild(headerTitle);

    if (summary.bestLap) {
        const bestWrap = document.createElement('div');
        bestWrap.className = 'runs-header-best';

        const bestLabel = document.createElement('span');
        bestLabel.className = 'runs-header-label';
        bestLabel.textContent = 'Best Lap';
        bestWrap.appendChild(bestLabel);

        const bestValue = document.createElement('span');
        bestValue.className = 'runs-header-value';
        bestValue.textContent = `L${summary.bestLap.lapNumber} ${summary.bestLap.time.toFixed(2)}s`;
        bestWrap.appendChild(bestValue);
        headerRow.appendChild(bestWrap);
    }

    container.appendChild(headerRow);

    if (!laps.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'practice-empty-state';
        emptyState.textContent = 'No completed laps yet.';
        container.appendChild(emptyState);
        return;
    }

    const list = document.createElement('div');
    list.className = 'lap-times-list';

    laps.forEach((lap) => {
        const isBest = summary.bestLap?.lapNumber === lap.lapNumber;
        const item = document.createElement('div');
        item.className = `lap-time-item${isBest ? ' best' : ''}`;

        const runLeft = document.createElement('span');
        runLeft.className = 'run-left';

        const runIndex = document.createElement('span');
        runIndex.className = 'run-index';
        runIndex.textContent = `L${lap.lapNumber}`;

        const runTime = document.createElement('span');
        runTime.className = 'run-time';
        runTime.textContent = `${lap.time.toFixed(2)}s`;

        runLeft.appendChild(runIndex);
        runLeft.appendChild(runTime);
        item.appendChild(runLeft);

        const deltaWrap = document.createElement('span');
        deltaWrap.className = 'run-delta-wrap';
        if (lap.deltaVsBest !== null && lap.deltaVsBest !== undefined) {
            const deltaSpan = document.createElement('span');
            const prefix = lap.deltaVsBest > 0.005 ? '+' : '';
            deltaSpan.className = `run-delta${lap.deltaVsBest < -0.005 ? ' run-delta--negative' : ''}`;
            deltaSpan.textContent = `${prefix}${lap.deltaVsBest.toFixed(2)}s`;
            deltaWrap.appendChild(deltaSpan);
        } else {
            deltaWrap.textContent = '--';
        }
        item.appendChild(deltaWrap);

        list.appendChild(item);
    });

    container.appendChild(list);
}
