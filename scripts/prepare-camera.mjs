import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('node_modules/@mediapipe/tasks-vision/package.json', root), 'utf8'));
if (packageJson.version !== '0.10.32') throw new Error('Review camera asset paths and licences before updating MediaPipe.');
const modelPath = new URL('public/assets/mediapipe/pose-lite-v1/pose_landmarker_lite.task', root);
const expected = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';
if (createHash('sha256').update(await readFile(modelPath)).digest('hex') !== expected) throw new Error('Pose model integrity check failed.');
const destination = new URL('public/assets/mediapipe/runtime-0.10.32/', root);
await mkdir(destination, { recursive: true });
for (const name of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  await copyFile(new URL(`node_modules/@mediapipe/tasks-vision/wasm/${name}`, root), new URL(name, destination));
}
console.log('Verified pinned pose model; prepared local MediaPipe assets:', fileURLToPath(destination));
