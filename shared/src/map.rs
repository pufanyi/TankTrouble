use serde::{Deserialize, Serialize};

/// A wall segment defined by two endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wall {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub thickness: f32,
}

/// Game map definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameMap {
    pub width: f32,
    pub height: f32,
    pub walls: Vec<Wall>,
    pub spawn_points: Vec<(f32, f32)>,
}

impl GameMap {
    /// Classic Tank Trouble style map with internal walls.
    pub fn classic() -> Self {
        let width = 1200.0;
        let height = 800.0;
        let t = 8.0; // wall thickness
        let cell_w = width / 6.0;
        let cell_h = height / 4.0;

        // Outer boundary walls
        let mut walls = vec![
            Wall { x1: 0.0, y1: 0.0, x2: width, y2: 0.0, thickness: t }, // top
            Wall { x1: 0.0, y1: height, x2: width, y2: height, thickness: t }, // bottom
            Wall { x1: 0.0, y1: 0.0, x2: 0.0, y2: height, thickness: t }, // left
            Wall { x1: width, y1: 0.0, x2: width, y2: height, thickness: t }, // right
        ];

        // Internal walls — a selection of segments that create the classic maze feel.
        // Each wall is a segment between grid intersections.
        let internal = [
            // Row 1 horizontal segments
            (1, 0, 2, 0), (3, 0, 4, 0), (5, 0, 5, 1),
            // Row 1-2 vertical segments
            (1, 0, 1, 1), (3, 1, 3, 2), (4, 0, 4, 1),
            // Row 2 horizontal segments
            (0, 1, 1, 1), (2, 1, 3, 1), (4, 1, 5, 1),
            // Row 2-3 vertical segments
            (2, 1, 2, 2), (5, 1, 5, 2),
            // Row 3 horizontal segments
            (1, 2, 2, 2), (3, 2, 4, 2), (4, 2, 4, 3),
            // Row 3-4 vertical segments
            (0, 2, 0, 3), (1, 2, 1, 3), (3, 2, 3, 3),
            // Row 4 horizontal segments
            (1, 3, 2, 3), (4, 3, 5, 3),
            // Additional vertical
            (2, 3, 2, 4), (5, 3, 5, 4),
        ];

        for (c1, r1, c2, r2) in internal {
            walls.push(Wall {
                x1: c1 as f32 * cell_w,
                y1: r1 as f32 * cell_h,
                x2: c2 as f32 * cell_w,
                y2: r2 as f32 * cell_h,
                thickness: t,
            });
        }

        let spawn_points = vec![
            (cell_w * 0.5, cell_h * 0.5),
            (cell_w * 5.5, cell_h * 3.5),
            (cell_w * 5.5, cell_h * 0.5),
            (cell_w * 0.5, cell_h * 3.5),
        ];

        GameMap {
            width,
            height,
            walls,
            spawn_points,
        }
    }
}
