import { Point } from './math.js';

// --- Track Definitions ---
export const TRACKS = {
    circuit: {
        name: "Classic Circuit",
        outer: [
            Point(2, 2), Point(15, 2), Point(20, 5), Point(25, 5), 
            Point(30, 8), Point(30, 15), Point(25, 20), Point(10, 20),
            Point(5, 15), Point(2, 10)
        ],
        inner: [
            Point(6, 6), Point(13, 6), Point(16, 8), Point(22, 8),
            Point(24, 10), Point(24, 13), Point(20, 16), Point(10, 16),
            Point(8, 13), Point(6, 10)
        ],
        startLine: { p1: Point(10, 2), p2: Point(10, 6) },
        startPos: Point(8, 4),
        startAngle: 0
    },
    monza: {
        name: "Temple of Speed",
        outer: [
            Point(10, 30), // Finish Line
            Point(40, 30), // Main Straight
            Point(43, 27), // T1 Entry
            Point(45, 29), // T1 Exit
            Point(50, 29), // Curva Grande Entry
            Point(55, 20), // Curva Grande Apex
            Point(55, 12), // Curva Grande Exit
            Point(53, 9),  // Roggia Entry
            Point(50, 7),  // Roggia Mid
            Point(47, 9),  // Roggia Exit
            Point(40, 5),  // Lesmo 1
            Point(30, 5),  // Lesmo 2
            Point(20, 5),  // Serraglio
            Point(15, 3),  // Ascari Entry
            Point(12, 7),  // Ascari Mid
            Point(9, 5),   // Ascari Exit
            Point(5, 15),  // Back Straight
            Point(5, 25)   // Parabolica Entry
        ],
        inner: [
            Point(10, 26), 
            Point(38, 26), 
            Point(41, 23), 
            Point(45, 25), 
            Point(48, 25), 
            Point(51, 20), 
            Point(51, 14), 
            Point(50, 12),
            Point(50, 10), 
            Point(47, 12),
            Point(40, 9), 
            Point(30, 9), 
            Point(20, 9), 
            Point(17, 7), 
            Point(13, 10), 
            Point(10, 9), 
            Point(9, 15), 
            Point(9, 22)
        ],
        startLine: { p1: Point(15, 25), p2: Point(15, 31) },
        startPos: Point(12, 28),
        startAngle: 0
    },
    silverstone: {
        name: "Royal Circuit",
        outer: [
            Point(15, 35),
            Point(35, 35),
            Point(42, 32), // Copse (Widened & pushed out)
            Point(50, 28), // Maggotts Entry (Widened)
            Point(58, 20), // Becketts (Widened)
            Point(55, 12), // Chapel Exit (Widened)
            Point(50, 10),
            Point(40, 5),
            Point(25, 5),
            Point(20, 10),
            Point(10, 10),
            Point(5, 15),
            Point(5, 25),
            Point(10, 30),
            Point(15, 35)
        ],
        inner: [
            Point(15, 31),
            Point(33, 31),
            Point(38, 28), // Copse Inner (Tighter to create space)
            Point(44, 24), // Maggotts Inner (Significantly tightened)
            Point(50, 16), // Becketts Inner
            Point(47, 14),
            Point(38, 9),
            Point(25, 9),
            Point(23, 13),
            Point(12, 13),
            Point(9, 16),
            Point(9, 23),
            Point(13, 27),
            Point(15, 31)
        ],
        startLine: { p1: Point(20, 31), p2: Point(20, 35) },
        startPos: Point(18, 33),
        startAngle: 0
    },
    spa: {
        name: "Forest Run",
        outer: [
            Point(15, 38), // La Source
            Point(5, 30),  // Downhill
            Point(10, 25), // Eau Rouge Bottom
            Point(15, 20), // Raidillon Top
            Point(40, 5),  // Kemmel Straight End
            Point(50, 5),  // Les Combes
            Point(55, 10), // Malmedy
            Point(55, 20), // Rivage
            Point(45, 25), // Pouhon
            Point(40, 30), // Fagnes
            Point(35, 35), // Stavelot
            Point(20, 35)  // Blanchimont / Bus Stop
        ],
        inner: [
            Point(18, 34), // La Source In
            Point(10, 30),
            Point(13, 25), // Eau Rouge In
            Point(17, 22),
            Point(40, 9),  // Kemmel In
            Point(48, 9),
            Point(51, 12),
            Point(51, 18),
            Point(45, 21), // Pouhon In
            Point(40, 26),
            Point(35, 31),
            Point(20, 31)
        ],
        startLine: { p1: Point(19, 32.5), p2: Point(19, 35.6) },
        startPos: Point(21, 34), 
        startAngle: 2.6 
    },
    oval: {
        name: "Super Oval",
        outer: [
            Point(5, 5), Point(25, 5), Point(35, 15), Point(25, 25),
            Point(5, 25), Point(-5, 15)
        ],
        inner: [
            Point(8, 10), Point(22, 10), Point(25, 15), Point(22, 20),
            Point(8, 20), Point(5, 15)
        ],
        startLine: { p1: Point(15, 5), p2: Point(15, 10) },
        startPos: Point(12, 7.5),
        startAngle: 0
    },
    complex: {
        name: "The Complex",
        outer: [
            Point(2, 2), 
            Point(20, 2), 
            Point(30, 2), Point(35, 10), Point(30, 25), 
            Point(20, 25), Point(15, 23), Point(10, 25), 
            Point(2, 20), Point(0, 10)
        ],
        inner: [
            Point(6, 6), 
            Point(15, 8), 
            Point(25, 6), Point(28, 10), Point(25, 20), 
            Point(20, 20), 
            Point(15, 18), 
            Point(10, 20), Point(6, 15),
            Point(4, 10)
        ],
        startLine: { p1: Point(8, 2), p2: Point(8, 6) },
        startPos: Point(5, 4),
        startAngle: 0
    }
};
