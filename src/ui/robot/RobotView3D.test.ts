import { expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { tablePoint, toWorld } from './RobotView3D';
it('maps clicks on projected cells back to the same table-space targets', () => {
  const camera = new PerspectiveCamera(44, 1, .1, 60); camera.position.set(0, 10.8, 9.8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  for (const p of [{ x: .23, y: .3 }, { x: .77, y: .62 }, { x: .5, y: .74 }]) {
    const projected = toWorld(p).project(camera);
    const target = tablePoint(camera, (projected.x + 1) / 2, (1 - projected.y) / 2)!;
    expect(target.x).toBeCloseTo(p.x, 8); expect(target.y).toBeCloseTo(p.y, 8);
  }
  expect(tablePoint(camera, NaN, .5)).toBeNull();
  camera.lookAt(0, 20, 9.8); camera.updateMatrixWorld(); expect(tablePoint(camera, .5, .5)).toBeNull();
});

it('retargets elbow motion while preserving both link lengths and a safe table clearance', async () => {
  const { retargetElbow } = await import('./RobotView3D');
  const { BASE, LINKS } = await import('../../core/robot/RobotSimulation');
  for (const tool of [{x:.23,y:.3},{x:.77,y:.62},{x:.5,y:.74}]) {
    const a = retargetElbow(tool,{x:-1,y:.2,z:0}), b = retargetElbow(tool,{x:1,y:.2,z:0});
    expect(a.distanceTo(b)).toBeGreaterThan(.1);
    for (const elbow of [a,b,retargetElbow(tool,{x:0,y:-1,z:0})]) {
      expect(elbow.distanceTo(toWorld(BASE,1.65))).toBeCloseTo(LINKS[0]*10,6);
      expect(elbow.distanceTo(toWorld(tool,1.65))).toBeCloseTo(LINKS[1]*10,6);
      expect(elbow.y).toBeGreaterThanOrEqual(.59999);
    }
  }
});
