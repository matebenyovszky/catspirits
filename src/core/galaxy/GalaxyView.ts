import * as THREE from 'three';
import { deepSea, glowTexture, halo, luminousTree, moteCloud } from './Sea';
import { starseed, stations, type Dive, type Larva, type Position } from './Dive';
import type { HeadMotion } from './AirPodsLink';
import { t } from '../../i18n';

const { clamp, damp, radToDeg, smoothstep } = THREE.MathUtils;
const orbit = (center: THREE.Vector3, yaw: number, pitch: number, distance: number) =>
  new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    .multiplyScalar(distance).add(center);
const asVector = (p: Position) => new THREE.Vector3(...p);
export const CURRENT_GATE = 'current';
type Target = {
  model: THREE.Group;
  button: HTMLButtonElement;
  x: number;
  y: number;
  depth: number;
  radius: number;
};
type Creature = Target & { home: THREE.Vector3; forward: THREE.Vector3; beads: THREE.Mesh[]; phase: number };
type Transition = {
  duration: number;
  curve: THREE.QuadraticBezierCurve3;
  lookFrom: THREE.Vector3;
  elapsed: number;
};

export class GalaxyView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, .1, 160);
  private readonly map = glowTexture();
  private readonly sky = deepSea();
  private readonly motes = moteCloud();
  private readonly tree = luminousTree(this.map);
  private readonly creatures = new Map<string, Creature>();
  private readonly targets = new Map<string, Target>();
  private readonly route = new THREE.Group();
  private readonly routeTrail: THREE.Sprite[];
  private readonly gem: Target;
  private readonly gate: Target;
  private readonly resize: ResizeObserver;
  private readonly scratch = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private width = 1;
  private height = 1;
  private yaw = 0;
  private yawGoal = 0;
  private pitch = 0;
  private pitchGoal = 0;
  private distance = 24;
  private distanceGoal = 24;
  private roll = 0;
  private rollGoal = 0;
  private body = 0;
  private transition?: Transition;

  constructor(
    private readonly stage: HTMLElement,
    surface: HTMLElement,
    private readonly targetLayer: HTMLElement,
    private readonly game: Dive,
    private readonly activate: (id: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#051024');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    surface.append(this.renderer.domElement);
    const light = new THREE.DirectionalLight('#c7f3ff', 3.2);
    light.position.set(-4.5, 13, 9);
    const fill = new THREE.DirectionalLight('#ccadff', 2.3);
    fill.position.set(6, 6, -8);
    this.scene.fog = new THREE.FogExp2('#122459', .016);
    this.scene.add(light, fill, new THREE.HemisphereLight('#90dcff', '#7850a1', 1.55),
      this.sky, this.motes, this.tree.group, this.route);
    const geometry = new THREE.SphereGeometry(1, 14, 10);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#182335' });
    stations.flatMap(station => station.larvae).forEach((larva, index) => this.addCreature(larva, index, geometry, eyeMaterial));

    const gateModel = new THREE.Group();
    const gateRing = new THREE.Mesh(new THREE.TorusGeometry(.55, .036, 8, 42),
      new THREE.MeshBasicMaterial({ color: '#8deeff' }));
    gateModel.add(gateRing, halo(this.map, '#9eeeea', 2.35, .85));
    this.gate = this.addTarget(CURRENT_GATE, 'Úszás a következő ághoz', gateModel, 'gate');

    const gemModel = new THREE.Group();
    gemModel.position.copy(asVector(starseed.position));
    const jewel = new THREE.Mesh(new THREE.IcosahedronGeometry(.49, 0),
      new THREE.MeshStandardMaterial({ color: starseed.color, emissive: '#ffbd77', emissiveIntensity: .87, roughness: .25, metalness: .31, flatShading: true }));
    const aura = new THREE.Mesh(new THREE.TorusGeometry(.74, .023, 8, 40), new THREE.MeshBasicMaterial({ color: '#fff4c1' }));
    aura.rotation.set(.72, .62, -.23);
    gemModel.add(jewel, halo(this.map, '#ffbc79', 3.05, 1), aura);
    this.gem = this.addTarget(starseed.id, 'A Csillagmag felvétele', gemModel, 'seed');

    this.routeTrail = Array.from({ length: 13 }, (_, i) => {
      const spark = halo(this.map, '#b4a3ff', i % 4 === 0 ? .84 : .41, .78);
      this.route.add(spark);
      return spark;
    });
    this.resize = new ResizeObserver(() => this.measure());
    this.resize.observe(this.stage);
    this.enter(false);
    this.measure();
  }

  get travelling(): boolean { return !!this.transition; }

  private measure(): void {
    this.width = Math.max(1, this.stage.clientWidth);
    this.height = Math.max(1, this.stage.clientHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = clamp(radToDeg(2 * Math.atan(.69 / this.camera.aspect)), 44, 86);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65, Math.sqrt(1_450_000 / (this.width * this.height))));
    this.renderer.setSize(this.width, this.height, false);
  }

  private addTarget(id: string, label: string, model: THREE.Group, kind: 'larva' | 'gate' | 'seed'): Target {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `galaxy-target galaxy-target--${kind}`;
    button.dataset.galaxyTarget = id;
    button.setAttribute('aria-label', t(label));
    button.title = t(label);
    button.hidden = true;
    if (kind !== 'larva') button.textContent = kind === 'seed' ? '✦' : '➜';
    button.addEventListener('click', event => {
      // Keyboard and pinch activation already identify a specific button.
      if (event.detail === 0) {
        this.activate(id);
        return;
      }
      const { left, top } = this.stage.getBoundingClientRect();
      const picked = this.pick(event.clientX - left - this.stage.clientLeft, event.clientY - top - this.stage.clientTop);
      if (picked?.dataset.galaxyTarget) this.activate(picked.dataset.galaxyTarget);
    });
    this.targetLayer.append(button);
    this.scene.add(model);
    const target = { model, button, x: 0, y: 0, depth: 0, radius: 30 };
    this.targets.set(id, target);
    return target;
  }

  private addCreature(larva: Larva, index: number, geometry: THREE.SphereGeometry, eyeMaterial: THREE.MeshBasicMaterial): void {
    const model = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: larva.color, emissive: larva.color, emissiveIntensity: .42, roughness: .31,
    });
    const beads = Array.from({ length: 7 }, (_, beadIndex) => {
      const bead = new THREE.Mesh(geometry, material);
      const size = beadIndex === 0 ? .385 : .29 - beadIndex * .019;
      bead.scale.set(size * 1.19, size, size);
      model.add(bead);
      return bead;
    });
    for (const z of [-.265, .265]) {
      const eye = new THREE.Mesh(geometry, eyeMaterial);
      eye.scale.setScalar(.065);
      eye.position.set(.25, .13, z);
      beads[0].add(eye);
      // The eye is a small detail carried by the head; use its own local scale.
      eye.position.divide(beads[0].scale);
      eye.scale.divide(beads[0].scale);
    }
    const lamp = halo(this.map, larva.color, 2.8, .85);
    lamp.position.x = -.37;
    model.add(lamp);
    const label = t('Fényhernyó elkapása: {name}', { name: t(larva.name) });
    const target = this.addTarget(larva.id, label, model, 'larva');
    target.button.style.setProperty('--target', larva.color);
    const creature = { ...target, home: asVector(larva.position), forward: asVector(larva.axis).normalize(), beads, phase: index * 1.74 };
    this.targets.set(larva.id, creature);
    this.creatures.set(larva.id, creature);
  }

  enter(swim: boolean): void {
    const station = this.game.station;
    const to = asVector(station.center);
    if (swim && !this.reduced) {
      const destination = orbit(to, station.yaw, station.pitch, station.distance);
      const through = this.camera.position.clone().lerp(destination, .46).lerp(to, .23);
      through.y += this.game.lookingForSeed ? -1 : 1.2;
      this.transition = {
        duration: clamp(this.camera.position.distanceTo(destination) / 21, 1.75, 2.85),
        curve: new THREE.QuadraticBezierCurve3(this.camera.position.clone(), through, destination),
        lookFrom: this.look.clone(), elapsed: 0,
      };
    } else {
      this.transition = undefined;
    }
    this.yaw = this.yawGoal = station.yaw;
    this.pitch = this.pitchGoal = station.pitch;
    this.distance = this.distanceGoal = station.distance;
    this.roll = this.rollGoal = 0;
    this.setRoute();
    for (const target of this.targets.values()) target.button.hidden = true;
  }

  private setRoute(): void {
    const station = this.game.station;
    const location = station.gate ?? starseed.position;
    this.gate.model.position.copy(asVector(location));
    const from = asVector(station.center).add(this.scratch.set(0, -1, 2.2));
    const to = asVector(location);
    // Only an amethyst glimmer marks the bend around the trunk.
    const clue = new THREE.Vector3(-3.2, 3.1, -2.8);
    const bend = this.game.lookingForSeed ? clue : from.clone().lerp(to, .5).add(this.scratch.set(-.7, .45, 1.2));
    const curve = new THREE.QuadraticBezierCurve3(from, bend, this.game.lookingForSeed ? clue.clone().lerp(to, .7) : to);
    this.routeTrail.forEach((dot, i) => curve.getPoint((i + 1) / (this.routeTrail.length + 1), dot.position));
  }

  center(): void {
    const { yaw, pitch, distance } = this.game.station;
    this.yawGoal += Math.atan2(Math.sin(yaw - this.yawGoal), Math.cos(yaw - this.yawGoal));
    this.pitchGoal = pitch;
    this.distanceGoal = distance;
    this.rollGoal = 0;
  }

  turn(dx: number, dy: number): void {
    this.yawGoal -= dx * .007;
    this.pitchGoal = clamp(this.pitchGoal + dy * .006, -.78, .77);
  }

  tilt(yaw: number, pitch: number, roll: number): void {
    this.yawGoal += yaw;
    this.pitchGoal = clamp(this.pitchGoal + pitch, -.78, .77);
    this.rollGoal = clamp(this.rollGoal + roll, -.26, .26);
  }

  zoom(scale: number): void {
    this.distanceGoal = clamp(this.distanceGoal / scale, 7, this.game.station.distance * 1.58);
  }

  setBody(yaw: number): void { this.body = yaw; }

  draw(time: number, dt: number, head: HeadMotion | undefined): void {
    const station = this.game.station;
    const center = asVector(station.center);
    if (this.transition) {
      const travel = this.transition;
      travel.elapsed = Math.min(travel.duration, travel.elapsed + dt);
      const u = smoothstep(travel.elapsed / travel.duration, 0, 1);
      travel.curve.getPoint(u, this.eye);
      this.look.copy(travel.lookFrom).lerp(center, u);
      if (travel.elapsed >= travel.duration) this.transition = undefined;
    } else {
      if (head) {
        const yawStep = head.yawRate * dt;
        this.yaw += yawStep;
        this.yawGoal += yawStep;
        this.pitch = clamp(this.pitch + head.pitchRate * dt, -.78, .77);
        this.pitchGoal = clamp(this.pitchGoal + head.pitchRate * dt, -.78, .77);
      }
      this.yaw = damp(this.yaw, this.yawGoal, 9, dt);
      this.pitch = damp(this.pitch, this.pitchGoal, 9, dt);
      this.distance = damp(this.distance, this.distanceGoal, 7.5, dt);
      this.roll = damp(this.roll, this.rollGoal, 7, dt);
      this.eye.copy(orbit(center, this.yaw + this.body, this.pitch, this.distance));
      this.look.copy(center);
    }
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.look);
    this.camera.rotateZ(this.roll);
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.eye);

    const motion = this.reduced ? 0 : time / 1000;
    this.motes.material.uniforms.time.value = motion;
    this.tree.glitter.material.uniforms.time.value = motion * 1.12;
    const present = !this.travelling;
    const nearby = station.larvae;
    for (const [id, creature] of this.creatures) {
      const visible = present && nearby.some(larva => larva.id === id) && !this.game.collected(id);
      if (visible) this.swimCreature(creature, motion);
      this.project(creature, visible);
    }
    this.route.visible = present && (this.game.canSwim || this.game.lookingForSeed);
    this.routeTrail.forEach((dot, i) => { dot.material.opacity = .52 + Math.sin(i * .68 - motion * 3.1) * .24; });
    this.gate.model.quaternion.copy(this.camera.quaternion);
    this.gate.model.rotateZ(Math.sin(motion * .6) * .23);
    this.project(this.gate, present && this.game.canSwim);
    this.gem.model.rotation.y = motion * .58;
    // The fold behind the trunk hides the light from the entry side of the cove.
    const behindTrunk = this.camera.position.x < center.x - this.distance * .15 && this.camera.position.z < center.z;
    this.project(this.gem, present && this.game.lookingForSeed && behindTrunk);
    this.renderer.render(this.scene, this.camera);
  }

  private swimCreature(creature: Creature, time: number): void {
    const phase = time * (1.05 + creature.phase * .055) + creature.phase;
    creature.model.position.copy(creature.home).addScaledVector(creature.forward, Math.sin(phase) * .90);
    creature.model.position.y += Math.sin(phase * 1.41) * .36;
    creature.model.position.z += Math.cos(phase * 1.14) * .42;
    creature.model.rotation.set(.12 * Math.cos(phase), Math.atan2(-creature.forward.z, creature.forward.x) + Math.sin(phase * .78) * .53, .14 * Math.cos(phase));
    for (const [index, bead] of creature.beads.entries()) {
      bead.position.set(-index * .265, Math.sin(phase * 3 - index * .66) * index * .045, Math.cos(phase * 2.8 - index * .61) * index * .053);
    }
  }

  private project(target: Target, active: boolean): void {
    target.model.visible = active;
    if (active) {
      this.scratch.copy(target.model.position).applyMatrix4(this.camera.matrixWorldInverse);
      target.depth = -this.scratch.z;
      const point = this.projected.copy(target.model.position).project(this.camera);
      target.x = (point.x * .5 + .5) * this.width;
      target.y = (.5 - point.y * .5) * this.height;
      target.radius = target === this.gate ? 39 : clamp(34 - (target.depth - 12) * .49, 24, 40);
      if (target.depth > .6 && Math.abs(point.x) <= .95 && Math.abs(point.y) <= .94) {
        target.button.hidden = false;
        target.button.style.setProperty('--hit', `${Math.round(target.radius * 2)}px`);
        target.button.style.transform = `translate(${target.x.toFixed(1)}px, ${target.y.toFixed(1)}px) translate(-50%, -50%)`;
        return;
      }
    }
    target.button.hidden = true;
  }

  visible(id: string): boolean { return this.targets.get(id)?.button.hidden === false; }

  pick(x: number, y: number, tolerance = 0): HTMLButtonElement | undefined {
    let hit: HTMLButtonElement | undefined;
    let bestDistance = Infinity;
    for (const [id, target] of this.targets) {
      if (target.button.hidden || this.game.collected(id)) continue;
      const distance = Math.hypot(target.x - x, target.y - y);
      if (distance <= target.radius + tolerance && distance < bestDistance) {
        hit = target.button;
        bestDistance = distance;
      }
    }
    return hit;
  }

  dispose(): void {
    this.resize.disconnect();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      } else if (object instanceof THREE.Sprite) {
        materials.add(object.material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.map.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
