/**
 * Client-side physics engine for local play.
 * Mirrors the Rust Rapier2D-based server physics closely enough for single-player/local multiplayer.
 * When online, this will be replaced by server-authoritative state + client prediction via WASM.
 */

import type { TankInput } from "./input";
import type { GameMap } from "./map";

// --- Constants (must match shared/src/physics.rs) ---
export const TANK_WIDTH = 30;
export const TANK_HEIGHT = 20;
export const TANK_SPEED = 150;
export const TANK_ROTATION_SPEED = 3.5;
export const BULLET_RADIUS = 4;
export const BULLET_SPEED = 350;
export const MAX_BULLETS_PER_TANK = 5;
export const BULLET_MAX_BOUNCES = 50;
export const PHYSICS_TIMESTEP = 1 / 60;

// --- Types ---

export interface Tank {
	id: number;
	x: number;
	y: number;
	rotation: number;
	vx: number;
	vy: number;
	alive: boolean;
	bulletCount: number;
	color: string;
}

export interface Bullet {
	id: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	owner: number;
	bounces: number;
	alive: boolean;
}

export interface GameEvent {
	type: "tank_destroyed" | "bullet_fired" | "bullet_bounced" | "bullet_destroyed";
	data: Record<string, unknown>;
}

// --- Line segment representation for walls ---

interface Segment {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	nx: number;
	ny: number; // outward normal
}

// --- Physics World ---

const TANK_COLORS = ["#e94560", "#0f3460", "#16c79a", "#f5a623"];

export class PhysicsWorld {
	tanks: Tank[] = [];
	bullets: Bullet[] = [];
	private segments: Segment[] = [];
	private nextBulletId = 0;
	map: GameMap;
	tick = 0;

	constructor(map: GameMap) {
		this.map = map;
		this.buildWallSegments();
	}

	/** Convert thick walls into line segments for collision. */
	private buildWallSegments() {
		for (const wall of this.map.walls) {
			const dx = wall.x2 - wall.x1;
			const dy = wall.y2 - wall.y1;
			const len = Math.sqrt(dx * dx + dy * dy);
			if (len < 0.01) continue;

			// Normal perpendicular to wall direction
			const nx = -dy / len;
			const ny = dx / len;
			const ht = wall.thickness / 2;

			// Two sides of the thick wall
			// Side 1 (offset by +normal * half_thickness)
			this.segments.push({
				x1: wall.x1 + nx * ht,
				y1: wall.y1 + ny * ht,
				x2: wall.x2 + nx * ht,
				y2: wall.y2 + ny * ht,
				nx,
				ny,
			});
			// Side 2 (offset by -normal * half_thickness)
			this.segments.push({
				x1: wall.x1 - nx * ht,
				y1: wall.y1 - ny * ht,
				x2: wall.x2 - nx * ht,
				y2: wall.y2 - ny * ht,
				nx: -nx,
				ny: -ny,
			});

			// End caps (for wall endpoints)
			// Cap at (x1, y1)
			this.segments.push({
				x1: wall.x1 + nx * ht,
				y1: wall.y1 + ny * ht,
				x2: wall.x1 - nx * ht,
				y2: wall.y1 - ny * ht,
				nx: -dx / len,
				ny: -dy / len,
			});
			// Cap at (x2, y2)
			this.segments.push({
				x1: wall.x2 + nx * ht,
				y1: wall.y2 + ny * ht,
				x2: wall.x2 - nx * ht,
				y2: wall.y2 - ny * ht,
				nx: dx / len,
				ny: dy / len,
			});
		}
	}

	addTank(id: number) {
		const spawnIdx = id % this.map.spawnPoints.length;
		const [sx, sy] = this.map.spawnPoints[spawnIdx];
		this.tanks.push({
			id,
			x: sx,
			y: sy,
			rotation: 0,
			vx: 0,
			vy: 0,
			alive: true,
			bulletCount: 0,
			color: TANK_COLORS[id % TANK_COLORS.length],
		});
	}

