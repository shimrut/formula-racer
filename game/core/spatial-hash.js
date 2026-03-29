/**
 * Grid-based spatial hash for static line segments.
 * Built once per track load; queries are O(nearby) instead of O(all).
 */
export class SpatialHash {
    /**
     * @param {number} cellSize  Grid cell size in world units
     * @param {Array}  segments  Collision segment objects with minX/maxX/minY/maxY
     */
    constructor(cellSize, segments) {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
        this._grid = new Map();
        // Keep flat list so the object can also be iterated as before
        this._segments = segments;
        this.length = segments.length;

        for (let i = 0; i < segments.length; i++) {
            this._insert(segments[i]);
        }
    }

    /** Hash a cell coordinate pair to a single integer key. */
    _key(cx, cy) {
        // Cantor-style hash that handles negatives via offset
        return ((cx + 32768) << 16) | ((cy + 32768) & 0xFFFF);
    }

    _insert(segment) {
        const inv = this.invCellSize;
        const x0 = Math.floor(segment.minX * inv);
        const y0 = Math.floor(segment.minY * inv);
        const x1 = Math.floor(segment.maxX * inv);
        const y1 = Math.floor(segment.maxY * inv);

        for (let cx = x0; cx <= x1; cx++) {
            for (let cy = y0; cy <= y1; cy++) {
                const k = this._key(cx, cy);
                let cell = this._grid.get(k);
                if (!cell) {
                    cell = [];
                    this._grid.set(k, cell);
                }
                cell.push(segment);
            }
        }
    }

    /**
     * Return all segments whose AABB overlaps the query AABB.
     * Uses a query-local stamp to avoid returning duplicates when a segment
     * spans multiple cells.
     *
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @param {Array}  out  Reusable output array (cleared on each call)
     * @returns {Array} The `out` array, filled with matching segments
     */
    query(minX, minY, maxX, maxY, out) {
        out.length = 0;
        this._queryStamp = (this._queryStamp || 0) + 1;
        const stamp = this._queryStamp;
        const inv = this.invCellSize;

        const cx0 = Math.floor(minX * inv);
        const cy0 = Math.floor(minY * inv);
        const cx1 = Math.floor(maxX * inv);
        const cy1 = Math.floor(maxY * inv);

        for (let cx = cx0; cx <= cx1; cx++) {
            for (let cy = cy0; cy <= cy1; cy++) {
                const cell = this._grid.get(this._key(cx, cy));
                if (!cell) continue;
                for (let i = 0; i < cell.length; i++) {
                    const seg = cell[i];
                    if (seg._stamp === stamp) continue; // already added
                    seg._stamp = stamp;
                    out.push(seg);
                }
            }
        }

        return out;
    }
}
