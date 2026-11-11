import { BASE, elbowFor, type Point, type RobotSimulation } from '../../core/robot/RobotSimulation';
import { t } from '../../i18n';
const colours = ['#73efd2', '#b4a0ff', '#ffc879'];
export class RobotView {
  private ctx: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas unavailable');
    this.ctx = context;
  }
  resize(): void {
    const size = Math.max(1, Math.round(this.canvas.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, 1.5)));
    if (this.canvas.width !== size) { this.canvas.width = size; this.canvas.height = size; }
  }
  draw(game: RobotSimulation): void {
    const c = this.ctx, scale = this.canvas.width / 1000;
    c.setTransform(scale, 0, 0, scale, 0, 0);
    const background = c.createRadialGradient(500, 400, 20, 500, 500, 720);
    background.addColorStop(0, '#182b3d'); background.addColorStop(1, '#0b1324');
    c.fillStyle = background; c.fillRect(0, 0, 1000, 1000);
    c.strokeStyle = '#729bb511'; c.lineWidth = 1;
    for (let v = 50; v < 1000; v += 50) { c.beginPath(); c.moveTo(v, 0); c.lineTo(v, 1000); c.moveTo(0, v); c.lineTo(1000, v); c.stroke(); }
    c.strokeStyle = '#87b9cc20'; c.setLineDash([5, 12]);
    for (const radius of [230, 480, 795]) { c.beginPath(); c.arc(BASE.x * 1000, BASE.y * 1000, radius, Math.PI, Math.PI * 2); c.stroke(); }
    c.setLineDash([]);
    this.label('SECTOR 04 / ORBITAL RECOVERY', 42, 56, '#7a9caf', 14, 'left');
    this.label('BIT / R-01', 952, 56, '#73efd2', 14, 'right');
    this.label(t('CELLÁK'), 230, 216, '#94aabb', 15);
    this.label(t('DOKKOK'), 770, 216, '#94aabb', 15);
    for (const cell of game.cells) {
      const p = cell.dock, colour = colours[cell.id];
      c.fillStyle = cell.delivered ? `${colour}28` : '#121d2b'; c.strokeStyle = `${colour}70`; c.lineWidth = 2;
      c.beginPath(); c.roundRect(p.x * 1000 - 49, p.y * 1000 - 49, 98, 98, 22); c.fill(); c.stroke();
      c.strokeStyle = `${colour}35`; c.setLineDash([4, 6]); c.strokeRect(p.x * 1000 - 33, p.y * 1000 - 33, 66, 66); c.setLineDash([]);
      this.label(cell.delivered ? '✓' : String(cell.id + 1), p.x * 1000, p.y * 1000 + 8, colour, 24);
    }
    for (const obstacle of game.obstacles) {
      const x = obstacle.x * 1000, y = obstacle.y * 1000, w = obstacle.width * 1000, h = obstacle.height * 1000;
      c.fillStyle = '#fcaa7220'; c.strokeStyle = '#ffc47b'; c.lineWidth = 2;
      c.beginPath(); c.roundRect(x, y, w, h, 14); c.fill(); c.stroke();
      c.save(); c.clip(); c.strokeStyle = '#ffc47b22'; c.lineWidth = 12;
      for (let offset = -h; offset < w; offset += 35) { c.beginPath(); c.moveTo(x + offset, y); c.lineTo(x + offset + h, y + h); c.stroke(); }
      c.restore(); this.label('!', x + w / 2, y + h / 2 + 8, '#ffe3ab', 30);
    }
    if (!game.complete) {
      c.strokeStyle = game.blocked ? '#ffc87999' : '#87c9d34d'; c.lineWidth = 2; c.setLineDash([7, 9]);
      c.beginPath(); c.moveTo(game.tool.x * 1000, game.tool.y * 1000); c.lineTo(game.target.x * 1000, game.target.y * 1000); c.stroke(); c.setLineDash([]);
      this.circle(game.target, .017, 'transparent', game.blocked ? '#ffc879' : '#c4faf0', 2);
    }
    const elbow = elbowFor(game.tool);
    // The articulated links travel above the table; shields constrain the tool.
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [width, colour, dy] of [[43, '#00000045', 14], [33, '#060e19', 0], [24, '#47677b', 0], [15, '#88adb9', 0], [3, '#d1f4ef', -4]] as const) {
      c.strokeStyle = colour; c.lineWidth = width; c.beginPath(); c.moveTo(BASE.x * 1000, BASE.y * 1000 + dy); c.lineTo(elbow.x * 1000, elbow.y * 1000 + dy); c.lineTo(game.tool.x * 1000, game.tool.y * 1000 + dy); c.stroke();
    }
    this.circle(BASE, .057, '#0b1728', '#4f7788', 3); this.circle(BASE, .037, '#213b4b', '#7cead5', 2);
    this.circle(elbow, .027, '#172d40', '#b4d5db', 3); this.circle(elbow, .010, '#79dfcd');
    for (const cell of game.cells) {
      if (cell.delivered) continue;
      const x = cell.x * 1000, y = cell.y * 1000 - cell.height * 260, colour = colours[cell.id];
      c.save(); c.translate(x, y); c.fillStyle = '#00000035'; c.beginPath(); c.ellipse(0, 23 + cell.height * 260, 32, 13, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#172c3a'; c.strokeStyle = colour; c.lineWidth = 3; c.beginPath(); c.roundRect(-25, -25, 50, 50, 11); c.fill(); c.stroke();
      c.fillStyle = colour; c.fillRect(-15, -32, 30, 7); this.label(String(cell.id + 1), 0, 8, colour, 22); c.restore();
    }
    const p = { x: game.tool.x, y: game.tool.y - game.lift * .26 }, open = game.holding === null ? 30 : 21;
    this.circle(p, .013, '#eefaf5', '#70d9c4', 3);
    c.strokeStyle = game.mode === 'auto' ? '#b9a5ff' : '#79efce'; c.lineWidth = 6;
    for (const sign of [-1, 1]) { c.beginPath(); c.moveTo(p.x * 1000 + sign * open, p.y * 1000 - 17); c.lineTo(p.x * 1000 + sign * open, p.y * 1000 + 18); c.lineTo(p.x * 1000 + sign * (open - 9), p.y * 1000 + 18); c.stroke(); }
    if (game.dwell > 0) {
      c.strokeStyle = '#ffdb94'; c.lineWidth = 4; c.beginPath(); c.arc(p.x * 1000, p.y * 1000, 42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, game.dwell / .65)); c.stroke();
    }
    this.label(t('VIRTUÁLIS MUNKATÉR'), 42, 958, '#7999ac', 13, 'left');
    this.label('●  LOCAL SIM', 952, 958, '#7ab9a8', 13, 'right');
  }
  private circle(p: Point, radius: number, fill: string, stroke?: string, width = 1): void {
    const c = this.ctx; c.beginPath(); c.arc(p.x * 1000, p.y * 1000, radius * 1000, 0, Math.PI * 2);
    c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }
  private label(text: string, x: number, y: number, colour: string, size: number, align: CanvasTextAlign = 'center'): void {
    const c = this.ctx; c.font = `600 ${size}px system-ui, sans-serif`; c.textAlign = align; c.fillStyle = colour; c.fillText(text, x, y);
  }
}
