import { describe, expect, it } from 'vitest';
import { RunnerSimulation } from './RunnerSimulation';
import type { MotionInput } from './types';

const running = (runSpeed = 1): MotionInput => ({
  tracked: true, calibrated: true, calibrationProgress: 1,
  runSpeed, jump: false, crouch: false, lane: 0,
});

function advance(simulation: RunnerSimulation, seconds: number, input = running()) {
  for (let index = 0; index < Math.round(seconds * 60); index++) simulation.update(1 / 60, input);
  return { ...simulation.state };
}

function approach(simulation: RunnerSimulation, distance: number, input = running()) {
  for (let index = 0; index < 30000 && simulation.state.obstacleDistance > distance; index++) {
    simulation.update(1 / 60, input);
  }
  expect(simulation.state.obstacleDistance).toBeLessThanOrEqual(distance);
}

describe('RunnerSimulation', () => {
  it('advances in proportion to running speed and stops when the player stops', () => {
    const simulation = new RunnerSimulation();
    expect(advance(simulation, 1, running(0.5))).toMatchObject({ paused: false, height: 0, cleared: 0, missed: 0 });
    expect(simulation.state.distance).toBeCloseTo(1.75);
    expect(simulation.state.obstacleDistance).toBeCloseTo(5.25);
    const distance = simulation.state.distance;
    const obstacleDistance = simulation.state.obstacleDistance;
    advance(simulation, 1, running(0));
    expect(simulation.state).toMatchObject({ distance, obstacleDistance });
  });

  it('consumes each jump request once even when the camera input remains on the same frame', () => {
    const simulation = new RunnerSimulation();
    const heldCameraFrame = { ...running(0), jump: true };
    simulation.jump();
    expect(simulation.update(1 / 60, heldCameraFrame).height).toBeGreaterThan(0);
    // A detector frame can be rendered many times. The explicit request is the event bridge.
    advance(simulation, 1, heldCameraFrame);
    expect(simulation.state.height).toBe(0);
    expect(advance(simulation, 1, heldCameraFrame).height).toBe(0);
    simulation.jump();
    expect(simulation.update(1 / 60, heldCameraFrame).height).toBeGreaterThan(0);
  });

  it('discards jump requests made in midair instead of bouncing again on landing', () => {
    const simulation = new RunnerSimulation();
    simulation.jump();
    advance(simulation, 0.25, running(0));
    simulation.jump();
    advance(simulation, 1, running(0));
    expect(simulation.state.height).toBe(0);
    expect(advance(simulation, 1, running(0)).height).toBe(0);
  });

  it('turns measured jump strength into a proportionally higher arc', () => {
    const peak = (strength: number) => {
      const simulation = new RunnerSimulation();
      simulation.jump(strength);
      let height = 0;
      for (let index = 0; index < 120; index++) {
        height = Math.max(height, simulation.update(1 / 60, running(0)).height);
      }
      return height;
    };
    const small = peak(.2), large = peak(1);
    expect(small).toBeGreaterThan(.24);
    expect(large).toBeGreaterThan(small + .6);
  });

  it('carries running momentum through a jump even if camera cadence temporarily drops', () => {
    const simulation = new RunnerSimulation();
    advance(simulation, .5, running(.8));
    simulation.jump(.6);
    simulation.update(1 / 60, running(.8));
    const takeoffDistance = simulation.state.distance;
    for (let index = 0; index < 36; index++) simulation.update(1 / 60, running(0));
    expect(simulation.state.height).toBeGreaterThan(0);
    expect(simulation.state.distance - takeoffDistance).toBeGreaterThan(1.5);
  });

  it.each([{ tracked: false }, { calibrated: false }])('pauses all progress and drops pending jumps for %j', (missing) => {
    const simulation = new RunnerSimulation();
    const pausedInput = { ...running(), ...missing };
    advance(simulation, 0.5);
    const before = { ...simulation.state };
    simulation.jump();
    expect(advance(simulation, 2, pausedInput)).toEqual({ ...before, paused: true });
    expect(simulation.update(1 / 60, running()).height).toBe(0);
    expect(simulation.state.distance).toBeGreaterThan(before.distance);
  });

  it('finishes an airborne trajectory during tracking loss without advancing the course', () => {
    const paused = new RunnerSimulation();
    const uninterrupted = new RunnerSimulation();
    paused.jump();
    uninterrupted.jump();
    advance(paused, 0.25);
    advance(uninterrupted, 0.25);
    const distance = paused.state.distance;
    expect(paused.state.height).toBeGreaterThan(0);
    expect(advance(paused, 3, { ...running(), tracked: false }).height).toBe(0);
    expect(paused.state.distance).toBe(distance);
    expect(paused.update(1 / 60, running()).height).toBe(0);
  });

  it('counts a grounded collision once and recycles the obstacle for later collisions', () => {
    const simulation = new RunnerSimulation();
    approach(simulation, 0.25);
    expect(simulation.state).toMatchObject({ missed: 1, cleared: 0 });
    advance(simulation, 0.2);
    expect(simulation.state.missed).toBe(1);
    advance(simulation, 0.4);
    expect(simulation.state.obstacleDistance).toBeGreaterThan(5);
    approach(simulation, 0.25);
    expect(simulation.state).toMatchObject({ missed: 2, cleared: 0 });
  });

  it('clears an obstacle when the player jumps on approach', () => {
    const simulation = new RunnerSimulation();
    approach(simulation, 1.3);
    simulation.jump();
    approach(simulation, 0.25);
    expect(simulation.state.height).toBeGreaterThan(0.24);
    expect(simulation.state).toMatchObject({ cleared: 1, missed: 0 });
    advance(simulation, 0.25);
    expect(simulation.state.cleared).toBe(1);
  });

  it('preserves enough decaying running momentum to clear a correctly timed jump', () => {
    const simulation = new RunnerSimulation();
    approach(simulation, 1.3);
    simulation.jump();
    for (let index = 1; index <= 45; index++) {
      simulation.update(1 / 60, running(Math.exp(-(index / 60) / 0.7)));
    }
    expect(simulation.state).toMatchObject({ cleared: 1, missed: 0 });
  });

  it.each([1, 0.3, 0.05])('times the companion jump to collision at running speed %s', (runSpeed) => {
    const simulation = new RunnerSimulation();
    const input = running(runSpeed);
    let launches = 0;
    for (let index = 0; index < 30000 && simulation.state.missed === 0; index++) {
      const previousHeight = simulation.state.companionHeight;
      simulation.update(1 / 60, input);
      if (previousHeight === 0 && simulation.state.companionHeight > 0) launches++;
    }
    expect(simulation.state.missed).toBe(1);
    expect(launches).toBe(1);
    expect(simulation.state.companionHeight).toBeGreaterThan(0.24);
  });

  it('does not make the companion repeatedly jump when running stops near an obstacle', () => {
    const simulation = new RunnerSimulation();
    approach(simulation, 0.6);
    const stopped = running(0);
    advance(simulation, 1, stopped);
    expect(simulation.state.companionHeight).toBe(0);
    for (let index = 0; index < 120; index++) {
      expect(simulation.update(1 / 60, stopped).companionHeight).toBe(0);
    }
    approach(simulation, 0.25);
    expect(simulation.state.companionHeight).toBeGreaterThan(0.24);
  });

  it('keeps the companion timing correct across successive obstacles', () => {
    const simulation = new RunnerSimulation();
    let launches = 0;
    for (let index = 0; index < 1800 && simulation.state.missed < 3; index++) {
      const previousHeight = simulation.state.companionHeight;
      const previousMisses = simulation.state.missed;
      simulation.update(1 / 60, running(0.5));
      if (previousHeight === 0 && simulation.state.companionHeight > 0) launches++;
      if (simulation.state.missed > previousMisses) expect(simulation.state.companionHeight).toBeGreaterThan(0.24);
    }
    expect(simulation.state.missed).toBe(3);
    expect(launches).toBe(3);
  });

  it('resets pending events, scores, position and companion movement', () => {
    const simulation = new RunnerSimulation();
    advance(simulation, 2.2);
    simulation.jump();
    simulation.reset();
    expect(simulation.state).toEqual({
      distance: 0, cleared: 0, missed: 0, height: 0,
      companionHeight: 0, obstacleDistance: 7, paused: true,
    });
    expect(simulation.update(1 / 60, running(0)).height).toBe(0);
  });
});
