import * as THREE from 'three';
import type { SideGameSimulation } from './SideGameSimulation';
import { swordToScreen, validSword, type Point2, type SwordFrame } from './types';

/** A deliberately 2.5D play plane, not a fabricated metric 3D wand pose.
 * Pooled unlit meshes avoid lights, bloom passes and per-frame geometries. */
export class SwordGameView {
  readonly group = new THREE.Group();
  private readonly blade: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly base: THREE.Mesh;
  private readonly tip: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly targets: THREE.Mesh[] = [];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly targetMaterial = new THREE.MeshBasicMaterial({ color: '#ff8a65', depthTest: false });
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [this.targetMaterial];

  constructor() {
    this.group.name = 'SwordAndSideTargets';
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
    const sphere = new THREE.SphereGeometry(1, 10, 8);
    const ring = new THREE.RingGeometry(.08, .09, 24);
    this.geometries.push(cylinder, sphere, ring);
    const material = (color: string) => { const m = new THREE.MeshBasicMaterial({ color, depthTest: false }); this.materials.push(m); return m; };
    this.blade = new THREE.Mesh(cylinder, material('#1ae9ff'));
    this.core = new THREE.Mesh(cylinder, material('#efffff'));
    this.base = new THREE.Mesh(sphere, material('#ff22bc'));
    this.tip = new THREE.Mesh(sphere, material('#16e8ff'));
    this.ring = new THREE.Mesh(ring, material('#74ffe1'));
    for (let i = 0; i < 6; i++) {
      const target = new THREE.Mesh(sphere, this.targetMaterial); this.targets.push(target); this.group.add(target);
    }
    this.group.add(this.blade, this.core, this.base, this.tip, this.ring);
    this.group.children.forEach((mesh, index) => { mesh.renderOrder = 20 + index; mesh.visible = false; });
  }

  update(game: SideGameSimulation, sword: SwordFrame | null, nowMs: number, centerX: number, aspect: number): void {
    // Independent of the avatar's front/back quaternion: image left remains left.
    const height = 1.9, width = height * aspect;
    this.group.position.set(centerX, 1, .3);
    const point = (p: Point2, out: THREE.Vector3) => out.set((p.x - .5) * width, (.5 - p.y) * height, 0);
    this.targetMaterial.color.set(game.mode === 'slice' ? '#ffc76a' : '#ff6b85');
    game.targets.forEach((target, i) => {
      const mesh = this.targets[i]; mesh.visible = game.mode !== 'off' && target.active;
      if (!mesh.visible) return;
      point(target, mesh.position); mesh.scale.setScalar(target.radius * height);
    });
    this.ring.visible = game.mode === 'dodge';
    if (this.ring.visible) { point(game.player, this.ring.position); this.ring.scale.setScalar(height); }
    const visible = !!sword && validSword(sword, nowMs);
    this.blade.visible = this.core.visible = this.base.visible = this.tip.visible = visible;
    if (!visible || !sword) return;
    const screen = swordToScreen(sword);
    point(screen.base, this.a); point(screen.tip, this.b);
    this.direction.subVectors(this.b, this.a);
    const length = this.direction.length(); this.direction.normalize();
    this.blade.position.copy(this.a).add(this.b).multiplyScalar(.5);
    this.blade.quaternion.setFromUnitVectors(this.up, this.direction); this.blade.scale.set(.016, length, .016);
    this.core.position.copy(this.blade.position); this.core.position.z += .02;
    this.core.quaternion.copy(this.blade.quaternion); this.core.scale.set(.006, length, .006);
    this.base.position.copy(this.a); this.tip.position.copy(this.b);
    this.base.scale.setScalar(.027); this.tip.scale.setScalar(.027);
  }

  dispose(): void { this.group.removeFromParent(); this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); }
}
