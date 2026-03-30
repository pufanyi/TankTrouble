import { InputManager } from "./input";
import { classicMap } from "./map";
import { PHYSICS_TIMESTEP, PhysicsWorld } from "./physics";
import { Renderer } from "./renderer";

const PLAYER_COUNT = 2;

let world: PhysicsWorld;
let renderer: Renderer;
let input: InputManager;
let roundOver = false;
let roundWinner: number | null = null;

function init() {
	const canvas = document.getElementById("game") as HTMLCanvasElement;
	const map = classicMap();

	world = new PhysicsWorld(map);
	renderer = new Renderer(canvas, map);
	input = new InputManager(PLAYER_COUNT);

	for (let i = 0; i < PLAYER_COUNT; i++) {
		world.addTank(i);
	}

	roundOver = false;
	roundWinner = null;
}

// --- Game loop with fixed timestep ---

let lastTime = 0;
let accumulator = 0;

function gameLoop(timestamp: number) {
	const deltaMs = timestamp - lastTime;
	lastTime = timestamp;

	// Cap delta to prevent spiral of death
	const delta = Math.min(deltaMs / 1000, 0.1);
	accumulator += delta;

	// Fixed timestep physics updates
	while (accumulator >= PHYSICS_TIMESTEP) {
		if (!roundOver) {
			const inputMap = new Map<number, ReturnType<typeof input.getInput>>();
			for (let i = 0; i < PLAYER_COUNT; i++) {
				inputMap.set(i, input.getInput(i));
			}

			world.step(inputMap, PHYSICS_TIMESTEP);

			// Check round over
			const winner = world.checkRoundOver();
			if (winner !== null) {
				roundOver = true;
				roundWinner = winner;
			}
		}
		accumulator -= PHYSICS_TIMESTEP;
	}

	// Render
	renderer.clear();
	renderer.drawGrid(world.map.width / 6, world.map.height / 4);
	renderer.drawWalls(world.map);

	for (const bullet of world.bullets) {
		renderer.drawBullet(bullet, world.tanks);
	}
	for (const tank of world.tanks) {
		renderer.drawTank(tank);
	}

	renderer.drawHUD(world.tanks);

	if (roundOver) {
		renderer.drawRoundOver(roundWinner, world.tanks);
	}

	requestAnimationFrame(gameLoop);
}

// --- Restart handler ---
window.addEventListener("keydown", (e) => {
	if (e.code === "KeyR" && roundOver) {
		init();
	}
});

// --- Start ---
init();
lastTime = performance.now();
requestAnimationFrame(gameLoop);
