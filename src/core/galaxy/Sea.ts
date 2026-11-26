import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Position } from './Dive';

const vector = (p: Position) => new THREE.Vector3(...p);
const tau = Math.PI * 2;

function randomSequence(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const halo = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(.12, 'rgba(255,255,255,.6)');
  halo.addColorStop(.35, 'rgba(255,255,255,.16)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 96, 96);
  return new THREE.CanvasTexture(canvas);
}

export function halo(map: THREE.Texture, color: string, diameter: number, opacity: number): THREE.Sprite {
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(diameter);
  return glow;
}

export function particles(
  position: number[], colors: number[], sizes: number[], opacity: number,
): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('tint', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
  return new THREE.Points(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, opacity: { value: opacity } },
    vertexShader: `
      uniform float time;
      attribute vec3 tint;
      attribute float size;
      varying vec3 hue;
      varying float shimmer;
      void main() {
        vec3 p = position;
        p.x += sin(time * .24 + p.z) * .13;
        p.y += cos(time * .17 + p.x) * .10;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(size * 30. / max(1., -mv.z), 1.15, 13.);
        hue = tint;
        shimmer = .72 + .28 * cos(time * .7 + p.x * 2. + p.z);
      }`,
    fragmentShader: `
      uniform float opacity;
      varying vec3 hue;
      varying float shimmer;
      void main() {
        float r = length((gl_PointCoord - .5) * 2.);
        float a = (1. - smoothstep(.05, 1., r)) * (.32 + .68 * exp(-4. * r)) * shimmer;
        gl_FragColor = vec4(hue, a * opacity);
      }`,
  }));
}

export function moteCloud(): ReturnType<typeof particles> {
  const rnd = randomSequence(8282);
  const position = [], colors = [], sizes = [];
  const colorset = ['#7ef3e2', '#c8d9ff', '#efd9ff', '#a7bbff', '#ffdfae'].map(hex => new THREE.Color(hex));
  for (let index = 0; index < 2500; index++) {
    const polar = rnd() * tau;
    const z = rnd() * 2 - 1;
    const distance = index < 690 ? 9 + rnd() * 22 : 32 + rnd() * 42;
    const radius = Math.sqrt(1 - z * z) * distance;
    position.push(radius * Math.cos(polar), z * distance, radius * Math.sin(polar));
    colors.push(...colorset[index % colorset.length].toArray());
    sizes.push(.85 + rnd() ** 3 * 4.4);
  }
  return particles(position, colors, sizes, .84);
}

