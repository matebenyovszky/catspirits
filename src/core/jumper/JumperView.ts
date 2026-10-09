import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { WORLDS, SUITS, LOOK_AHEAD_SECTIONS, type JumperEvent, type JumperSimulation } from './JumperSimulation';

type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; duration: number };
const random = (i: number) => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

export class JumperView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private world = new THREE.Group();
  private road = new THREE.Group();
  private robot = new THREE.Group();
  private body = new THREE.Group();
  private leftArm = new THREE.Group();
  private rightArm = new THREE.Group();
  private leftLeg = new THREE.Group();
  private rightLeg = new THREE.Group();
  private hurdle = new THREE.Group();
  private hurdles: THREE.Group[] = [];
  private duckGate = new THREE.Group();
  private duckGates: THREE.Group[] = [];
  private duckPose = 0;
  private duckGlow = new THREE.MeshStandardMaterial({ color:'#ffcf70',emissive:'#ffba4b',emissiveIntensity:1.2,roughness:.35 });
  private jumpGlow = new THREE.MeshStandardMaterial({ color:'#ae7aff',emissive:'#9867ff',emissiveIntensity:1.5,roughness:.35 });
  private pickups = new Map<string, THREE.Group>();
  private particles: Particle[] = [];
  private rings: { mesh: THREE.Mesh; life: number }[] = [];
  private glow = new THREE.MeshStandardMaterial({ color: '#53f2d1', emissive: '#53f2d1', emissiveIntensity: 1.6, roughness: .35 });
  private worldGlow = new THREE.MeshStandardMaterial({ color: '#53f2d1', emissive: '#53f2d1', emissiveIntensity: 1.5 });
  private accent = new THREE.MeshStandardMaterial({ color: '#ae7aff', emissive: '#ae7aff', emissiveIntensity: 1.3 });
  private shell = new THREE.MeshStandardMaterial({ color: '#dce1ff', metalness: .35, roughness: .36 });
  private dark = new THREE.MeshStandardMaterial({ color: '#131b37', metalness: .45, roughness: .4 });
  private crystalMaterial = new THREE.MeshStandardMaterial({ color: '#91f9ed', emissive: '#56eacb', emissiveIntensity: 1.4, metalness: .2, roughness: .22 });
  private particleGeometry = new THREE.OctahedronGeometry(.06);
  private crystalGeometry = new THREE.OctahedronGeometry(.15);
  private time = 0;
  private activeWorld = -1;
  private shake = 0;
  private idleDistance = 0;
  private batches: { mesh: THREE.InstancedMesh; entries: { parent: THREE.Group; matrix: THREE.Matrix4 }[] }[] = [];
  private instanceMatrix = new THREE.Matrix4();
  private shield: THREE.Mesh;
  private shadow: THREE.Mesh;
  private disposed = false;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.info.autoReset = false;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), .32, .35, 1.4);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.scene.add(new THREE.HemisphereLight('#b8d5ff', '#403353', 1.6));
    const light = new THREE.DirectionalLight('#fff0dc', 2.4); light.position.set(-3, 7, 4); this.scene.add(light);
    const rim = new THREE.DirectionalLight('#7a7bff', 1.3); rim.position.set(3, 3, -5); this.scene.add(rim);
    this.scene.add(this.world, this.road, this.robot, this.hurdle);
    this.buildRobot();
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(.95, 24, 16), new THREE.MeshBasicMaterial({
      color: '#66ccff', transparent: true, opacity: .09, wireframe: true, depthWrite: false,
    }));
    this.shield.position.y = .7; this.robot.add(this.shield); this.shield.visible = false;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.43, 24), new THREE.MeshBasicMaterial({ color: '#020615', transparent: true, opacity: .5 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = .008; this.scene.add(this.shadow);
    this.buildRoad(); this.buildHurdle(); this.buildDuckGate();
    this.hurdles = Array.from({ length: LOOK_AHEAD_SECTIONS }, (_, index) => index === 0 ? this.hurdle : this.hurdle.clone());
    this.hurdles.slice(1).forEach(hurdle => this.scene.add(hurdle));
    this.duckGates = Array.from({ length: LOOK_AHEAD_SECTIONS }, (_, index) => index === 0 ? this.duckGate : this.duckGate.clone());
    this.duckGates.forEach(gate => this.scene.add(gate));
    this.setWorld(0); this.resize();
  }

  private box(group: THREE.Group, dimensions: number[], position: number[], material: THREE.Material, radius = .045): THREE.Mesh {
    const geometry = group.parent === this.world
      ? new THREE.BoxGeometry(dimensions[0], dimensions[1], dimensions[2])
      : new RoundedBoxGeometry(dimensions[0], dimensions[1], dimensions[2], 2, radius);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]); group.add(mesh); return mesh;
  }

  private buildRobot(): void {
    this.robot.add(this.body, this.leftLeg, this.rightLeg);
    this.box(this.body, [.58,.52,.43], [0,.67,0], this.shell, .09);
    this.box(this.body, [.28,.15,.035], [0,.7,.226], this.dark);
    this.box(this.body, [.15,.035,.04], [0,.7,.25], this.glow, .015);
    this.box(this.body, [.8,.53,.59], [0,1.2,.025], this.shell, .11);
    this.box(this.body, [.65,.29,.06], [0,1.21,.332], this.dark, .07);
    for (const side of [-1,1]) {
      this.box(this.body, [.075,.115,.027], [side * .165,1.23,.367], this.glow, .025);
      this.box(this.body, [.16,.28,.18], [side * .31,1.58,.02], this.glow, .06).rotation.z = -side * .16;
      const ear = new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 12), this.dark); ear.position.set(side*.43,1.2,.025); this.body.add(ear);
    }
    this.box(this.body, [.07,.023,.027], [0,1.125,.367], this.shell, .008);
    this.box(this.body, [.3,.36,.12], [0,.7,-.27], this.dark);
    for (const [arm, side] of [[this.leftArm,-1],[this.rightArm,1]] as const) {
      arm.position.set(side*.37,.89,0); this.body.add(arm);
      this.box(arm, [.18,.35,.22], [0,-.15,0], this.shell, .06);
      this.box(arm, [.19,.15,.23], [0,-.33,.02], this.glow, .06);
    }
    for (const [leg,side] of [[this.leftLeg,-1],[this.rightLeg,1]] as const) {
      leg.position.set(side*.18,.42,0);
      this.box(leg, [.18,.28,.2], [0,-.1,0], this.dark);
      this.box(leg, [.25,.17,.36], [0,-.32,.045], this.shell, .05);
      this.box(leg, [.26,.055,.37], [0,-.382,.045], this.glow, .02);
    }
  }

  private buildRoad(): void {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 58), new THREE.MeshStandardMaterial({ color: '#101a32', metalness: .55, roughness: .48 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0,-.025,-24); this.road.add(ground);
    for (const side of [-1,1]) {
      this.box(this.road, [.07,.05,58], [side*2.57,.015,-24], this.worldGlow, .02);
      this.box(this.road, [.16,.18,58], [side*2.72,-.02,-24], this.dark);
      for (let i = 0; i < 18; i++) {
        const marker = this.box(this.road, [.045,.015,.7], [side*.575,.008,-i*2.6], this.accent, .005);
        marker.userData.marker = i;
      }
    }
    for (let i = 0; i < 20; i++) {
      const stripe = this.box(this.road, [5.05,.006,.025], [0,0,-i*2.6], this.dark, .001);
      stripe.userData.grid = i;
    }
    const target = new THREE.Mesh(new THREE.RingGeometry(.45,.48,48), this.worldGlow);
    target.rotation.x = -Math.PI/2; target.position.set(0,.014,0); target.userData.target = true; this.road.add(target);
  }

  private buildHurdle(): void {
    this.box(this.hurdle, [4.85,.2,.16], [0,.19,0], this.jumpGlow, .04);
    this.box(this.hurdle, [4.6,.035,.18], [0,.3,0], this.jumpGlow, .014);
    for (const side of [-1,1]) {
      this.box(this.hurdle, [.17,.42,.28], [side*2.35,.21,0], this.dark);
      this.box(this.hurdle, [.19,.04,.3], [side*2.35,.42,0], this.jumpGlow, .015);
    }
    for (let i = 0; i < 7; i++) {
      const mesh = this.box(this.hurdle, [.22,.06,.02], [(i-3)*.55,.2,.091], this.jumpGlow, .01);
      mesh.rotation.z = -.5;
    }
  }

  private buildDuckGate(): void {
    this.box(this.duckGate,[4.85,.32,1.0],[0,1.3,0],this.duckGlow,.06);
    this.box(this.duckGate,[4.6,.05,1.05],[0,1.11,0],this.dark,.02);
    for(const side of [-1,1]){
      this.box(this.duckGate,[.16,1.7,.22],[side*2.35,.85,0],this.dark);
      this.box(this.duckGate,[.06,1.7,.25],[side*2.35,.85,0],this.duckGlow,.02);
    }
    for(let i=0;i<5;i++)for(const side of [-1,1]){
      const arrow=this.box(this.duckGate,[.2,.06,.035],[(i-2)*.8+side*.055,1.3,.52],this.dark,.01);
      arrow.rotation.z=side*Math.PI/4;
    }
  }

  private clearWorld(): void {
    this.batches = [];
    this.world.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        if (object instanceof THREE.InstancedMesh) object.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(material => material !== this.worldGlow && material !== this.accent && material !== this.dark).forEach(material => material.dispose());
      }
    });
    this.world.clear();
  }

  setWorld(level: number): void {
    if (this.activeWorld === level) return;
    this.activeWorld = level; this.clearWorld();
    const theme = WORLDS[level];
    this.scene.background = new THREE.Color(theme.sky); this.scene.fog = new THREE.Fog(theme.sky, 32, 75);
    this.worldGlow.color.set(theme.color); this.worldGlow.emissive.set(theme.color);
    this.accent.color.set(theme.accent); this.accent.emissive.set(theme.accent);
    const positions: number[] = [];
    for (let i = 0; i < 240; i++) positions.push((random(i)*2-1)*44,3+random(i+700)*22,-5-random(i+500)*70);
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions,3)),
      new THREE.PointsMaterial({ color: '#c5d3ff', size: .065, transparent: true, opacity: .75 })); this.world.add(stars);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(5.2,48,32), new THREE.MeshBasicMaterial({ color: theme.accent }));
    planet.position.set(-14,12,-49); this.world.add(planet);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(7.3,.045,8,80), this.worldGlow);
    orbit.position.copy(planet.position); orbit.rotation.set(.9,.3,.2); this.world.add(orbit);
    for (let i = 0; i < 36; i++) {
      const side = i%2 ? -1 : 1, z = -i/2*3.4;
      const structure = new THREE.Group(); structure.position.set(side*(4.3+random(i+70)*6),0,z);
      structure.userData.scenery = { z, index:i }; this.world.add(structure);
      if (level === 1) {
        this.box(structure,[.14,1.6,.14],[0,.8,0],this.accent);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.8),this.worldGlow); crown.position.y = 2.1; structure.add(crown);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.75,.026,6,24),this.accent); ring.rotation.x = Math.PI/2; ring.position.y = .3; structure.add(ring);
      } else if (level === 3) {
        const crystal = new THREE.Mesh(new THREE.ConeGeometry(.55,2+random(i)*3,5),this.accent);
        crystal.position.y = 1; crystal.rotation.z = side*.2; structure.add(crystal);
        this.box(structure,[1.4,.04,2.5],[0,.02,0],this.worldGlow);
      } else if (level === 2) {
        const drone = new THREE.Mesh(new THREE.IcosahedronGeometry(.5),this.dark); drone.position.y = 2.6+random(i)*2; structure.add(drone);
        const orbit = new THREE.Mesh(new THREE.TorusGeometry(.9,.035,8,32),this.worldGlow);
        orbit.position.copy(drone.position); orbit.rotation.x = 1; structure.add(orbit);
        this.box(structure,[.12,2,.12],[0,1,0],this.accent);
      } else if (level === 4) {
        this.box(structure,[.28,5,.28],[0,2.5,0],this.worldGlow);
        const rainbow = new THREE.Mesh(new THREE.TorusGeometry(2,.08,8,32,Math.PI),i%4 ? this.accent : this.worldGlow);
        rainbow.position.set(-side*2,4.8,0); structure.add(rainbow);
      } else {
        const height = 2.5+random(i+110)*7, width=.8+random(i+180)*1.2;
        this.box(structure,[width,height,1.1],[0,height/2,0],this.dark);
        this.box(structure,[.035,height,.025],[-width/2+.08,height/2,.57],this.worldGlow,.008);
        for (let w=0;w<4;w++) this.box(structure,[width*.7,.06,.025],[0,.4+w*height/4,.57],w%2?this.accent:this.worldGlow,.008);
      }
    }
    this.batchScenery();
  }

  /** Moving scenery shares geometry and draw calls, including on mobile GPUs. */
  private batchScenery(): void {
    const groups = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; entries: { parent: THREE.Group; matrix: THREE.Matrix4 }[] }>();
    for (const parent of this.world.children) {
      if (!(parent instanceof THREE.Group) || !parent.userData.scenery) continue;
      for (const object of [...parent.children]) {
        if (!(object instanceof THREE.Mesh)) continue;
        object.updateMatrix();
        const box = object.geometry instanceof THREE.BoxGeometry;
        const key = `${object.material.uuid}:${box ? 'box' : object.geometry.type + JSON.stringify(object.geometry.parameters)}`;
        let group = groups.get(key);
        if (!group) {
          group = { geometry: box ? new THREE.BoxGeometry(1,1,1) : object.geometry.clone(), material: object.material, entries: [] };
          groups.set(key, group);
        }
        const matrix = object.matrix.clone();
        if (box) {
          const parameters = object.geometry.parameters;
          matrix.scale(new THREE.Vector3(parameters.width,parameters.height,parameters.depth));
        }
        group.entries.push({ parent, matrix });
        parent.remove(object); object.geometry.dispose();
      }
    }
    for (const group of groups.values()) {
      const mesh = new THREE.InstancedMesh(group.geometry,group.material,group.entries.length);
      mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.world.add(mesh); this.batches.push({ mesh, entries: group.entries });
    }
  }

  setSuit(suit: number): void { this.glow.color.set(SUITS[suit].color); this.glow.emissive.set(SUITS[suit].color); }

  resize(): void {
    const { width,height } = this.renderer.domElement.getBoundingClientRect();
    this.camera.aspect = Math.max(1,width)/Math.max(1,height); this.camera.updateProjectionMatrix();
    this.renderer.setSize(width,height,false); this.composer.setSize(width,height);
  }

  event(event: JumperEvent, simulation: JumperSimulation): void {
    if (this.reducedMotion) return;
    if (event.type === 'hit') this.shake = .18;
    if (event.type === 'land' || event.type === 'jump' || event.type === 'duck') {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(.26,.31,32),new THREE.MeshBasicMaterial({
        color: event.type==='duck' ? '#ffcf70' : SUITS[0].color, transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide,
      }));
      mesh.position.set(simulation.lane*1.15,.025,0); mesh.rotation.x = -Math.PI/2; this.scene.add(mesh); this.rings.push({mesh,life:.45});
    }
    if (!['crystal','clear','shield','level','finish','hit'].includes(event.type)) return;
    const celebrating = event.type === 'level' || event.type === 'finish';
    const count = celebrating ? 65 : event.type === 'crystal' ? 7 : 18;
    for (let i=0;i<count && this.particles.length<110;i++) {
      const material = new THREE.MeshBasicMaterial({ color: event.type === 'hit' ? '#fa80a8' : i%2 ? WORLDS[simulation.level].color : WORLDS[simulation.level].accent, transparent:true });
      const mesh = new THREE.Mesh(this.particleGeometry,material);
      mesh.position.set(celebrating ? (random(i+100)*2-1)*3 : simulation.lane*1.15,celebrating ? 3 : simulation.runner.state.height+.65,celebrating ? -3 : 0);
      this.scene.add(mesh); const duration = celebrating ? 2.1 : .55;
      this.particles.push({ mesh, duration, life:duration, velocity:new THREE.Vector3((Math.random()-.5)*3,Math.random()*3,(Math.random()-.5)*3) });
    }
  }

  private pickupMesh(kind: string): THREE.Group {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(kind === 'crystal' ? this.crystalGeometry : new THREE.IcosahedronGeometry(.2),kind==='crystal'?this.crystalMaterial:this.worldGlow); group.add(mesh);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(kind==='crystal'?.23:.3,.012,6,24),kind==='crystal'?this.accent:this.worldGlow);
    orbit.rotation.x=Math.PI/2; group.add(orbit); return group;
  }

  update(delta: number, simulation: JumperSimulation): void {
    if (this.disposed) return;
    const dt=Math.min(.05,delta); this.time+=dt; this.setWorld(simulation.level);
    const game = simulation.runner.state, running=simulation.phase==='running', idle=simulation.phase==='ready';
    if (idle && !this.reducedMotion) this.idleDistance+=dt*.6;
    const distance=idle?this.idleDistance:game.distance;
    this.duckPose=THREE.MathUtils.damp(this.duckPose,!idle && simulation.ducking ? 1 : 0,35,dt);
    this.robot.scale.set(idle ? 1.3 : 1+this.duckPose*.1,idle ? 1.3 : 1-this.duckPose*.5,idle ? 1.3 : 1);
    this.body.rotation.x=this.duckPose*.18;
    this.robot.position.x=THREE.MathUtils.damp(this.robot.position.x,idle ? 1.3 : simulation.lane*1.15,12,dt);
    this.robot.position.y=THREE.MathUtils.damp(this.robot.position.y,game.height,30,dt);
    this.robot.rotation.z=THREE.MathUtils.damp(this.robot.rotation.z,(simulation.lane*1.15-this.robot.position.x)*-.12,8,dt);
    const stride=running && !game.paused && !this.reducedMotion ? Math.sin(distance*8)*.55 : 0;
    this.leftLeg.rotation.x=game.height>.05 ? -.35 : stride; this.rightLeg.rotation.x=game.height>.05 ? -.35 : -stride;
    this.leftArm.rotation.x=game.height>.05 ? -1.1 : -stride; this.rightArm.rotation.x=game.height>.05 ? -1.1 : stride;
    this.body.position.y=this.reducedMotion?0:Math.sin(this.time*3)*.022;
    this.shield.visible=simulation.shield; this.shield.rotation.y+=dt*.4;
    this.shadow.position.x=this.robot.position.x; this.shadow.scale.setScalar((idle ? 1.3 : 1)*(1-game.height*.25));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity=.5-game.height*.2;
    const sections = simulation.lookAhead;
    this.hurdles.forEach((hurdle, index) => {
      const section = sections[index];
      hurdle.visible = !!section && section.kind==='jump';
      if (section) hurdle.position.z = -section.distance;
      const duckGate=this.duckGates[index];
      duckGate.visible=!!section && section.kind==='duck';
      if(section)duckGate.position.z=-section.distance;
    });
    this.road.children.forEach(child=>{
      if (child.userData.target) child.position.x = this.robot.position.x;
      if (child.userData.marker!==undefined) child.position.z=3-((child.userData.marker*2.6-distance)%46.8+46.8)%46.8;
      if (child.userData.grid!==undefined) child.position.z=3-((child.userData.grid*2.6-distance)%52+52)%52;
    });
    this.world.children.forEach(child=>{
      if (child.userData.scenery) child.position.z=4-((4-child.userData.scenery.z-distance*.7)%62+62)%62;
    });
    for (const batch of this.batches) {
      batch.entries.forEach((entry,index)=>{
        this.instanceMatrix.copy(entry.matrix);
        this.instanceMatrix.elements[12]+=entry.parent.position.x;
        this.instanceMatrix.elements[13]+=entry.parent.position.y;
        this.instanceMatrix.elements[14]+=entry.parent.position.z;
        batch.mesh.setMatrixAt(index,this.instanceMatrix);
      });
      batch.mesh.instanceMatrix.needsUpdate=true;
    }
    const visiblePickups = sections.flatMap(section => section.pickups.map(pickup => ({ ...pickup, key: `${section.index}:${pickup.slot}` })));
    const ids=new Set(visiblePickups.map(p=>p.key));
    for(const [id,mesh] of this.pickups) if(!ids.has(id)) { mesh.removeFromParent(); this.disposePickup(mesh); this.pickups.delete(id); }
    for(const pickup of visiblePickups) {
      let mesh=this.pickups.get(pickup.key);
      if(!mesh) { mesh=this.pickupMesh(pickup.kind); this.pickups.set(pickup.key,mesh); this.scene.add(mesh); }
      mesh.position.set(pickup.lane*1.15,pickup.height+.47,-pickup.distance);
      mesh.rotation.y=this.reducedMotion?0:this.time*1.8+pickup.slot; mesh.visible=!idle;
    }
    this.particles=this.particles.filter(p=>{
      p.life-=dt;
      if(p.life<=0){p.mesh.removeFromParent();(p.mesh.material as THREE.Material).dispose();return false;}
      p.mesh.position.addScaledVector(p.velocity,dt); p.velocity.y-=dt*4; p.mesh.rotation.z+=dt*3;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity=p.life/p.duration; return true;
    });
    this.rings=this.rings.filter(r=>{
      r.life-=dt; if(r.life<=0){r.mesh.removeFromParent();r.mesh.geometry.dispose();(r.mesh.material as THREE.Material).dispose();return false;}
      r.mesh.scale.setScalar(1+(1-r.life/.45)*2); (r.mesh.material as THREE.MeshBasicMaterial).opacity=r.life/.45*.7; return true;
    });
    this.shake=Math.max(0,this.shake-dt);
    const shake=this.reducedMotion?0:this.shake;
    const portrait = this.camera.aspect < .7;
    this.camera.position.set(Math.sin(this.time*85)*shake*.15, idle ? (portrait ? 5.4 : 3.65) : (portrait ? 7.2 : 6.3),
      idle ? (portrait ? 10.2 : 6.6) : (portrait ? 12 : 10));
    this.camera.lookAt(0,.35,idle ? -5.2 : portrait ? -9.5 : -8.5); this.renderer.info.reset(); this.composer.render();
  }

  private disposePickup(group:THREE.Group):void { group.traverse(object=>{
    if(object instanceof THREE.Mesh && object.geometry!==this.crystalGeometry) object.geometry.dispose();
  }); }

  snapshot(){return {drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,world:this.activeWorld,
    visibleGates:[...this.hurdles,...this.duckGates].filter(gate=>gate.visible).length,
    visibleDuckGates:this.duckGates.filter(gate=>gate.visible).length,visiblePickups:this.pickups.size};}
  dispose():void {
    this.disposed=true;
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.scene.traverse(object=>{if(object instanceof THREE.Mesh || object instanceof THREE.Points){geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.composer.dispose();this.bloom.dispose();this.renderer.dispose();
  }
}
