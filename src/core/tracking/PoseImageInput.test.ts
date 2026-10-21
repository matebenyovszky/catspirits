import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPoseImageInput } from './PoseImageInput';

afterEach(() => vi.unstubAllGlobals());
const frame = { displayWidth: 640, displayHeight: 480, format: 'NV12' } as VideoFrame;
describe('pose native image preparation', () => {
  it('passes a native frame directly with no canvas, pixel copy or resize', () => {
    const constructor = vi.fn(); vi.stubGlobal('OffscreenCanvas', constructor);
    expect(createPoseImageInput()(frame, 640, 480)).toEqual({ image: frame, transport: 'videoframe-nv12-direct' });
    expect(constructor).not.toHaveBeenCalled();
  });
  it('resizes inside the worker, reuses the surface and respects input size changes', () => {
    const context = { drawImage: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: '' };
    const getContext = vi.fn(() => context), created = vi.fn();
    vi.stubGlobal('OffscreenCanvas', class {
      getContext = getContext;
      constructor(public width: number, public height: number) { created(); }
    });
    const input = createPoseImageInput(), first = input(frame, 480, 360);
    const second = input(frame, 320, 240);
    expect(first.image).toBe(second.image);
    expect(second.image).toMatchObject({ width: 320, height: 240 });
    expect(second.transport).toBe('videoframe-nv12-worker-resize');
    expect(created).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith('2d', { alpha: false });
    expect(context.drawImage).toHaveBeenLastCalledWith(frame, 0, 0, 320, 240);
  });
  it('fails safely on unsupported canvas or invalid dimensions', () => {
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return null; } });
    expect(() => createPoseImageInput()(frame, 320, 240)).toThrow('unavailable');
    for (const width of [0, NaN, 1000, 300.5]) expect(() => createPoseImageInput()(frame, width, 240)).toThrow('dimensions');
  });
});