	step(inputs: Map<number, TankInput>, dt: number): GameEvent[] {
		const events: GameEvent[] = [];

		// --- Update tanks ---
		for (const tank of this.tanks) {
			if (!tank.alive) continue;
			const input = inputs.get(tank.id);
			if (!input) continue;

			// Rotation
			if (input.turnLeft) tank.rotation -= TANK_ROTATION_SPEED * dt;
			if (input.turnRight) tank.rotation += TANK_ROTATION_SPEED * dt;

			// Movement
			let speed = 0;
			if (input.forward) speed += TANK_SPEED;
			if (input.backward) speed -= TANK_SPEED * 0.6;

			const newVx = speed * Math.cos(tank.rotation);
			const newVy = speed * Math.sin(tank.rotation);

			const newX = tank.x + newVx * dt;
			const newY = tank.y + newVy * dt;

			// Collision with walls (simple push-out)
			const resolved = this.resolveTankWallCollision(newX, newY, TANK_WIDTH / 2);
			tank.x = resolved.x;
			tank.y = resolved.y;
			tank.vx = newVx;
			tank.vy = newVy;

			// Collision with other tanks
			for (const other of this.tanks) {
				if (other.id === tank.id || !other.alive) continue;
				const ddx = tank.x - other.x;
				const ddy = tank.y - other.y;
				const dist = Math.sqrt(ddx * ddx + ddy * ddy);
				const minDist = TANK_WIDTH; // simplified: both tanks same radius
				if (dist < minDist && dist > 0.01) {
					const overlap = minDist - dist;
					const pushX = (ddx / dist) * overlap * 0.5;
					const pushY = (ddy / dist) * overlap * 0.5;
					tank.x += pushX;
					tank.y += pushY;
					other.x -= pushX;
					other.y -= pushY;
				}
			}

			// Fire
			if (input.fire && tank.bulletCount < MAX_BULLETS_PER_TANK) {
				const spawnDist = TANK_WIDTH / 2 + BULLET_RADIUS + 2;
				const bx = tank.x + Math.cos(tank.rotation) * spawnDist;
				const by = tank.y + Math.sin(tank.rotation) * spawnDist;
				const bvx = BULLET_SPEED * Math.cos(tank.rotation);
				const bvy = BULLET_SPEED * Math.sin(tank.rotation);
				const bulletId = this.nextBulletId++;

				this.bullets.push({
					id: bulletId,
					x: bx,
					y: by,
					vx: bvx,
					vy: bvy,
					owner: tank.id,
					bounces: 0,
					alive: true,
				});
				tank.bulletCount++;
				events.push({ type: "bullet_fired", data: { owner: tank.id, x: bx, y: by } });
			}
		}

		// --- Update bullets ---
		for (const bullet of this.bullets) {
			if (!bullet.alive) continue;

			const newX = bullet.x + bullet.vx * dt;
			const newY = bullet.y + bullet.vy * dt;

			// Check wall collisions (reflect)
			const wallHit = this.bulletWallCollision(bullet.x, bullet.y, newX, newY, BULLET_RADIUS);
			if (wallHit) {
				bullet.x = wallHit.x;
				bullet.y = wallHit.y;
				bullet.vx = wallHit.vx;
				bullet.vy = wallHit.vy;
				bullet.bounces++;
				events.push({ type: "bullet_bounced", data: { bulletId: bullet.id } });

				if (bullet.bounces >= BULLET_MAX_BOUNCES) {
					bullet.alive = false;
					events.push({ type: "bullet_destroyed", data: { bulletId: bullet.id } });
				}
			} else {
				bullet.x = newX;
				bullet.y = newY;
			}

			// Check tank collisions
			for (const tank of this.tanks) {
				if (!tank.alive) continue;
				const ddx = bullet.x - tank.x;
				const ddy = bullet.y - tank.y;
				const dist = Math.sqrt(ddx * ddx + ddy * ddy);
				if (dist < TANK_WIDTH / 2 + BULLET_RADIUS) {
					tank.alive = false;
					bullet.alive = false;
					events.push({ type: "tank_destroyed", data: { victim: tank.id, killer: bullet.owner } });
					events.push({ type: "bullet_destroyed", data: { bulletId: bullet.id } });
				}
			}
		}

		// Clean up dead bullets
		for (const bullet of this.bullets) {
			if (!bullet.alive) {
				const owner = this.tanks.find((t) => t.id === bullet.owner);
				if (owner && owner.bulletCount > 0) owner.bulletCount--;
			}
		}
		this.bullets = this.bullets.filter((b) => b.alive);

		this.tick++;
		return events;
	}

