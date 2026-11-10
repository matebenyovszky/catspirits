import * as THREE from 'three';
import { BASE, elbowFor, type Point, type RobotSimulation } from '../../core/robot/RobotSimulation';
const colours = [0x73efd2, 0xb4a0ff, 0xffc879];
export const toWorld = (p: Point, height = 0): THREE.Vector3 => new THREE.Vector3((p.x - .5) * 10, height, (p.y - .5) * 10);
export function tablePoint(camera: THREE.Camera, x: number, y: number): Point | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
  const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  return hit ? { x: hit.x / 10 + .5, y: hit.z / 10 + .5 } : null;
}
/** Optional 3D renderer. Task physics intentionally remain planar. */
export class RobotView3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(44, 1, .1, 60);
  private upper: THREE.Mesh;
  private fore: THREE.Mesh;
  private elbow: THREE.Mesh;
  private gripper = new THREE.Group();
  private fingers: THREE.Mesh[] = [];
  private cellMeshes: THREE.Group[] = [];
  private dockMaterials: THREE.MeshStandardMaterial[] = [];
  private shield: THREE.Mesh;
  private target: THREE.Mesh;
  private textures: THREE.Texture[] = [];
  private disposed = false;
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    this.renderer.setClearColor(0x0b1424);
    this.camera.position.set(0, 10.8, 9.8); this.camera.lookAt(0, 0, 0); this.camera.updateMatrixWorld();
    this.scene.add(new THREE.HemisphereLight(0xc4fff0, 0x26344b, 2.2));
    const light = new THREE.DirectionalLight(0xc0d5ff, 2.6); light.position.set(-3, 9, 5); this.scene.add(light);
    const table = this.box(10.4, .18, 10.4, 0x172939); table.position.y = -.12; this.scene.add(table);
    const grid = new THREE.GridHelper(10, 20, 0x395263, 0x253c4c); grid.position.y = -.018; this.scene.add(grid);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(table.geometry), new THREE.LineBasicMaterial({ color: 0x416072 })); rim.position.copy(table.position); this.scene.add(rim);
    const metal = new THREE.MeshStandardMaterial({ color: 0xaccbd1, roughness: .38, metalness: .55 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x294d60, roughness: .5, metalness: .4 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.40, .55, .8, 20), joint); base.position.copy(toWorld(BASE, .4)); this.scene.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.40, .035, 8, 32), new THREE.MeshBasicMaterial({ color: 0x79ebce })); ring.rotation.x = -Math.PI / 2; ring.position.copy(toWorld(BASE, .81)); this.scene.add(ring);
    this.upper = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 1, 10), metal);
    this.fore = new THREE.Mesh(new THREE.CylinderGeometry(.10, .13, 1, 10), metal);
    this.elbow = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 10), joint);
    this.scene.add(this.upper, this.fore, this.elbow, this.gripper);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(.15, .17, .55, 12), joint); wrist.position.y = .68; this.gripper.add(wrist);
    const palm = this.box(.65, .12, .18, 0x75e8cd); palm.position.y = .40; this.gripper.add(palm);
    for (const sign of [-1, 1]) {
      const finger = this.box(.10, .30, .20, 0x9cf2dd); finger.position.set(sign * .32, .26, 0); this.gripper.add(finger); this.fingers.push(finger);
    }
    for (let id = 0; id < 3; id++) {
      const material = new THREE.MeshStandardMaterial({ color: colours[id], transparent: true, opacity: .25, roughness: .8 });
      const dock = new THREE.Mesh(new THREE.BoxGeometry(.98, .04, .98), material); dock.position.copy(toWorld({ x: .77, y: [.3, .46, .62][id] }, .01));
      this.dockMaterials.push(material); this.scene.add(dock); this.label(id + 1, dock.position.x, .045, dock.position.z, colours[id], .65);
      const cell = new THREE.Group(); const body = this.box(.44, .30, .44, colours[id]); body.position.y = .17; cell.add(body);
      const cap = this.box(.24, .05, .25, 0xe9fff9); cap.position.y = .34; cell.add(cap);
      const number = this.label(id + 1, 0, .371, 0, 0x102633, .29); this.scene.remove(number); cell.add(number);
      this.scene.add(cell); this.cellMeshes.push(cell);
    }
    this.shield = this.box(.8, .55, 3, 0xffb76b); const shieldMaterial = this.shield.material as THREE.MeshStandardMaterial;
    shieldMaterial.transparent = true; shieldMaterial.opacity = .45; this.shield.position.copy(toWorld({ x: .5, y: .44 }, .275)); this.scene.add(this.shield);
    this.target = new THREE.Mesh(new THREE.TorusGeometry(.17, .025, 8, 28), new THREE.MeshBasicMaterial({ color: 0xc7f5e9 }));
    this.target.rotation.x = -Math.PI / 2; this.scene.add(this.target);
    this.resize();
  }
  private box(x: number, y: number, z: number, colour: number): THREE.Mesh {
    return new THREE.Mesh(new THREE.BoxGeometry(x, y, z), new THREE.MeshStandardMaterial({ color: colour, roughness: .5, metalness: .15 }));
  }
  private label(number: number, x: number, y: number, z: number, colour: number, size: number): THREE.Mesh {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = `#${colour.toString(16).padStart(6, '0')}`;
    ctx.font = 'bold 50px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(number), 32, 34);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.push(texture);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    label.rotation.x = -Math.PI / 2; label.position.set(x, y, z); this.scene.add(label); return label;
  }
  resize(): void {
    if (this.disposed) return;
    const size = Math.max(1, Math.round(this.canvas.getBoundingClientRect().width));
    this.renderer.setSize(size, size, false); this.camera.updateProjectionMatrix();
  }
  screenToWorld(x: number, y: number): Point | null { return tablePoint(this.camera, x, y); }
  draw(game: RobotSimulation): void {
    if (this.disposed) return;
    const shoulder = toWorld(BASE, .88), elbow = toWorld(elbowFor(game.tool), .88), wrist = toWorld(game.tool, .88);
    this.segment(this.upper, shoulder, elbow); this.segment(this.fore, elbow, wrist); this.elbow.position.copy(elbow);
    this.gripper.position.copy(toWorld(game.tool));
    this.fingers[0].position.x = game.holding === null ? -.32 : -.27; this.fingers[1].position.x = -this.fingers[0].position.x;
    game.cells.forEach(cell => {
      this.cellMeshes[cell.id].position.copy(toWorld(cell, game.holding === cell.id ? .07 : 0));
      this.dockMaterials[cell.id].opacity = cell.delivered ? .65 : .25;
    });
    this.shield.visible = game.obstacles.length > 0;
    this.target.position.copy(toWorld(game.target, .05)); this.target.visible = !game.complete;
    (this.target.material as THREE.MeshBasicMaterial).color.set(game.blocked ? 0xffbd71 : 0xc7f5e9);
    this.renderer.render(this.scene, this.camera);
  }
  private segment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
    const direction = to.clone().sub(from); mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.scale.y = direction.length(); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
    for (const texture of this.textures) texture.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
