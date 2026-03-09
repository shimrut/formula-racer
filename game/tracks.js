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
        startAngle: 0,
        checkpoints: [
            { p1: Point(20, 5), p2: Point(16, 8) },
            { p1: Point(30, 8), p2: Point(24, 10) },
            { p1: Point(25, 20), p2: Point(20, 16) },
            { p1: Point(5, 15), p2: Point(8, 13) }
        ]
    },
    sunlitTemple: {
        name: "Sunlit Temple",
        outer: [
            Point(10, 30),
            Point(40, 30), 
            Point(43, 27), 
            Point(45, 29), 
            Point(50, 29), 
            Point(55, 20), 
            Point(55, 12), 
            Point(53, 9),  
            Point(50, 7),  
            Point(47, 9),  
            Point(40, 5),  
            Point(30, 5),  
            Point(20, 5),  
            Point(15, 3),  
            Point(12, 7),  
            Point(9, 5),   
            Point(5, 15),  
            Point(5, 25)   
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
        startAngle: 0,
        checkpoints: [
            { p1: Point(50, 29), p2: Point(48, 25) },
            { p1: Point(55, 12), p2: Point(51, 14) },
            { p1: Point(40, 5), p2: Point(40, 9) },
            { p1: Point(15, 3), p2: Point(17, 7) },
            { p1: Point(5, 20), p2: Point(9, 22) }
        ]
    },
    royalPlateau: {
        name: "Royal Plateau",
        outer: [
            Point(15, 35),
            Point(35, 35),
            Point(42, 32), 
            Point(50, 28), 
            Point(58, 20), 
            Point(55, 12), 
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
            Point(38, 28), 
            Point(44, 24), 
            Point(50, 16), 
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
        startAngle: 0,
        checkpoints: [
            { p1: Point(50, 28), p2: Point(44, 24) },
            { p1: Point(58, 20), p2: Point(50, 16) },
            { p1: Point(40, 5), p2: Point(38, 9) },
            { p1: Point(10, 10), p2: Point(12, 13) },
            { p1: Point(5, 20), p2: Point(9, 23) }
        ]
    },
    mistwoodSerpent: {
        name: "Mistwood Serpent",
        outer: [
            Point(15, 38), 
            Point(5, 30),  
            Point(10, 25), 
            Point(15, 20), 
            Point(40, 5),  
            Point(50, 5),  
            Point(55, 10), 
            Point(55, 20), 
            Point(45, 25), 
            Point(40, 30), 
            Point(35, 35), 
            Point(20, 35)  
        ],
        inner: [
            Point(18, 34), 
            Point(10, 30),
            Point(13, 25),
            Point(17, 22),
            Point(40, 9),  
            Point(48, 9),
            Point(51, 12),
            Point(51, 18),
            Point(45, 21), 
            Point(40, 26),
            Point(35, 31),
            Point(20, 31)
        ],
        startLine: { p1: Point(19, 32.5), p2: Point(19, 35.6) },
        startPos: Point(21, 34), 
        startAngle: 2.6,
        checkpoints: [
            { p1: Point(15, 20), p2: Point(17, 22) },
            { p1: Point(50, 5), p2: Point(48, 9) },
            { p1: Point(55, 20), p2: Point(51, 18) },
            { p1: Point(40, 30), p2: Point(40, 26) }
        ]
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
        startAngle: 3.14159,
        checkpoints: [
            { p1: Point(12, 35), p2: Point(17, 32) },
            { p1: Point(6, 20), p2: Point(12, 21) },
            { p1: Point(17, 3), p2: Point(14, 14) },
            { p1: Point(37, 14), p2: Point(35, 20) },
            { p1: Point(60, 21), p2: Point(56, 21) },
            { p1: Point(56, 31), p2: Point(55, 27) }
        ]
    },
    jadeSpiralCircuit: {
        name: "Jade Spiral Circuit",
        cornerRadius: 1.8,
        outer: [
            Point(11, 44),
            Point(9, 38),
            Point(8, 30),
            Point(8, 20),
            Point(9, 10),
            Point(11, 4),
            Point(15, 2),
            Point(20, 3),
            Point(23, 6),
            Point(23, 10),
            Point(20, 14),
            Point(19, 17),
            Point(22, 19),
            Point(27, 19),
            Point(31, 16),
            Point(31, 10),
            Point(28, 5),
            Point(31, 3),
            Point(38, 3),
            Point(48, 4),
            Point(57, 5),
            Point(63, 7),
            Point(66, 11),
            Point(66, 14),
            Point(63, 17),
            Point(57, 19),
            Point(50, 19),
            Point(43, 19),
            Point(38, 20),
            Point(35, 23),
            Point(34, 28),
            Point(35, 34),
            Point(39, 39),
            Point(45, 41),
            Point(54, 40),
            Point(61, 41),
            Point(65, 44),
            Point(65, 48),
            Point(62, 51),
            Point(55, 53),
            Point(45, 54),
            Point(34, 54),
            Point(23, 54),
            Point(15, 52),
            Point(12, 49)
        ],
        inner: [
            Point(15, 42),
            Point(14, 36),
            Point(13, 29),
            Point(13, 20),
            Point(13.5, 12),
            Point(14.5, 8),
            Point(16, 7),
            Point(17.5, 8),
            Point(18, 10),
            Point(17, 12),
            Point(15.5, 15),
            Point(15.5, 18),
            Point(17.5, 21),
            Point(23, 23),
            Point(27, 21.5),
            Point(31, 18.5),
            Point(34.5, 14.5),
            Point(35.5, 8),
            Point(35, 7),
            Point(39, 8),
            Point(48, 9),
            Point(55, 10),
            Point(58, 11),
            Point(59, 12),
            Point(58, 13),
            Point(55, 14),
            Point(50, 15),
            Point(42, 15),
            Point(35, 18.5),
            Point(31, 22.5),
            Point(27.5, 25),
            Point(28, 32),
            Point(31, 39),
            Point(37, 45),
            Point(45, 46),
            Point(54, 46),
            Point(59, 46.5),
            Point(60, 47.5),
            Point(58, 48.5),
            Point(53, 49),
            Point(44, 49),
            Point(33, 49),
            Point(23, 49),
            Point(17, 47.5),
            Point(15.5, 46)
        ],
        startLine: { p1: Point(13.25, 34), p2: Point(9.75, 34) },
        startPos: Point(11.5, 37),
        startAngle: -1.5708,
        checkpoints: [
            { p1: Point(20, 3), p2: Point(17.5, 8) },
            { p1: Point(63, 7), p2: Point(58, 11) },
            { p1: Point(35, 23), p2: Point(31, 22.5) },
            { p1: Point(54, 40), p2: Point(54, 46) },
            { p1: Point(34, 54), p2: Point(33, 49) }
        ]
    }
};
