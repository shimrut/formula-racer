// --- Geometry & Math Helpers ---
export const Point = (x, y) => ({ x, y });

/** Shared line–segment intersection params; avoids allocating a Point on miss. */
function segmentIntersectionParams(A, B, C, D) {
    const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
    const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
    const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);

    if (bottom === 0) return null;
    const t = tTop / bottom;
    const u = uTop / bottom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return { t, u };
    }
    return null;
}

export function segmentsIntersect(A, B, C, D) {
    return segmentIntersectionParams(A, B, C, D) !== null;
}

export function getIntersection(A, B, C, D) {
    const r = segmentIntersectionParams(A, B, C, D);
    if (!r) return null;
    const u = r.u;
    return Point(
        C.x + (D.x - C.x) * u,
        C.y + (D.y - C.y) * u
    );
}