export function deepSea(): THREE.Mesh {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(112, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec3 direction;
      float hash(vec3 p) {
        p = fract(p * .3183099 + .13);
        p *= 17.;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 d = normalize(direction);
        float plume = noise(d * 5. + 1.2 * noise(d * 3.)) * .58
          + noise(d * 11.) * .28 + noise(d * 25.) * .14;
        float tide = exp(-7. * abs(d.y + .25 * d.x + .24 * sin(d.z * 5. + 1.9)));
        float cold = .5 + .5 * sin(d.z * 8. - d.x * 5.);
        vec3 water = vec3(.016,.041,.091) + vec3(.014,.030,.055) * (.5 + .5 * d.y);
        vec3 nebula = mix(vec3(.30,.11,.30), vec3(.04,.31,.38), cold);
        water += nebula * plume * (.24 + tide * 1.1);
        float shaft = pow(max(0., dot(d, normalize(vec3(-.33,.62,-.90)))), 8.);
        water += vec3(.09,.16,.24) * shaft * (.55 + plume);
        gl_FragColor = vec4(water, 1.);
      }`,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

const branchColors = ['#469ca3', '#3a859e', '#9375c8', '#a25a99', '#4076ae', '#5ba77b', '#b87c6f', '#55a9bc'];
const lightColors = ['#72ffe0', '#8de9fb', '#c8b2ff', '#ffabcb', '#8ab9ff', '#b6ffe4', '#ffe3a8', '#bcfcff'];
type Branch = { curve: THREE.CatmullRomCurve3; radius: number; tip: number; tint: number; sectors: number };

export function luminousTree(map: THREE.Texture): {
  group: THREE.Group; glitter: ReturnType<typeof particles>;
} {
  const group = new THREE.Group();
  const rnd = randomSequence(91829);
  const branches: Branch[] = [];
  const add = (points: Position[], radius: number, tip: number, tint: number, sectors = 8) => {
    const curve = new THREE.CatmullRomCurve3(points.map(vector));
    branches.push({ curve, radius, tip, tint, sectors });
    return curve;
  };
  const trunk = add([[-1,-10,.4],[-.5,-7,.1],[-.95,-3,-.18],[.2,.5,.22],[-.15,3.7,.2],[-.9,6.8,-.05],[.1,10.25,-1.3],[.7,12.8,-1.5],[-.7,16.9,-3.16],[.65,21.8,-4.15],[4,25.6,-4.8]], 1.52, .035, 0, 14);
  const forks = [
    add([[-.7,-6.7,.3],[-3.6,-5,1.4],[-5.8,-4,3],[-9.3,-5.1,3.1],[-11,-6.7,2.7]], .72, .02, 0),
    add([[-.7,-6.3,0],[1.8,-6.65,1.2],[4.3,-6.05,3.4],[7.6,-6.15,4.35],[10.3,-7.9,3.4]], .74, .02, 1),
    add([[.15,-.85,.2],[2.5,.25,.85],[5.3,2.2,1.8],[7.6,1.4,.6],[10.7,1.9,-.3]], .77, .025, 3),
    add([[-.7,-2.6,-.25],[-4.1,-.65,-2.1],[-6.6,.05,-3.85],[-10.4,1.8,-4.4]], .62, .022, 2),
    add([[.1,2.1,.46],[-2.8,3.5,1.58],[-5,4.8,.75],[-7.9,4.3,1.5],[-10.4,6.8,1.1]], .57, .02, 0),
    add([[-.8,5.9,.25],[-3.7,7.05,1.2],[-5.9,8.4,1.0],[-8.1,10.5,.3]], .57, .016, 4),
    add([[-.8,6.55,-.2],[1.5,7.9,.7],[4.5,8.65,-.45],[6.1,10.65,-1.3],[9.15,11.2,-.12]], .54, .018, 4),
    add([[-.25,3.45,-.14],[.08,4.1,-2.7],[-2.5,3.8,-4.1],[-5.35,3.2,-5.85],[-7.2,1.45,-6.2]], .53, .023, 2),
    add([[-.5,-6.5,-.3],[-.8,-7.9,-3],[-3.35,-7.6,-5.2],[-6.1,-8.4,-6.3]], .63, .03, 1),
    add([[.22,11.4,-1.4],[-4.42,12.1,-.15],[-8.9,12.65,1.7],[-13.1,13.85,1.75],[-17.1,15.95,2.85],[-21.5,15.25,2.35]], .84, .032, 5, 10),
    add([[-.58,6.58,-.52],[-4.64,7.05,-3.08],[-8.85,7.65,-7.6],[-12.75,8.4,-10.6],[-16,6.9,-13.1],[-20.2,8,-15.6]], .82, .025, 2, 10),
    add([[.5,13.75,-2.4],[4.5,13.1,-2.8],[8.45,14.25,-3.2],[12.9,16.2,-4],[17.65,18.2,-3.1],[22.5,17.3,-4.75]], .73, .023, 6, 10),
    add([[.08,.52,.2],[4.95,-.65,-2.5],[9,-2.4,-5.9],[13.05,-2.85,-9.95],[16.2,-.6,-13.9],[19,-1.65,-17.5]], .79, .023, 7, 10),
    add([[-.81,-7.3,.04],[-4.25,-8.15,-4.5],[-7.3,-10.7,-7.5],[-10.8,-12.95,-9.9],[-14.75,-13.9,-13.0],[-20.3,-16.7,-14.8]], .91, .025, 3, 10),
  ];
  add([[-.65,-7.8,.1],[-2.1,-9,1.3],[-4.3,-9.5,2.4],[-7.2,-10.7,5.1]], .65, .019, 0);
  add([[-.65,-7.75,.1],[1.1,-8.9,-.4],[4.4,-10.65,-.1],[6.5,-10.8,2.1]], .61, .021, 1);
  add([[-.6,-8.9,.15],[-1.5,-10.2,-1.2],[-.2,-11.1,-2.6],[.7,-11.6,-3.9]], .58, .022, 2);
  const origin = new THREE.Vector3();
  for (const [forkIndex, fork] of forks.entries()) {
    for (let twig = 0; twig < 6; twig++) {
      const from = fork.getPoint(.27 + twig * .115);
      const lateral = (twig % 2 ? 1 : -1) * (.9 + rnd() * 1.7);
      const direction = fork.getTangent(.38 + twig * .08);
      const rise = forkIndex < 2 || forkIndex === 8 || forkIndex === 13 ? .75 - rnd() * 2.4 : .8 + rnd() * 2.45;
      const end = from.clone().addScaledVector(direction, .65 + rnd() * 1.7).add(origin.set(lateral * .67, rise, lateral));
      const bend = from.clone().lerp(end, .51).add(origin.set(.32 * lateral, -.52, .1));
      add([from.toArray(), bend.toArray(), end.toArray()], .24 - twig * .020, .013, branches[forkIndex + 1].tint, 5);
      if (twig % 2 === 0) {
        const root = bend.clone().lerp(end, .4);
        const tip = end.clone().add(origin.set(-lateral * .43, .68 + rnd() * .73, lateral * .34));
        add([root.toArray(), end.clone().lerp(tip, .25).toArray(), tip.toArray()], .075, .008, branches[forkIndex + 1].tint, 4);
      }
    }
  }

  const chunks: THREE.BufferGeometry[] = [];
  const veinPosition: number[] = [], veinColors: number[] = [];
  const position: number[] = [], colors: number[] = [], sizes: number[] = [];
  const point = new THREE.Vector3(), rib = new THREE.Vector3(), last = new THREE.Vector3();
  const tint = new THREE.Color(), glint = new THREE.Color();
  const dark = new THREE.Color('#142a45');
  for (const [index, branch] of branches.entries()) {
    const segments = index === 0 ? 108 : branch.radius >= .5 ? 43 : 15;
    const curve = branch.curve;
    const frames = curve.computeFrenetFrames(segments, false);
    const radial = branch.sectors;
    const vertices: number[] = [], surfaceColors: number[] = [], indices: number[] = [];
    glint.set(lightColors[branch.tint]);
    const pigment = new THREE.Color(branchColors[branch.tint]);
    for (let ring = 0; ring <= segments; ring++) {
      const u = ring / segments;
      curve.getPointAt(u, point);
      const width = branch.tip + (branch.radius - branch.tip) * (1 - u) ** .79;
      for (let j = 0; j <= radial; j++) {
        const angle = j / radial * tau;
        const groove = .95 + Math.cos(angle * 4 + u * 18) * .07 + Math.cos(angle * 2 - u * 11) * .09;
        rib.copy(point)
          .addScaledVector(frames.normals[ring], Math.cos(angle) * width * groove)
          .addScaledVector(frames.binormals[ring], Math.sin(angle) * width * groove);
        vertices.push(...rib.toArray());
        tint.copy(dark).lerp(pigment, .30 + .24 * (1 + Math.cos(angle * 3 + u * 14)) + .08 * rnd());
        surfaceColors.push(...tint.toArray());
        if (ring < segments && j < radial) {
          const a = ring * (radial + 1) + j;
          const b = a + radial + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
      const spiral = .46 + .71 * Math.sin(u * 13 + index * .72);
      rib.copy(point)
        .addScaledVector(frames.normals[ring], Math.cos(spiral) * width * 1.09)
        .addScaledVector(frames.binormals[ring], Math.sin(spiral) * width * 1.09);
      if (ring) {
        veinPosition.push(...last.toArray(), ...rib.toArray());
        tint.copy(glint).multiplyScalar(.51 + .35 * Math.cos(u * 36 + index));
        veinColors.push(...tint.toArray(), ...tint.toArray());
      }
      last.copy(rib);
      if (ring % 3 === 0 || ring === segments) {
        position.push(...rib.toArray());
        colors.push(...glint.toArray());
        sizes.push(1.4 + rnd() * 3.8);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(surfaceColors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    chunks.push(geometry);
  }
  const bark = mergeGeometries(chunks);
  chunks.forEach(chunk => chunk.dispose());
  group.add(new THREE.Mesh(bark, new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, color: '#c3e4f8', roughness: .68, metalness: .18,
    emissive: '#16324b', emissiveIntensity: .45,
  })));
  const veins = new THREE.BufferGeometry();
  veins.setAttribute('position', new THREE.Float32BufferAttribute(veinPosition, 3));
  veins.setAttribute('color', new THREE.Float32BufferAttribute(veinColors, 3));
  group.add(new THREE.LineSegments(veins, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: .69, depthWrite: false, blending: THREE.AdditiveBlending,
  })));
  for (const [index, branch] of branches.entries()) {
    if (branch.radius < .5 && index % 3 !== 0) continue;
    const blossom = halo(map, lightColors[branch.tint], branch.radius > .5 ? 3.15 : 1.50, branch.radius > .5 ? .66 : .60);
    branch.curve.getPointAt(.83, blossom.position);
    group.add(blossom);
  }
  for (let index = 0; index < 6; index++) {
    const light = halo(map, lightColors[index % 3], 3.5 - index * .18, .46);
    trunk.getPointAt(.15 + index * .13, light.position);
    group.add(light);
  }
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({
    color: '#f2fbff', emissive: '#577f9c', emissiveIntensity: .64, roughness: .56, metalness: .07,
  }), branches.length * 7);
  const leaf = new THREE.Object3D();
  const leafUp = new THREE.Vector3(0, 1, 0);
  const leafFlow = new THREE.Vector3();
  let leafCount = 0;
  for (const [index, branch] of branches.entries()) {
    if (index === 0) continue;
    glint.set(lightColors[branch.tint]);
    for (let i = 0; i < 7; i++) {
      const u = .52 + rnd() * .45;
      branch.curve.getPointAt(u, origin);
      branch.curve.getTangentAt(u, leafFlow);
      leafFlow.x += (rnd() - .5) * .9;
      leafFlow.y += (rnd() - .32) * .85;
      leafFlow.z += (rnd() - .5) * .8;
      leafFlow.normalize();
      const length = .12 + rnd() * .31 + (i % 4 === 0 ? .12 : 0);
      leaf.position.copy(origin).add(rib.set((rnd() - .5) * .43, (rnd() - .48) * .38, (rnd() - .5) * .42));
      leaf.quaternion.setFromUnitVectors(leafUp, leafFlow);
      leaf.scale.set(length * .37, length, length * .18);
      leaf.updateMatrix();
      leaves.setMatrixAt(leafCount, leaf.matrix);
      leaves.setColorAt(leafCount++, tint.copy(glint).multiplyScalar(.62 + rnd() * .39));
      for (let spore = 0; spore < 5; spore++) {
        const radius = (.16 + rnd() ** 1.5 * .77) * (branch.radius >= .5 ? 1.35 : .72);
        const angle = rnd() * tau;
        position.push(leaf.position.x + Math.cos(angle) * radius, leaf.position.y + (rnd() - .52) * radius,
          leaf.position.z + Math.sin(angle) * radius);
        colors.push(...glint.toArray());
        sizes.push(.65 + rnd() ** 3 * 2.6);
      }
    }
  }
  leaves.count = leafCount;
  leaves.computeBoundingSphere();
  group.add(leaves);
  const glitter = particles(position, colors, sizes, .92);
  group.add(glitter);
  return { group, glitter };
}
