# Deploy Catspirits to Cloudflare Workers

The existing **catspirits** Worker is connected to **matebenyovszky/catspirits** and the custom domain **catspirits.com**. This repository deploys the built game using **Workers Static Assets**. No application-side Worker script, database, API keys or runtime secrets are needed.

## Build settings

In the Worker's **Settings → Builds** section:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` (repository root) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | `24.15.0`, specified by `.node-version` |

The build generates `dist`. `wrangler.jsonc` identifies that directory with `assets.directory`, names the existing Worker `catspirits`, and declares the already assigned `catspirits.com` custom domain. The `workers.dev` and preview URLs remain disabled, matching the current dashboard settings.

Pushes to `main` trigger Cloudflare's connected build and production deployment. The GitHub Actions workflow separately tests and builds the game without deployment credentials. Verify `https://catspirits.com/?lang=en`, `https://catspirits.com/?lang=hu` and `https://catspirits.com/?lang=de` after a successful deployment.

Official references: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Why the first deployment failed

The game build succeeded, but the first repository configuration used `pages_build_output_dir`, which belongs to Cloudflare Pages. The connected service is a Worker and runs `wrangler deploy`, so it could not find either a Worker entry point or a static assets directory. Workers Static Assets uses `assets.directory: "./dist"` instead. This site does not need `main` because it serves static assets directly.

## Local preview and validation

```sh
npm ci
npm run build
npm run check:cloudflare
npm run preview:cloudflare
```

`check:cloudflare` runs a deployment dry run without uploading. `preview:cloudflare` serves the static output on `http://127.0.0.1:8788` using the Workers runtime. Neither publishes anything. `npm run preview` provides the simpler Vite preview.

## Optional command-line deployment

For an authenticated Cloudflare account with access to the existing Worker:

```sh
npx wrangler login
npm run deploy:cloudflare
```

This builds the game and executes `wrangler deploy`. The repository configuration contains no credentials or account IDs.

## Browser resources and security

`public/_headers` supplies content-type protection, no-referrer, camera-only permissions, same-origin resource protection, clickjacking protection and a limited CSP. The standalone game may only be embedded by the same origin; cross-site iframes are intentionally blocked. Link to the game from other sites instead. [Workers Static Assets supports these headers](https://developers.cloudflare.com/workers/static-assets/headers/).

The enforced CSP restricts network, image, media, style, font, worker and frame destinations and prohibits inline event-handler attributes, plugins, forms and base-URL overrides. It intentionally does **not** enforce `script-src` or `default-src`: Cloudflare Bot Fight Mode injects dynamic inline JavaScript, and a completely static site cannot produce fresh response nonces. No static nonce or `unsafe-inline` script exception is added. This is a limited policy, not full protection against script injection. Stronger script enforcement needs a separate design that preserves bot protection; do not disable Bot Fight Mode or add `no-transform` just to suppress its scripts. [Cloudflare's CSP requirements for JavaScript Detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/#if-you-have-a-content-security-policy-csp).

`npm run prepare:camera` runs before dev/build. It copies the unchanged WASM files from the pinned npm package and verifies the checked-in Google model SHA-256. All camera resources are served locally under versioned `assets/mediapipe/` paths and cached for one year. Change those paths whenever their contents change; do not overwrite immutable versions. Only the SIMD or non-SIMD variant needed by the browser loads. Runtime assets are generated from the lockfile, never committed. The model's official licence source is listed in the distributed notices.

There is no application Worker script. [Static asset requests are free and unlimited](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/); they do not invoke user Worker code. This does not mean that every Cloudflare feature, plan or future backend is free. Keep `run_worker_first` absent and do not introduce per-request server code without reviewing costs.
