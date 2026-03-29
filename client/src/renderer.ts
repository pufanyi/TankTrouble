import type { GameMap } from "./map";
import type { Tank, Bullet } from "./physics";
import { TANK_WIDTH, TANK_HEIGHT, BULLET_RADIUS } from "./physics";

const WALL_COLOR = "#533483";
const BG_COLOR = "#1a1a2e";
const GRID_COLOR = "#16213e";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement, map: GameMap) {
    this.width = map.width;
    this.height = map.height;
    canvas.width = map.width;
    canvas.height = map.height;
    this.ctx = canvas.getContext("2d")!;
  }

  clear() {
    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawGrid(cellW: number, cellH: number) {
    this.ctx.strokeStyle = GRID_COLOR;
    this.ctx.lineWidth = 1;
    for (let x = 0; x <= this.width; x += cellW) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y <= this.height; y += cellH) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  drawWalls(map: GameMap) {
    this.ctx.strokeStyle = WALL_COLOR;
    this.ctx.lineCap = "round";
    for (const wall of map.walls) {
      this.ctx.lineWidth = wall.thickness;
      this.ctx.beginPath();
      this.ctx.moveTo(wall.x1, wall.y1);
      this.ctx.lineTo(wall.x2, wall.y2);
      this.ctx.stroke();
    }
  }

  drawTank(tank: Tank) {
    if (!tank.alive) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.rotation);

    // Tank body
    ctx.fillStyle = tank.color;
    ctx.fillRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, TANK_HEIGHT);

    // Tank body outline
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, TANK_HEIGHT);

    // Barrel
    ctx.fillStyle = "#ddd";
    const barrelLen = TANK_WIDTH / 2 + 8;
    const barrelW = 6;
    ctx.fillRect(0, -barrelW / 2, barrelLen, barrelW);
    ctx.strokeRect(0, -barrelW / 2, barrelLen, barrelW);

    // Turret circle
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    ctx.restore();
  }

  drawBullet(bullet: Bullet, tanks: Tank[]) {
    if (!bullet.alive) return;
    const owner = tanks.find(t => t.id === bullet.owner);
    const color = owner ? owner.color : "#fff";

    this.ctx.beginPath();
    this.ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = "#fff";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  drawRoundOver(winnerId: number | null, tanks: Tank[]) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (winnerId === null || winnerId === -1) {
      ctx.fillText("DRAW!", this.width / 2, this.height / 2 - 30);
    } else {
      const winner = tanks.find(t => t.id === winnerId);
      ctx.fillStyle = winner?.color ?? "#fff";
      ctx.fillText(`Player ${winnerId + 1} Wins!`, this.width / 2, this.height / 2 - 30);
    }

    ctx.fillStyle = "#aaa";
    ctx.font = "20px monospace";
    ctx.fillText("Press R to restart", this.width / 2, this.height / 2 + 30);
  }

  drawHUD(tanks: Tank[]) {
    const ctx = this.ctx;
    ctx.font = "14px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    for (let i = 0; i < tanks.length; i++) {
      const tank = tanks[i];
      const y = 10 + i * 22;
      ctx.fillStyle = tank.color;
      ctx.fillRect(10, y, 12, 12);
      ctx.fillStyle = tank.alive ? "#fff" : "#666";
      ctx.fillText(`P${tank.id + 1}  Bullets: ${MAX_BULLETS_PER_TANK_DISPLAY - tank.bulletCount}/${MAX_BULLETS_PER_TANK_DISPLAY}`, 28, y);
    }
  }
}

const MAX_BULLETS_PER_TANK_DISPLAY = 5;
