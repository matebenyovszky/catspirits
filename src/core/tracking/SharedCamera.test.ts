import { expect, it, vi } from 'vitest';
import { SharedCamera, claimInference, releaseInference } from './SharedCamera';
const media=()=>{const stop=vi.fn();return {stop,stream:{getTracks:()=>[Object.assign(new EventTarget(),{stop})]} as unknown as MediaStream};};
it('shares a pending capture and never stops another consumer’s camera',async()=>{
  const source=media(), acquire=vi.fn(async()=>source.stream), camera=new SharedCamera(acquire);
  const nav=camera.claim('navigation'), game=camera.claim('game');
  expect(await nav.ready).toBe(await game.ready);expect(acquire).toHaveBeenCalledOnce();expect(camera.hasGame).toBe(true);
  nav.release();expect(source.stop).not.toHaveBeenCalled();game.release();game.release();expect(source.stop).toHaveBeenCalledOnce();expect(camera.hasGame).toBe(false);
});
it('reuses an unanswered permission prompt across a consumer restart and closes an unused grant', async () => {
  const source = media();
  let grant!: (stream: MediaStream) => void;
  const acquire = vi.fn(() => new Promise<MediaStream>(resolve => { grant = resolve; }));
  const camera = new SharedCamera(acquire);
  const first = camera.claim('navigation');
  first.release();
  const second = camera.claim('game');
  expect(second.ready).toBe(first.ready);
  expect(acquire).toHaveBeenCalledOnce();
  second.release();
  grant(source.stream);
  await second.ready;
  expect(source.stop).toHaveBeenCalledOnce();
});
it('shares a denial and opens a new request only on a subsequent explicit claim', async () => {
  const source = media();
  const denied = new DOMException('Denied', 'NotAllowedError');
  const acquire = vi.fn<() => Promise<MediaStream>>().mockRejectedValueOnce(denied).mockResolvedValueOnce(source.stream);
  const camera = new SharedCamera(acquire);
  const a = camera.claim('navigation'), b = camera.claim('game');
  await expect(a.ready).rejects.toBe(denied);
  await expect(b.ready).rejects.toBe(denied);
  expect(acquire).toHaveBeenCalledOnce();
  a.release(); b.release();
  const retry = camera.claim('game');
  expect(await retry.ready).toBe(source.stream);
  retry.release();
});
it('publishes hand-provider transitions so robot tracking can replace cursor inference',async()=>{
  const source=media(), camera=new SharedCamera(async()=>source.stream), change=vi.fn(), receive=vi.fn();const off=camera.subscribe(change), offHand=camera.onHand(receive);
  const nav=camera.claim('navigation'), robot=camera.claim('game-hand');await robot.ready;
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
