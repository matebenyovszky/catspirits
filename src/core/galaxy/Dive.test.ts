import { describe, expect, it } from 'vitest';
import { Dive, stations, totalLarvae } from './Dive';

describe('Galaxisfa expedition', () => {
  it.each([
    { order: 'listed', reversed: false },
    { order: 'reverse', reversed: true },
  ])('unlocks each current after every local larva is caught in $order order', ({ reversed }) => {
    const dive = new Dive();
    expect(dive.swim()).toBe(false);
    expect(dive.catch(stations[1].larvae[0].id)).toBeUndefined();
    expect(dive.findSeed(true)).toBe(false);

    for (const station of stations.slice(0, -1)) {
      expect(dive.station).toBe(station);
      const targets = reversed ? [...station.larvae].reverse() : station.larvae;
      for (const target of targets) {
        expect(dive.swim()).toBe(false);
        expect(dive.catch(target.id)).toBe(target);
        expect(dive.catch(target.id)).toBeUndefined();
      }
      expect(dive.swim()).toBe(true);
      expect(dive.swim()).toBe(false);
    }
    expect(dive.count).toBe(totalLarvae);
    expect(dive.lookingForSeed).toBe(true);
    expect(dive.findSeed(false)).toBe(false);
    expect(dive.findSeed(true)).toBe(true);
    expect(dive.findSeed(true)).toBe(false);
    expect(dive.complete).toBe(true);

    dive.reset();
    expect(dive.count).toBe(0);
    expect(dive.stage).toBe(0);
    expect(dive.complete).toBe(false);
    expect(dive.catch(stations[0].larvae[0].id)).toBeDefined();
  });
});

it('lets divers revisit a branch with their collection intact', () => {
  const dive = new Dive();
  expect(dive.back()).toBe(false);
  for (const target of dive.station.larvae) dive.catch(target.id);
  expect(dive.swim()).toBe(true);
  const firstOfNext = dive.station.larvae[0];
  expect(dive.catch(firstOfNext.id)).toBe(firstOfNext);
  expect(dive.back()).toBe(true);
  expect(dive.count).toBe(3);
  expect(dive.canSwimBack).toBe(false);
  expect(dive.canSwim).toBe(true);
  expect(dive.swim()).toBe(true);
  expect(dive.collected(firstOfNext.id)).toBe(true);
  expect(dive.canSwim).toBe(false);
});
