import * as THREE from 'three';
import { roverCourse, type QuarryRover } from '../../core/festival/workshop';

const LANE = 4.4, DEPTH = 4.5;
const BODY_HALF_WIDTH = .72;
const aperture = roverCourse.passRadius * LANE + BODY_HALF_WIDTH;
const trackEnd = roverCourse.centers.length * roverCourse.spacing * DEPTH;
type Solid = { x:number; y:number; z:number; w:number; h:number; d:number; color:number; roll:number };
type Batch = Solid[];

function brick(batch:Batch, x:number, y:number, z:number, w:number, h:number, d:number, color:number, roll=0) {
  batch.push({x,y,z,w,h,d,color,roll});
}

function instances(batch:Batch, geo:THREE.BoxGeometry, material:THREE.Material):THREE.InstancedMesh {
  const mesh=new THREE.InstancedMesh(geo,material,batch.length);
  const local=new THREE.Object3D(), color=new THREE.Color();
  batch.forEach((solid,i)=>{
    local.position.set(solid.x,solid.y,solid.z);
    local.rotation.z=solid.roll;
    local.scale.set(solid.w,solid.h,solid.d);
    local.updateMatrix();
    mesh.setMatrixAt(i,local.matrix);
    mesh.setColorAt(i,color.setHex(solid.color));
  });
  return mesh;
}

function generator(seed:number) {
  return () => {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed / 4294967296;
  };
}

/** The rover stays at z=0 while the complete course moves towards it. Gate
 * spacing, clearances, lane positions and finish line match the simulation. */
export class RoverView3D {
  private readonly renderer:THREE.WebGLRenderer;
  private readonly scene=new THREE.Scene();
  private readonly camera=new THREE.PerspectiveCamera(51,1,.1,180);
  private readonly course=new THREE.Group();
  private readonly rover=new THREE.Group();
  private readonly body=new THREE.Group();
  private readonly activeGate=new THREE.Group();
  private readonly cube=new THREE.BoxGeometry(1,1,1);
  private readonly lit=new THREE.MeshLambertMaterial();
  private readonly glow=new THREE.MeshBasicMaterial();
  private readonly badge=new THREE.Group();
  private readonly wheels:THREE.Group[]=[];
  private readonly thrusters=new THREE.Group();
  private readonly stars:THREE.Points;
  private lastWidth=0;
  private lastHeight=0;
  private disposed=false;
  private priorHull=3;
  private hitDistance=-100;

