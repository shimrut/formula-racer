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
    sunlitTemple: {
        name: "Sunlit Temple",
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
    royalPlateau: {
        name: "Royal Plateau",
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
    mistwoodSerpent: {
        name: "Mistwood Serpent",
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
    harborParkLoop: {
        name: "Harbor Park Loop",
        cornerRadius: 2.2,
        outer: [
            Point(40, 36),   // T14 exit to main straight
            Point(44, 36),
            Point(46, 35),
            Point(47, 33),   // T13 outer edge
            Point(46, 31),
            Point(50, 32),   // T12 outer edge
            Point(56, 31),
            Point(60, 25),   // T11 braking zone
            Point(60, 21),
            Point(57, 17),
            Point(52, 15),
            Point(44, 14),   // T10 exit
            Point(37, 14),
            Point(31, 14),
            Point(27, 13),
            Point(24, 11),   // Back straight sweep
            Point(22, 8),
            Point(20, 5),
            Point(17, 3),    // T8 crest
            Point(13, 4),
            Point(9, 7),     // T6/T7 complex
            Point(8, 11),
            Point(6, 15),    // T5
            Point(5, 20),
            Point(8, 23),    // T4 exit
            Point(10, 25),
            Point(8, 28),    // T3 kink
            Point(6, 31),
            Point(7, 34),
            Point(12, 35),   // T1 outside
            Point(19, 36),
            Point(28, 36),
            Point(36, 36)
        ],
        inner: [
            Point(40, 32),   // Main straight inner edge
            Point(42, 32),
            Point(44, 31),
            Point(44, 29),   // T13 inner
            Point(43, 27),
            Point(48, 27),   // T12 inner
            Point(55, 27),
            Point(57, 24),   // T11 apex
            Point(56, 21),
            Point(50, 20),
            Point(42, 20),   // T10/T9 run
            Point(35, 20),
            Point(28, 20),
            Point(22, 19),
            Point(18, 17),
            Point(14, 14),
            Point(13, 11),
            Point(12, 9),    // T8 inner
            Point(11, 9),
            Point(12, 11),
            Point(12, 14),
            Point(11, 18),   // T5 inner
            Point(12, 21),
            Point(14, 23),
            Point(14, 25),
            Point(12, 27),   // T3/T2 inner
            Point(12, 29),
            Point(13, 31),
            Point(17, 32),
            Point(23, 32),
            Point(31, 32),
            Point(37, 32)
        ],
        startLine: { p1: Point(25, 32), p2: Point(25, 36) },
        startPos: Point(27, 34),
        startAngle: 3.14159
    }
};
