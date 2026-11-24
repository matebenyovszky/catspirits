import { expect, it } from 'vitest';
import { FourRingWandDetector } from '../tracking/sword/FourRingWandDetector';
import { SwordMeasurementGate } from '../tracking/sword/SwordMeasurementGate';
import { FestivalControls } from './controls';
import { bridgeSocket, Convoy } from './workshop';

const pink = [245, 35, 130, 255], green = [15, 225, 55, 255];
const cameras = [
  { width: 320, height: 240, pixelsPerCm: 4 },
  { width: 240, height: 320, pixelsPerCm: 3 },
];

// A horizontal prop seen by the unmirrored camera. Positions are measured
// from the centre of the outer green ring on the physical marker diagram.
const bands = [
  [-33, -27, pink], [-23, -20, pink], [-11, -8, green], [-3, 3, green],
] as const;
function cameraPicture(camera: typeof cameras[number], tip?: { x: number; y: number }, clutter = true) {
  const { width, height, pixelsPerCm } = camera;
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.fill(255);
  if (clutter) {
    // Colored LED speckles in the background cannot identify a wand.
    for (let i = 0; i < 180; i++) {
      const x = (113 * i + 31) % width, y = (79 * i + 17) % height;
      pixels.set(i % 2 ? pink : green, (y * width + x) * 4);
    }
  }
  if (tip) {
    const halfDiameter = pixelsPerCm * 1.25;
    for (const [start, end, color] of bands) {
      for (let y = Math.round(tip.y - halfDiameter); y < Math.round(tip.y + halfDiameter); y++) {
        for (let x = Math.round(tip.x + start * pixelsPerCm); x < Math.round(tip.x + end * pixelsPerCm); x++) {
          pixels.set(color, (y * width + x) * 4);
        }
      }
    }
  }
  return pixels;
}

it.each(cameras)('carries real pink/green pixels through tracking into a single bridge placement at $width×$height', camera => {
  const detector = new FourRingWandDetector(), gate = new SwordMeasurementGate(), controls = new FestivalControls();
  const game = new Convoy();
  let clock = 100;
  function process(pixels: Uint8ClampedArray) {
    clock += 33;
    const detected = detector.detect(pixels, camera.width, camera.height, clock);
    controls.sword(gate.accept(detected.frame, clock), clock, false);
    const input = controls.read(clock, true);
    const cue = input && game.update(.033, input);
    return { input, cue, detected };
  }

  // Column one's middle socket is well left of centre. Scoring here exercises
  // both the mirrored x axis and using the green tip rather than the pink base.
  const socket = bridgeSocket(1, 1);
  const tip = { x: (1 - socket.x / 800) * camera.width, y: socket.y / 560 * camera.height };
  const target = cameraPicture(camera, tip);
  const approach = cameraPicture(camera, { x: tip.x - .14 * camera.height, y: tip.y });
  const acquired = process(target);
  expect(acquired.detected.frame?.supportMask, acquired.detected.reason).toBe(15);
  expect(acquired.input?.action).toBe(false);
  expect(process(cameraPicture(camera, undefined, false)).input).toBeNull();
  const noise = cameraPicture(camera);
  for (let i = 0; i < 5; i++) expect(process(noise).input).toBeNull();
  expect(process(approach).input?.action).toBe(false);
  expect(game.score).toBe(0);

  const hit = process(target);
  // The moving tip can briefly leave the cropped search region. Three
  // measured bands can still reconstruct its position for this placement.
  expect(hit.detected.frame?.visibleRings, hit.detected.reason).toBeGreaterThanOrEqual(3);
  expect(hit.input?.x).toBeCloseTo(socket.x / 800, 2);
  expect(hit.input?.y).toBeCloseTo(socket.y / 560, 2);
  expect(hit.input?.action).toBe(true);
  expect(hit.cue).toBe('grab');
  expect(game.trail).toEqual([1, 1]);
  const score = game.score;
  expect(score).toBeGreaterThan(0);
  expect(process(target).input?.action).toBe(false);
  expect(game.score).toBe(score);
});