  constructor(private readonly canvas:HTMLCanvasElement) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'low-power'});
    try {
      this.scene.background=new THREE.Color(0x111932);
      this.scene.fog=new THREE.FogExp2(0x34405b,.021);
      this.scene.add(new THREE.HemisphereLight(0xf1e8ff,0x615682,1.9));
      const key=new THREE.DirectionalLight(0xffc69c,2.0);
      key.position.set(-13,18,9);
      this.scene.add(key,this.course,this.rover,this.activeGate);
      this.rover.name='rover';
      this.course.name='course';
      this.activeGate.name='guide';
      this.stars=this.buildSky();
      this.buildCourse();
      this.buildRover();
      this.buildGuide();
    } catch(error) {
      this.dispose();
      throw error;
    }
  }

  private buildSky():THREE.Points {
    const random=generator(9107);
    const coords:number[]=[];
    const colors:number[]=[];
    for(let i=0;i<340;i++){
      const angle=random()*Math.PI, radius=58+random()*40;
      coords.push(Math.cos(angle)*radius,5+random()*55,-Math.sin(angle)*radius);
      const brightness=.45+random()*.55;
      colors.push(brightness,brightness*.9,1);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const stars=new THREE.Points(geo,new THREE.PointsMaterial({size:.14,vertexColors:true,fog:false}));
    this.scene.add(stars);

    // An original ringed planet with terraced cloud belts and a star-lit rim.
    const planet=new THREE.Group();
    planet.position.set(-17,11,-55);
    planet.rotation.z=-.22;
    const globe=new THREE.Mesh(new THREE.IcosahedronGeometry(4.6,2),new THREE.MeshLambertMaterial({color:0xd78f90,flatShading:true,fog:false}));
    const rings=new THREE.Mesh(new THREE.RingGeometry(5.15,7.25,42),new THREE.MeshBasicMaterial({color:0xedbb9a,side:THREE.DoubleSide,fog:false}));
    rings.rotation.x=1.19;
    const gap=new THREE.Mesh(new THREE.RingGeometry(6.16,6.35,42),new THREE.MeshBasicMaterial({color:0x393751,side:THREE.DoubleSide,fog:false}));
    gap.rotation.copy(rings.rotation);gap.position.z=.025;
    planet.add(globe,rings,gap);this.scene.add(planet);
    return stars;
  }

  private buildCourse():void {
    const solids:Batch=[], lights:Batch=[];
    const rnd=generator(42041);
    const middle=-trackEnd/2;
    brick(solids,0,-.45,middle,125,.6,trackEnd+126,0x35304d);
    brick(solids,0,-.09,middle,11.7,.18,trackEnd+65,0x27364d);
    for(const side of [-1,1]) {
      brick(solids,side*5.73,.04,middle,.17,.12,trackEnd+60,0x626e83);
      brick(lights,side*5.74,.105,middle,.065,.02,trackEnd+60,0x81dbf0);
    }
    // Painted road seams pass below the axles at the same speed as the gates.
    for(let z=14; z>=-trackEnd-45;z-=2.8){
      for(const side of [-1,1]) {
        brick(lights,side*2.1,.008,z,.045,.012,1.05,0x70859b);
        brick(lights,side*5.36,.009,z,.27,.014,.78,0xffab69);
      }
      brick(solids,0,.006,z,10.4,.008,.04,0x384759);
    }
    for(let i=0;i<75;i++){
      const side=i%2===0 ? -1 : 1;
      const z=13-(i>>1)*6.5-rnd()*2;
      const x=side*(8.2+rnd()*3.2), height=1.65+rnd()*3.3, w=2.8+rnd()*3;
      brick(solids,x,height*.43,z,w,height*.86,3.4,0x79556c);
      brick(solids,x,.92*height,z,w*.90,height*.12,3.1,0xa17b80);
      brick(solids,x+side*.3,height*1.13,z,w*.72,height*.31,2.6,0x644d69);
      const crystalX=x+side*.6;
      brick(lights,crystalX,height*1.36,z,.18,.62,.18,i%3===1?0xffb385:0xa68bf4,.20*side);
      // Back wall: taller outcrops make the groove read as a real canyon.
      const ridge=height*1.8+1+rnd()*3;
      brick(solids,x+side*6.3,ridge*.5,z+1,6,ridge,6.3,0x514761);
      brick(solids,x+side*6.9,ridge+.56,z+1,4.5,1.12,5.4,0x675474);
    }

    for(let i=0;i<roverCourse.centers.length;i++) {
      const x=roverCourse.centers[i]*LANE;
      const z=-(i+1)*roverCourse.spacing*DEPTH;
      const outer=aperture+.24;
      for(const side of [-1,1]){
        const px=x+side*outer;
        brick(solids,px,.18,z,.73,.36,.83,0x425875);
        brick(solids,px,1.5,z,.48,2.8,.54,0x38516d);
        brick(solids,px,2.86,z,.72,.40,.72,0x627389);
        brick(lights,px,1.6,z+.282,.12,2.24,.018,0x71d3e5);
        for(let band=0;band<3;band++) brick(lights,px,.5+band*.22,z+.31,.4,.088,.04,0xffa76f);
      }
      brick(solids,x,3.11,z,2*outer+.48,.36,.58,0x394c67);
      brick(lights,x,3.10,z+.302,2*outer-.22,.066,.025,0x75d2eb);
      brick(solids,x,3.43,z,1.06,.28,.43,0x71839b);
    }
    this.course.add(instances(solids,this.cube,this.lit),instances(lights,this.cube,this.glow));
  }

  private buildGuide():void {
    const lights:Batch=[];
    const outer=aperture+.24;
    for(const side of [-1,1]) {
      brick(lights,side*outer,1.6,.31,.19,2.29,.022,0x9affdf);
      brick(lights,side*outer,2.85,.38,.59,.11,.02,0xffffff);
      brick(lights,side*(aperture-.22),.015,.35,.32,.024,1.0,0x8cffe1);
    }
    brick(lights,0,3.1,.33,2*outer-.23,.11,.02,0xd0fff5);
    this.activeGate.add(instances(lights,this.cube,this.glow));
    const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.27),new THREE.MeshBasicMaterial({color:0xffcc74}));
    crystal.scale.y=1.5;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.49,.024,4,4),new THREE.MeshBasicMaterial({color:0xffda98}));
    this.badge.add(crystal,ring);
    this.activeGate.add(this.badge);
  }

  private buildRover():void {
    const shell:Batch=[], lamps:Batch=[];
    // Six independently rolling tires, a stepped hull, and Bit's helmet
    // visible above the cockpit. Rear slats leave the road centre readable.
    brick(shell,0,.4,0,1.19,.29,1.91,0x454265);
    brick(shell,0,.67,.04,1.16,.3,1.64,0xa397df);
    brick(shell,0,.87,-.27,.98,.20,1.03,0xc9bcdf);
    brick(shell,0,1.06,-.20,.78,.25,.78,0x30465d);
    brick(shell,0,1.27,-.19,.68,.39,.57,0xa4c8d0);
    brick(shell,0,1.28,.106,.58,.23,.036,0x263955);
    for(const side of [-1,1]) {
      brick(shell,side*.24,1.52,-.2,.19,.16,.23,0xa4c8d0);
      brick(shell,side*.285,1.62,-.2,.097,.10,.21,0xa4c8d0);
      brick(lamps,side*.145,1.31,.128,.077,.078,.018,0x93fff2);
      brick(shell,side*.42,.87,.67,.23,.25,.52,0x685e91);
      brick(lamps,side*.42,.87,.943,.16,.083,.018,0xffad9e);
      brick(lamps,side*.61,.63,-.26,.05,.06,.84,0x80ffe2);
    }
    for(let i=0;i<3;i++) brick(shell,0,.835,.37+i*.17,.64,.065,.058,0x3d5169);
    brick(lamps,0,1.19,.128,.087,.038,.019,0x8dd9e2);
    this.body.add(instances(shell,this.cube,this.lit),instances(lamps,this.cube,this.glow));
    this.rover.add(this.body);

    const wheelGeo=new THREE.CylinderGeometry(.265,.265,.24,10);
    const rubber=new THREE.MeshLambertMaterial({color:0x263445,flatShading:true});
    const hubGeo=new THREE.CylinderGeometry(.137,.137,.252,8);
    const hubMaterial=new THREE.MeshLambertMaterial({color:0xa1a1ac});
    const wheelLights:Batch=[];
    for(const side of [-1,1]) {
      const treadSide=side*.136;
      brick(wheelLights,treadSide,.062,0,.024,.09,.045,0x89ffe1);
    }
    for(const side of [-1,1])for(const z of [-.63,0,.64]) {
      const pivot=new THREE.Group();
      pivot.position.set(side*.63,.27,z);
      const tire=new THREE.Mesh(wheelGeo,rubber);
      const hub=new THREE.Mesh(hubGeo,hubMaterial);
      tire.rotation.z=hub.rotation.z=Math.PI/2;
      pivot.add(tire,hub,instances(wheelLights,this.cube,this.glow));
      this.rover.add(pivot);
      this.wheels.push(pivot);
    }
    const flame:Batch=[];
    for(const x of [-.33,.33]) {
      brick(flame,x,.37,.97,.17,.17,.42,0x69dce4);
      brick(flame,x,.37,1.18,.088,.082,.28,0xbff9ec);
    }
    this.thrusters.add(instances(flame,this.cube,this.glow));
    this.rover.add(this.thrusters);
  }

  private resize():boolean {
    const cssW=this.canvas.clientWidth, cssH=this.canvas.clientHeight;
    if(cssW<=0 || cssH<=0) return false;
    const ratio=Math.min(globalThis.devicePixelRatio || 1,1.5,Math.sqrt(1_050_000/(cssW*cssH)),1536/cssW,1080/cssH);
    const w=Math.max(1,Math.round(cssW*ratio)), h=Math.max(1,Math.round(cssH*ratio));
    if(w!==this.lastWidth || h!==this.lastHeight) {
      this.lastWidth=w; this.lastHeight=h;
      this.renderer.setSize(w,h,false);
      this.camera.aspect=cssW/cssH;
      this.camera.updateProjectionMatrix();
    }
    return true;
  }

  draw(game:QuarryRover):void {
    if(this.disposed || !this.resize()) return;
    const x=game.lane*LANE, travelled=game.distance*DEPTH;
    if(game.hull<this.priorHull)this.hitDistance=game.distance;
    this.priorHull=game.hull;
    const hit=game.distance>=this.hitDistance && game.distance-this.hitDistance<.5;
    this.rover.position.x=x;
    this.rover.rotation.z=hit?Math.sin(game.distance*65)*.057:-game.lane*.022;
    this.body.position.y=Math.sin(travelled*2)*.013;
    for(const wheel of this.wheels) wheel.rotation.x=-travelled/.265;
    this.thrusters.scale.z=.94+.08*Math.sin(travelled*4);
    this.course.position.z=travelled;
    this.activeGate.visible=game.gates<roverCourse.centers.length && !game.lost;
    if(this.activeGate.visible) {
      this.activeGate.position.set(roverCourse.centers[game.gates]*LANE,0,travelled-(game.gates+1)*roverCourse.spacing*DEPTH);
      this.badge.position.set(0,1.45+Math.sin(travelled*.5)*.10,.12);
      this.badge.rotation.y=travelled*.12;
    }
    this.stars.rotation.y=game.lane*.005;
    this.camera.position.set(x*.46,3.22,6.1);
    this.camera.lookAt(x*.60,1.01,-8.3);
    this.renderer.render(this.scene,this.camera);
  }

  dispose():void {
    if(this.disposed)return;
    this.disposed=true;
    const geometries=new Set<THREE.BufferGeometry>([this.cube]);
    const materials=new Set<THREE.Material>([this.lit,this.glow]);
    this.scene.traverse(object=>{
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
      if(object instanceof THREE.InstancedMesh)object.dispose();
      geometries.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
    });
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
