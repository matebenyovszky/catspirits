/** Serialized into the classic pose worker: keep runtime dependencies inside.
 * Preserve native VideoFrame storage until the GPU image boundary. Never call
 * copyTo/getImageData here: the RGB-trained model still needs its RGB texture,
 * but no application-managed CPU RGBA buffer is needed. */
export function createPoseImageInput() {
  let canvas: OffscreenCanvas | undefined;
  let context: OffscreenCanvasRenderingContext2D | null = null;
  return (frame: VideoFrame, width: number, height: number) => {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width > 640 || height > 480) throw new Error('Invalid pose input dimensions');
    const format = frame.format?.toLowerCase() ?? 'opaque';
    if (width === frame.displayWidth && height === frame.displayHeight) {
      return { image: frame as TexImageSource, transport: `videoframe-${format}-direct` };
    }
    if (!canvas) {
      canvas = new OffscreenCanvas(width, height);
      // Do NOT request willReadFrequently: this surface is for GPU upload,
      // never CPU readback. Actual hardware acceleration is browser-dependent.
      context = canvas.getContext('2d', { alpha: false });
    }
    if (!context) throw new Error('Pose worker resize canvas unavailable');
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'low';
    context.drawImage(frame, 0, 0, width, height);
    return { image: canvas as TexImageSource, transport: `videoframe-${format}-worker-resize` };
  };
}