	/** Simple wall collision for circular tank. Push out of walls. */
	private resolveTankWallCollision(x: number, y: number, radius: number): { x: number; y: number } {
		for (const wall of this.map.walls) {
			const result = pointToSegmentDistance(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
			const minDist = radius + wall.thickness / 2;
			if (result.dist < minDist) {
				const push = minDist - result.dist;
				if (result.dist > 0.01) {
					x += result.nx * push;
					y += result.ny * push;
				}
			}
		}
		return { x, y };
	}

	/** Bullet-wall collision with reflection. */
	private bulletWallCollision(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		radius: number,
	): { x: number; y: number; vx: number; vy: number } | null {
		let closestT = Infinity;
		let hitNormal = { x: 0, y: 0 };

		for (const wall of this.map.walls) {
			// Check distance from new position to wall segment
			const result = pointToSegmentDistance(x1, y1, wall.x1, wall.y1, wall.x2, wall.y2);
			const minDist = radius + wall.thickness / 2;
			if (result.dist < minDist) {
				// Find approximate collision time
				const result0 = pointToSegmentDistance(x0, y0, wall.x1, wall.y1, wall.x2, wall.y2);
				if (result0.dist >= minDist) {
					const t = (result0.dist - minDist) / (result0.dist - result.dist);
					if (t < closestT) {
						closestT = t;
						hitNormal = { x: result.nx, y: result.ny };
					}
				} else if (result.dist < closestT) {
					closestT = 0;
					hitNormal = { x: result.nx, y: result.ny };
				}
			}
		}

		if (closestT <= 1) {
			const dx = x1 - x0;
			const dy = y1 - y0;
			// Move to just before collision
			const cx = x0 + dx * Math.min(closestT, 1);
			const cy = y0 + dy * Math.min(closestT, 1);
			// Reflect velocity
			const dot = dx * hitNormal.x + dy * hitNormal.y;
			const rvx = dx - 2 * dot * hitNormal.x;
			const rvy = dy - 2 * dot * hitNormal.y;
			// Normalize to bullet speed
			const speed = Math.sqrt(rvx * rvx + rvy * rvy);
			return {
				x: cx + hitNormal.x * 1, // push out slightly
				y: cy + hitNormal.y * 1,
				vx: (rvx / PHYSICS_TIMESTEP) * (speed > 0.01 ? BULLET_SPEED / speed : 1),
				vy: (rvy / PHYSICS_TIMESTEP) * (speed > 0.01 ? BULLET_SPEED / speed : 1),
			};
		}
		return null;
	}

	/** Check if only one (or zero) tanks are alive. */
	checkRoundOver(): number | null {
		if (this.tanks.length <= 1) return null;
		const alive = this.tanks.filter((t) => t.alive);
		if (alive.length <= 1) {
			return alive.length === 1 ? alive[0].id : -1; // -1 = draw
		}
		return null;
	}
}

/** Distance from point to line segment, with outward normal. */
function pointToSegmentDistance(
	px: number,
	py: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): { dist: number; nx: number; ny: number } {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const lenSq = dx * dx + dy * dy;

	let t = 0;
	if (lenSq > 0.0001) {
		t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
	}

	const closestX = x1 + t * dx;
	const closestY = y1 + t * dy;
	const diffX = px - closestX;
	const diffY = py - closestY;
	const dist = Math.sqrt(diffX * diffX + diffY * diffY);

	if (dist < 0.0001) {
		// Point is on the segment — use perpendicular normal
		const len = Math.sqrt(lenSq);
		return { dist: 0, nx: -dy / len, ny: dx / len };
	}

	return { dist, nx: diffX / dist, ny: diffY / dist };
}
