import { expect, it, vi } from 'vitest';
import { SharedCamera, claimInference, releaseInference } from './SharedCamera';
const media=()=>{const stop=vi.fn();return {stop,stream:{getTracks:()=>[{stop}]} as unknown as MediaStream};};
it('shares a pending capture and never stops another consumer’s camera',async()=>{
  const camera=new SharedCamera(), source=media(), acquire=vi.fn(async()=>source.stream);
  const nav=camera.claim(acquire,'navigation'), game=camera.claim(acquire,'game');
  expect(await nav.ready).toBe(await game.ready);expect(acquire).toHaveBeenCalledOnce();expect(camera.hasGame).toBe(true);
  nav.release();expect(source.stop).not.toHaveBeenCalled();game.release();game.release();expect(source.stop).toHaveBeenCalledOnce();expect(camera.hasGame).toBe(false);
});
it('closes a cancelled late permission without touching a replacement capture',async()=>{
  const camera=new SharedCamera(), old=media(), current=media();let grant!:(stream:MediaStream)=>void;
  const first=camera.claim(()=>new Promise(resolve=>{grant=resolve;}),'navigation');first.release();
  const second=camera.claim(async()=>current.stream,'game');await second.ready;grant(old.stream);await first.ready;
  expect(old.stop).toHaveBeenCalledOnce();expect(current.stop).not.toHaveBeenCalled();second.release();
});
it('publishes hand-provider transitions so robot tracking can replace cursor inference',async()=>{
  const camera=new SharedCamera(), source=media(), change=vi.fn(), receive=vi.fn();const off=camera.subscribe(change), offHand=camera.onHand(receive);
  const nav=camera.claim(async()=>source.stream,'navigation'), robot=camera.claim(async()=>source.stream,'game-hand');await robot.ready;
  expect(camera.hasGameHands).toBe(true);nav.release();expect(source.stop).not.toHaveBeenCalled();
  camera.publishHand({timestampMs:1,landmarks:[],worldLandmarks:[],inferenceMs:0});expect(receive).toHaveBeenCalledOnce();robot.release();expect(camera.hasGameHands).toBe(false);expect(change).toHaveBeenCalledTimes(4);off();offHand();
});
it('does not overlap inference and does not let a stale completion release a different owner',()=>{
  const a={},b={};expect(claimInference(a)).toBe(true);expect(claimInference(b)).toBe(false);releaseInference(b);expect(claimInference(b)).toBe(false);releaseInference(a);expect(claimInference(b)).toBe(true);releaseInference(a);expect(claimInference(a)).toBe(false);releaseInference(b);releaseInference(a);
});

it('gives a waiting cursor a turn before the game can immediately claim another frame',()=>{
  const game={},cursor={};expect(claimInference(game)).toBe(true);expect(claimInference(cursor)).toBe(false);
  releaseInference(game);expect(claimInference(game)).toBe(false);expect(claimInference(cursor)).toBe(true);
  releaseInference(cursor);expect(claimInference(game)).toBe(true);releaseInference(game);
});
