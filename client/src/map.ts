export interface Wall {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	thickness: number;
}

export interface GameMap {
	width: number;
	height: number;
	walls: Wall[];
	spawnPoints: [number, number][];
}

/** Classic Tank Trouble style map — mirrors shared/src/map.rs */
export function classicMap(): GameMap {
	const width = 1200;
	const height = 800;
	const t = 8;
	const cellW = width / 6;
	const cellH = height / 4;

	const walls: Wall[] = [];

	// Outer boundary
	walls.push({ x1: 0, y1: 0, x2: width, y2: 0, thickness: t });
	walls.push({ x1: 0, y1: height, x2: width, y2: height, thickness: t });
	walls.push({ x1: 0, y1: 0, x2: 0, y2: height, thickness: t });
	walls.push({ x1: width, y1: 0, x2: width, y2: height, thickness: t });

	// Internal walls (same as Rust)
	const internal: [number, number, number, number][] = [
		[1, 0, 2, 0],
		[3, 0, 4, 0],
		[5, 0, 5, 1],
		[1, 0, 1, 1],
		[3, 1, 3, 2],
		[4, 0, 4, 1],
		[0, 1, 1, 1],
		[2, 1, 3, 1],
		[4, 1, 5, 1],
		[2, 1, 2, 2],
		[5, 1, 5, 2],
		[1, 2, 2, 2],
		[3, 2, 4, 2],
		[4, 2, 4, 3],
		[0, 2, 0, 3],
		[1, 2, 1, 3],
		[3, 2, 3, 3],
		[1, 3, 2, 3],
		[4, 3, 5, 3],
		[2, 3, 2, 4],
		[5, 3, 5, 4],
	];

	for (const [c1, r1, c2, r2] of internal) {
		walls.push({
			x1: c1 * cellW,
			y1: r1 * cellH,
			x2: c2 * cellW,
			y2: r2 * cellH,
			thickness: t,
		});
	}

	const spawnPoints: [number, number][] = [
		[cellW * 0.5, cellH * 0.5],
		[cellW * 5.5, cellH * 3.5],
		[cellW * 5.5, cellH * 0.5],
		[cellW * 0.5, cellH * 3.5],
	];

	return { width, height, walls, spawnPoints };
}
