export interface TankInput {
	forward: boolean;
	backward: boolean;
	turnLeft: boolean;
	turnRight: boolean;
	fire: boolean;
}

/** Key bindings for each player. */
const BINDINGS: Record<string, { player: number; action: keyof TankInput }> = {
	KeyW: { player: 0, action: "forward" },
	KeyS: { player: 0, action: "backward" },
	KeyA: { player: 0, action: "turnLeft" },
	KeyD: { player: 0, action: "turnRight" },
	Space: { player: 0, action: "fire" },

	ArrowUp: { player: 1, action: "forward" },
	ArrowDown: { player: 1, action: "backward" },
	ArrowLeft: { player: 1, action: "turnLeft" },
	ArrowRight: { player: 1, action: "turnRight" },
	Enter: { player: 1, action: "fire" },
};

export class InputManager {
	private inputs: TankInput[];
	/** Track fire key state to only fire on key-down, not hold. */
	private firePressed: boolean[];

	constructor(playerCount: number) {
		this.inputs = Array.from({ length: playerCount }, () => ({
			forward: false,
			backward: false,
			turnLeft: false,
			turnRight: false,
			fire: false,
		}));
		this.firePressed = new Array(playerCount).fill(false);

		window.addEventListener("keydown", (e) => this.onKey(e.code, true));
		window.addEventListener("keyup", (e) => this.onKey(e.code, false));
	}

	private onKey(code: string, down: boolean) {
		const binding = BINDINGS[code];
		if (!binding || binding.player >= this.inputs.length) return;

		if (binding.action === "fire") {
			if (down && !this.firePressed[binding.player]) {
				this.inputs[binding.player].fire = true;
				this.firePressed[binding.player] = true;
			}
			if (!down) {
				this.firePressed[binding.player] = false;
			}
		} else {
			this.inputs[binding.player][binding.action] = down;
		}
	}

	/** Get and reset fire flags (fire is a one-shot event). */
	getInput(player: number): TankInput {
		const input = { ...this.inputs[player] };
		this.inputs[player].fire = false;
		return input;
	}
}
