// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { QuarryRover, roverCourse } from '../../core/festival/workshop';
import { RoverView3D } from './RoverView3D';

const calls=vi.hoisted(()=>({
  render:vi.fn<(scene:THREE.Scene,camera:THREE.PerspectiveCamera)=>void>(),
  resize:vi.fn(), dispose:vi.fn(), release:vi.fn(),
}));
vi.mock('three', async importOriginal => {
  const actual=await importOriginal<typeof import('three')>();
  return {...actual, WebGLRenderer:class {
    render=calls.render;
    setSize=calls.resize;
    dispose=calls.dispose;
    forceContextLoss=calls.release;
  }};
});

let canvas:HTMLCanvasElement, view:RoverView3D;
beforeEach(()=>{
  vi.clearAllMocks();
  canvas=document.createElement('canvas');
  Object.defineProperties(canvas,{
    clientWidth:{configurable:true,value:800},
    clientHeight:{configurable:true,value:560},
  });
  view=new RoverView3D(canvas);
});
afterEach(()=>{view.dispose();vi.unstubAllGlobals();});

it('renders the same consecutive gates, distance and passing coordinates as the simulation',()=>{
  const game=new QuarryRover();
  view.draw(game);
  const [scene,camera]=calls.render.mock.calls[0];
  const guide=scene.getObjectByName('guide')!, course=scene.getObjectByName('course')!;
  const rover=scene.getObjectByName('rover')!;
  expect(camera.isPerspectiveCamera).toBe(true);
  const spacing=-guide.position.z;
  const firstX=guide.position.x;
  game.lane=roverCourse.centers[0]; game.distance=roverCourse.spacing-.01;
  view.draw(game);
  expect(rover.position.x).toBeCloseTo(firstX);
  expect(guide.position.z).toBeCloseTo(course.position.z-spacing);
  game.update(.06,{x:.5+roverCourse.centers[0]/2.45,y:0,angle:0,action:false});
  expect(game.gates).toBe(1);expect(game.hull).toBe(3);
  view.draw(game);
  expect(guide.position.z).toBeCloseTo(course.position.z-2*spacing);
  expect(guide.position.x).toBeGreaterThan(0);
  game.gates=roverCourse.centers.length;
  view.draw(game);expect(guide.visible).toBe(false);
});

it('batches the canyon and caps resolution without reallocating the buffer every frame',()=>{
  vi.stubGlobal('devicePixelRatio',3);
  Object.defineProperties(canvas,{clientWidth:{value:2200},clientHeight:{value:1200}});
  const game=new QuarryRover();view.draw(game);view.draw(game);
  expect(calls.resize).toHaveBeenCalledOnce();
  const [w,h,style]=calls.resize.mock.calls[0];
  expect(w*h).toBeLessThan(1_060_000);expect(style).toBe(false);
  const [scene]=calls.render.mock.calls[0];
  const road=scene.getObjectByName('course')!;
  expect(road.children).toHaveLength(2);
  expect(road.children.every(object=>object instanceof THREE.InstancedMesh)).toBe(true);
});

it('releases shared geometry and GPU context once and stops rendering on disposal',()=>{
  view.draw(new QuarryRover());
  const [scene]=calls.render.mock.calls[0];
  const course=scene.getObjectByName('course')!;
  const geometry=(course.children[0] as THREE.Mesh).geometry;
  const release=vi.spyOn(geometry,'dispose');
  const callbacks=calls.render.mock.calls.length;
  view.dispose(); view.dispose(); view.draw(new QuarryRover());
  expect(release).toHaveBeenCalledOnce();
  expect(calls.dispose).toHaveBeenCalledOnce();expect(calls.release).toHaveBeenCalledOnce();
  expect(calls.render).toHaveBeenCalledTimes(callbacks);
});
